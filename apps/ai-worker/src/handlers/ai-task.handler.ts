// apps/ai-worker/src/handlers/ai-task.handler.ts
// BullMQ handler for AI task queue — processes agent runs

import { Worker, Queue, type Job, type ConnectionOptions } from "bullmq";
import { prisma } from "@vsme/db/client";
import { runAgent } from "@vsme/ai-sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AITaskJobData {
  type: "agent_run" | "approve_ai_action" | "reject_ai_action";
  // For agent_run:
  agentId?: string;
  userId?: string;
  companyId?: string;
  sessionId?: string | null;
  userMessage?: string;
  requestData?: Record<string, unknown>;
  // For approve/reject:
  approvalRequestId?: string;
  decidedBy?: string;
  comment?: string;
}

// ─── Redis Connection ─────────────────────────────────────────────────────────

function getRedisConnection(): ConnectionOptions {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname || "localhost",
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

// ─── AI Tasks Queue ───────────────────────────────────────────────────────────

let _aiTasksQueue: Queue | null = null;

export function getAITasksQueue(): Queue {
  if (!_aiTasksQueue) {
    _aiTasksQueue = new Queue("ai-tasks", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "fixed", delay: 5000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return _aiTasksQueue;
}

/**
 * Enqueue an agent run job
 */
export async function enqueueAgentRun(data: {
  agentId: string;
  userId: string;
  companyId: string;
  sessionId: string | null;
  userMessage: string;
  requestData?: Record<string, unknown>;
}): Promise<string> {
  const job = await getAITasksQueue().add(
    "agent_run",
    { type: "agent_run", ...data },
    { priority: 5 }
  );
  return job.id ?? "";
}

// ─── AI Task Worker ───────────────────────────────────────────────────────────

export function startAITaskWorker(concurrency = 5): Worker {
  const worker = new Worker<AITaskJobData>(
    "ai-tasks",
    async (job: Job<AITaskJobData>) => {
      const { type } = job.data;

      switch (type) {
        case "agent_run":
          await handleAgentRun(job.data);
          break;
        case "approve_ai_action":
          await handleApproveAIAction(job.data);
          break;
        case "reject_ai_action":
          await handleRejectAIAction(job.data);
          break;
        default:
          console.warn(`[AITaskWorker] Unknown job type: ${type}`);
      }
    },
    {
      connection: getRedisConnection(),
      concurrency,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[AITaskWorker] Job completed: ${job.id} (${job.data.type})`);
  });

  worker.on("failed", (job, error) => {
    console.error(
      `[AITaskWorker] Job failed: ${job?.id} (${job?.data?.type}):`,
      error.message
    );
  });

  console.log(`[AITaskWorker] Started (concurrency: ${concurrency})`);
  return worker;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleAgentRun(data: AITaskJobData): Promise<void> {
  const { agentId, userId, companyId, sessionId, userMessage, requestData } = data;

  if (!agentId || !userId || !companyId || !userMessage) {
    throw new Error("[AITaskWorker] Missing required fields for agent_run");
  }

  try {
    const result = await runAgent({
      agentId,
      userId,
      companyId,
      sessionId: sessionId ?? null,
      userMessage,
      requestData,
    });

    console.log(
      `[AITaskWorker] Agent run complete: ${agentId} ` +
      `(${result.provider}/${result.model}, ` +
      `${result.usage.inputTokens}/${result.usage.outputTokens} tokens, ` +
      `$${result.usage.costUsd.toFixed(4)})`
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[AITaskWorker] Agent run failed: ${agentId}:`, errMsg);
    throw error;
  }
}

async function handleApproveAIAction(data: AITaskJobData): Promise<void> {
  const { approvalRequestId, decidedBy, comment } = data;

  if (!approvalRequestId || !decidedBy) {
    throw new Error("[AITaskWorker] Missing required fields for approve_ai_action");
  }

  const request = await prisma.aIApprovalRequest.update({
    where: { id: approvalRequestId },
    data: {
      decision: "approved",
      decidedBy,
      decidedAt: new Date(),
      comment,
    },
    include: { task: true },
  });

  // Update task status back to running so it can continue
  await prisma.aITask.update({
    where: { id: request.taskId },
    data: { status: "running" },
  });

  // Re-enqueue the agent to continue from where it left off
  if (request.task.sessionId) {
    await enqueueAgentRun({
      agentId: request.agentId,
      userId: decidedBy,
      companyId: request.companyId,
      sessionId: request.task.sessionId,
      userMessage: `✅ Hành động "${request.action}" đã được phê duyệt. Tiếp tục thực hiện.`,
      requestData: {
        approvalGranted: true,
        approvalRequestId,
        originalAction: request.action,
        originalInput: request.actionInput,
      },
    });
  }

  console.log(`[AITaskWorker] Approved AI action: ${approvalRequestId}`);
}

async function handleRejectAIAction(data: AITaskJobData): Promise<void> {
  const { approvalRequestId, decidedBy, comment } = data;

  if (!approvalRequestId || !decidedBy) {
    throw new Error("[AITaskWorker] Missing required fields for reject_ai_action");
  }

  const request = await prisma.aIApprovalRequest.update({
    where: { id: approvalRequestId },
    data: {
      decision: "rejected",
      decidedBy,
      decidedAt: new Date(),
      comment,
    },
    include: { task: true },
  });

  // Mark task as completed (rejected)
  await prisma.aITask.update({
    where: { id: request.taskId },
    data: {
      status: "completed",
      output: { rejected: true, rejectedBy: decidedBy, comment, approvalRequestId },
      completedAt: new Date(),
    },
  });

  // Notify the agent session that action was rejected
  if (request.task.sessionId) {
    await prisma.aIMessage.create({
      data: {
        sessionId: request.task.sessionId,
        role: "system",
        content: `⛔ Hành động "${request.action}" đã bị từ chối bởi ${decidedBy}. Lý do: ${comment ?? "Không có ghi chú"}`,
      },
    });
  }

  console.log(`[AITaskWorker] Rejected AI action: ${approvalRequestId}`);
}
