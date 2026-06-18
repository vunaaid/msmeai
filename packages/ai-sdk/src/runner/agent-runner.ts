// packages/ai-sdk/src/runner/agent-runner.ts
// Agent Runner — orchestrates one agent turn (session-based chat)

import { prisma } from "@vsme/db/client";
import { createJournalEntry } from "@vsme/db";
import { getLLMRouter, estimateCost } from "@vsme/llm";
import type { LLMMessage, LLMResponse, ToolDefinition, LLMRequest } from "@vsme/llm";
import type { Prisma } from "@vsme/db";
import { getSkill, buildSystemPrompt } from "../skill/parser.js";
import { buildAgentContext, serializeContext } from "../context/builder.js";
import { checkAuthority, applyModeOverride } from "../authority/checker.js";
import { handleEscalation } from "../escalation/engine.js";
import { getToolsForLevel } from "../tools/definitions.js";
import type { SkillDefinition } from "../skill/types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RunAgentParams {
  /** Agent skill ID */
  agentId: string;
  /** User requesting the agent */
  userId: string;
  /** Company context */
  companyId: string;
  /** Existing session ID (for multi-turn) or null to start new */
  sessionId: string | null;
  /** User's message */
  userMessage: string;
  /** Additional context data */
  requestData?: Record<string, unknown>;
}

export interface AgentRunResult {
  sessionId: string;
  messageId: string;
  text: string;
  /** Any approval requests created */
  approvalRequestIds: string[];
  /** Any tasks created */
  taskIds: string[];
  /** Whether more actions were taken */
  toolCallsMade: number;
  provider: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costUsd: number;
  };
}

// ─── Tool Executor ────────────────────────────────────────────────────────────

interface ToolExecutor {
  (
    toolName: string,
    toolInput: Record<string, unknown>,
    context: {
      skill: SkillDefinition;
      companyId: string;
      userId: string;
      taskId: string;
      aiMode: "full" | "assistant";
    }
  ): Promise<{ result: string; approvalRequestId?: string; taskId?: string }>;
}

// Tool execution — authority checked before execution
const executeToolWithAuthority: ToolExecutor = async (
  toolName,
  toolInput,
  context
) => {
  const { skill, companyId, aiMode, taskId } = context;

  // Map tool name to authority action
  const actionMap: Record<string, string> = {
    "approve_document": "approve",
    "create_approval_request": "create_approval",
    "send_notification": "send_notification",
    "create_task": "create_task",
    "get_report": "read.report",
    "search_database": "read",
    "get_module_summary": "read",
    "escalate_to_superior": "escalate",
  };

  const action = actionMap[toolName] ?? toolName;

  // Check authority
  const authorityResult = checkAuthority(skill, {
    action,
    fields: toolInput,
    agentId: skill.agentId,
    companyId,
  });

  const effectiveResult = applyModeOverride(authorityResult, aiMode);

  if (effectiveResult.result === "NOT_ALLOWED") {
    return { result: `❌ Từ chối: ${effectiveResult.reason}` };
  }

  if (effectiveResult.result === "NEEDS_APPROVAL" || effectiveResult.result === "ESCALATE") {
    const { approvalRequestId, message } = await handleEscalation({
      skill,
      taskId,
      action,
      actionInput: toolInput,
      authorityResult: effectiveResult,
      companyId,
    });
    return { result: message, approvalRequestId };
  }

  // SELF_EXECUTE — perform the actual action
  return await executeTool(toolName, toolInput, context);
};

// Actual tool implementations
async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: { skill: SkillDefinition; companyId: string; userId: string; taskId: string }
): Promise<{ result: string; taskId?: string }> {
  const { companyId, userId } = context;

  switch (toolName) {
    case "search_database": {
      const { module, query, limit = 10 } = toolInput as {
        module: string; query: string; limit?: number;
      };
      // TODO: Implement actual search per module
      // For now return a placeholder
      return {
        result: JSON.stringify({
          module,
          query,
          results: [],
          note: `Tìm kiếm trong module "${module}" với query: "${query}" — module chưa được implement`
        })
      };
    }

    case "get_module_summary": {
      const { module, period = "this_month" } = toolInput as {
        module: string; period?: string;
      };
      return {
        result: JSON.stringify({
          module,
          period,
          summary: `Tóm tắt module "${module}" kỳ "${period}" — module chưa được implement`
        })
      };
    }

    case "send_notification": {
      const { to, title, message, type = "info" } = toolInput as {
        to: string; title: string; message: string; type?: string;
      };

      // Find target users
      let userIds: string[] = [];

      if (to === "all") {
        const users = await prisma.user.findMany({
          where: { companyId, isActive: true },
          select: { id: true }
        });
        userIds = users.map(u => u.id);
      } else if (["board", "c_suite", "manager", "staff"].includes(to)) {
        const users = await prisma.user.findMany({
          where: { companyId, isActive: true, role: { level: to as never } },
          select: { id: true }
        });
        userIds = users.map(u => u.id);
      } else {
        userIds = [to];
      }

      await prisma.notification.createMany({
        data: userIds.map(uid => ({
          companyId,
          userId: uid,
          type: `ai.notification.${type}`,
          title,
          body: message,
          channel: "inapp",
        }))
      });

      return { result: `✅ Đã gửi thông báo "${title}" đến ${userIds.length} người dùng` };
    }

    case "create_task": {
      const { title, description, assignee, dueDate, priority = "medium", module } = toolInput as {
        title: string; description?: string; assignee: string;
        dueDate?: string; priority?: string; module?: string;
      };

      const task = await prisma.aITask.create({
        data: {
          companyId,
          agentId: context.skill.agentId,
          title,
          description,
          status: "queued",
          priority: priority === "urgent" ? 1 : priority === "high" ? 3 : priority === "low" ? 8 : 5,
          input: { assignee, dueDate, module, createdBy: userId },
        }
      });

      return {
        result: `✅ Đã tạo task "${title}" cho ${assignee}${dueDate ? ` (hạn: ${dueDate})` : ""}. ID: ${task.id}`,
        taskId: task.id
      };
    }

    case "get_report": {
      const { reportType, period } = toolInput as { reportType: string; period: string };
      return {
        result: JSON.stringify({
          reportType,
          period,
          data: {},
          note: `Báo cáo "${reportType}" kỳ "${period}" — chức năng báo cáo sẽ available sau khi module Reports được bật`
        })
      };
    }

    case "approve_document": {
      const { approvalRequestId, decision, comment } = toolInput as {
        approvalRequestId: string; decision: string; comment?: string;
      };

      await prisma.aIApprovalRequest.update({
        where: { id: approvalRequestId },
        data: {
          decision: decision as "approved" | "rejected",
          decidedBy: userId,
          decidedAt: new Date(),
          comment,
        }
      });

      return {
        result: `✅ Đã ${decision === "approved" ? "phê duyệt" : "từ chối"} yêu cầu ${approvalRequestId}${comment ? `. Ghi chú: ${comment}` : ""}`
      };
    }

    case "escalate_to_superior": {
      const { issue, toAgent = context.skill.reportsTo ?? "ceo", urgency = "normal", data } = toolInput as {
        issue: string; toAgent?: string; urgency?: string; data?: Record<string, unknown>;
      };

      // Create notification for the superior
      const superiorAgent = toAgent;
      // Find users with that role level
      const roleLevelMap: Record<string, string> = {
        "ceo": "c_suite",
        "board_chair": "board",
      };
      const roleLevel = roleLevelMap[superiorAgent] ?? "c_suite";

      const superiorUsers = await prisma.user.findMany({
        where: { companyId, isActive: true, role: { level: roleLevel as never } },
        select: { id: true }
      });

      if (superiorUsers.length > 0) {
        await prisma.notification.createMany({
          data: superiorUsers.map(u => ({
            companyId,
            userId: u.id,
            type: "ai.escalation",
            title: `🚨 Cần xử lý: ${issue.slice(0, 50)}`,
            body: `Agent ${context.skill.displayName} đã escalate: ${issue}`,
            channel: "inapp",
            data: { urgency, data, fromAgent: context.skill.agentId } as unknown as Prisma.InputJsonValue,
          }))
        });
      }

      return {
        result: `✅ Đã escalate vấn đề lên ${superiorAgent}: "${issue}". Đã thông báo ${superiorUsers.length} người.`
      };
    }

    case "create_journal_entry": {
      const { date, description, journalCode, lines } = toolInput as {
        date?: string;
        description?: string;
        journalCode?: string;
        lines?: { accountCode?: string; debit?: number; credit?: number; description?: string }[];
      };

      const entryDate = (date && /^\d{4}-\d{2}-\d{2}$/.test(date))
        ? date
        : new Date().toISOString().slice(0, 10);

      const res = await createJournalEntry({
        companyId,
        createdBy: userId,
        date: entryDate,
        description,
        journalCode,
        lines: (lines ?? []).map((l) => ({
          accountCode: l.accountCode,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
        })),
        status: "pending", // chờ Kế toán trưởng kiểm tra & ghi sổ
      });

      if (!res.ok) {
        return { result: `❌ Không lập được bút toán: ${res.error}` };
      }
      return {
        result:
          `✅ Đã lập bút toán ${res.entry.number} (trạng thái: chờ ghi sổ) — ` +
          `tổng phát sinh ${res.entry.totalDebit.toLocaleString("vi-VN")} đ. ` +
          `Cần Kế toán trưởng/CFO kiểm tra & ghi sổ.`,
      };
    }

    default:
      return { result: `⚠️ Tool "${toolName}" chưa được implement` };
  }
}

// ─── Main Agent Runner ────────────────────────────────────────────────────────

export async function runAgent(params: RunAgentParams): Promise<AgentRunResult> {
  const { agentId, userId, companyId, sessionId, userMessage, requestData } = params;

  // Load skill
  const skill = getSkill(agentId);
  if (!skill) {
    throw new Error(`[AgentRunner] Unknown agent: ${agentId}`);
  }

  // Build context
  const ctx = await buildAgentContext(companyId, userId, skill, requestData);
  const aiMode = ctx.company.aiMode;

  // Get or create session
  let session;
  if (sessionId) {
    session = await prisma.aISession.findUniqueOrThrow({ where: { id: sessionId } });
  } else {
    session = await prisma.aISession.create({
      data: {
        companyId,
        userId,
        agentId,
        mode: aiMode,
        status: "active",
        title: userMessage.slice(0, 80),
      }
    });
  }

  // Create AI task to track this run
  const task = await prisma.aITask.create({
    data: {
      companyId,
      sessionId: session.id,
      agentId,
      title: userMessage.slice(0, 80),
      status: "running",
      priority: 5,
      input: { userMessage, requestData } as unknown as Prisma.InputJsonValue,
    }
  });

  // Load conversation history from session
  const history = await prisma.aIMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    take: 20, // Last 20 messages for context
  });

  // Build messages array
  const messages: LLMMessage[] = [
    ...history.map((m) => ({
      role: m.role as LLMMessage["role"],
      content: m.content,
    })),
    { role: "user" as const, content: userMessage },
  ];

  // Build system prompt with context
  const systemPrompt =
    buildSystemPrompt(skill, aiMode) + "\n\n" + serializeContext(ctx);

  // Get tools for this agent's level
  const tools: ToolDefinition[] = getToolsForLevel(skill.level);

  // LLM router
  const router = getLLMRouter();

  const request: LLMRequest = {
    system: systemPrompt,
    messages,
    tools,
    maxTokens: 4096,
    temperature: 0.3,
    preferProvider: skill.preferredProvider,
    model: skill.preferredModel,
  };

  const approvalRequestIds: string[] = [];
  const createdTaskIds: string[] = [];
  let toolCallsMade = 0;
  let finalText = "";
  let lastResponse = await router.complete(request);

  // Log usage
  await logUsage(companyId, session.id, task.id, agentId, lastResponse);

  // Agentic loop — handle tool calls
  const toolCallMessages: LLMMessage[] = [];

  while (lastResponse.stopReason === "tool_use" && lastResponse.toolCalls.length > 0) {
    toolCallsMade += lastResponse.toolCalls.length;

    // Build tool results
    const toolResultParts: Array<{
      type: "tool_result";
      tool_call_id: string;
      content: string;
    }> = [];

    for (const toolCall of lastResponse.toolCalls) {
      const { result, approvalRequestId, taskId: createdTaskId } = await executeToolWithAuthority(
        toolCall.name,
        toolCall.input,
        { skill, companyId, userId, taskId: task.id, aiMode }
      );

      if (approvalRequestId) approvalRequestIds.push(approvalRequestId);
      if (createdTaskId) createdTaskIds.push(createdTaskId);

      toolResultParts.push({
        type: "tool_result",
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    // Add assistant message with tool calls and tool results
    toolCallMessages.push(
      {
        role: "assistant" as const,
        content: lastResponse.toolCalls.map((tc) => ({
          type: "tool_call" as const,
          id: tc.id,
          name: tc.name,
          input: tc.input,
        })),
      },
      {
        role: "tool" as const,
        content: toolResultParts,
      }
    );

    // Continue conversation with tool results
    const continueRequest: LLMRequest = {
      ...request,
      messages: [...messages, ...toolCallMessages],
    };

    lastResponse = await router.complete(continueRequest);
    await logUsage(companyId, session.id, task.id, agentId, lastResponse);
  }

  finalText = lastResponse.text;

  // Save user message to DB
  await prisma.aIMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content: userMessage,
    }
  });

  // Save assistant response to DB
  const assistantMessage = await prisma.aIMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content: finalText,
      provider: lastResponse.provider as "claude" | "gemini" | "ollama",
      model: lastResponse.model,
      inputTokens: lastResponse.usage.inputTokens,
      outputTokens: lastResponse.usage.outputTokens,
    }
  });

  // Update task to completed
  await prisma.aITask.update({
    where: { id: task.id },
    data: {
      status: approvalRequestIds.length > 0 ? "awaiting_approval" : "completed",
      output: { text: finalText, toolCallsMade, approvalRequestIds, createdTaskIds },
      completedAt: new Date(),
    }
  });

  const totalCost = estimateCost(lastResponse.usage, lastResponse.model);

  return {
    sessionId: session.id,
    messageId: assistantMessage.id,
    text: finalText,
    approvalRequestIds,
    taskIds: createdTaskIds,
    toolCallsMade,
    provider: lastResponse.provider,
    model: lastResponse.model,
    usage: {
      inputTokens: lastResponse.usage.inputTokens,
      outputTokens: lastResponse.usage.outputTokens,
      cacheReadTokens: lastResponse.usage.cacheReadTokens,
      costUsd: totalCost,
    },
  };
}

// ─── Usage Logger ─────────────────────────────────────────────────────────────

async function logUsage(
  companyId: string,
  sessionId: string,
  taskId: string,
  agentId: string,
  response: LLMResponse
): Promise<void> {
  const cost = estimateCost(response.usage, response.model);

  await prisma.lLMUsageLog.create({
    data: {
      companyId,
      sessionId,
      taskId,
      agentId,
      provider: response.provider as "claude" | "gemini" | "ollama",
      model: response.model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      cacheTokens: response.usage.cacheReadTokens,
      costUsd: cost,
      latencyMs: response.latencyMs,
      success: true,
    }
  }).catch((err) => {
    console.error("[AgentRunner] Failed to log usage:", err);
  });
}
