// apps/ai-worker/src/index.ts
// vSME BullMQ Worker — xử lý AI tasks, notifications, reports, domain events

import { startEventWorker, onEvent } from "@vsme/audit/event-bus";
import { initSkillRegistry } from "@vsme/ai-sdk";
import { startNotificationWorker } from "./handlers/notification.handler.js";
import { startAITaskWorker } from "./handlers/ai-task.handler.js";
import { prisma } from "@vsme/db/client";
import { join } from "node:path";

console.log("🚀 vSME AI Worker starting...");

// ─── Initialize Skill Registry ────────────────────────────────────────────────

const skillsDir = process.env["SKILLS_DIR"] ?? join(process.cwd(), "../../skills");
initSkillRegistry(skillsDir);

// ─── Domain Event Handlers ────────────────────────────────────────────────────

// Handler: Invoice confirmed → GL bút toán
onEvent("invoice.outgoing.confirmed", async (job) => {
  const { companyId, payload } = job.data;
  console.log(`[EventBus] Invoice confirmed → creating GL journal for company ${companyId}`);
  // TODO: Implement GL journal creation when GL module is built
  console.log("  Invoice ID:", (payload as { invoiceId?: string }).invoiceId);
});

// Handler: AR payment received → GL bút toán
onEvent("ar.payment.received", async (job) => {
  const { companyId, payload } = job.data;
  console.log(`[EventBus] AR Payment received for company ${companyId}`, payload);
});

// Handler: AP payment made → GL bút toán
onEvent("ap.payment.made", async (job) => {
  const { companyId, payload } = job.data;
  console.log(`[EventBus] AP Payment made for company ${companyId}`, payload);
});

// Handler: Approval request created → Notify assignee
onEvent("approval.request.created", async (job) => {
  const { companyId, payload } = job.data;
  const { assignedTo, title, requestId } = payload as {
    assignedTo?: string;
    title?: string;
    requestId?: string;
  };

  if (assignedTo) {
    await prisma.notification.create({
      data: {
        companyId,
        userId: assignedTo,
        type: "approval.request.created",
        title: `Yêu cầu phê duyệt: ${title ?? "Xem chi tiết"}`,
        body: `Bạn có một yêu cầu phê duyệt mới cần xử lý.`,
        channel: "inapp",
        data: { requestId },
      },
    }).catch((err) => console.error("[EventBus] Notify error:", err));
  }
});

// Handler: AI approval request created → Notify approver
onEvent("ai.approval_request.created", async (job) => {
  const { companyId, payload } = job.data;
  const { approver, agentId, action, approvalRequestId } = payload as {
    approver?: string;
    agentId?: string;
    action?: string;
    approvalRequestId?: string;
  };

  if (approver) {
    // Find users with this role level
    const users = await prisma.user.findMany({
      where: {
        companyId,
        isActive: true,
        ...(["board", "c_suite", "manager", "staff"].includes(approver ?? "")
          ? { role: { level: approver as never } }
          : { id: approver }),
      },
      select: { id: true },
    });

    if (users.length > 0) {
      await prisma.notification.createMany({
        data: users.map((u) => ({
          companyId,
          userId: u.id,
          type: "ai.approval_request.created",
          title: `AI cần phê duyệt: ${action ?? "Xem chi tiết"}`,
          body: `Agent ${agentId} đang chờ bạn phê duyệt hành động.`,
          channel: "inapp" as const,
          data: { approvalRequestId, agentId, action },
        })),
      }).catch((err) => console.error("[EventBus] AI notify error:", err));
    }
  }
});

// Handler: Module enabled/disabled → Log
onEvent("module.enabled", async (job) => {
  console.log(`[EventBus] Module enabled:`, job.data.payload);
});

onEvent("module.disabled", async (job) => {
  console.log(`[EventBus] Module disabled:`, job.data.payload);
});

// Handler: Support ticket SLA warning
onEvent("support.ticket.sla_warning", async (job) => {
  const { companyId, payload } = job.data;
  const { assigneeId, ticketNumber } = payload as {
    assigneeId?: string;
    ticketNumber?: string;
  };

  if (assigneeId) {
    await prisma.notification.create({
      data: {
        companyId,
        userId: assigneeId,
        type: "support.ticket.sla_warning",
        title: `⚠️ SLA sắp vi phạm: Ticket #${ticketNumber}`,
        body: `Ticket #${ticketNumber} sẽ vi phạm SLA trong 30 phút. Xử lý ngay!`,
        channel: "inapp",
      },
    }).catch(() => {});
  }
});

// ─── Start Workers ────────────────────────────────────────────────────────────

// Domain events worker (concurrency 20)
const eventWorker = startEventWorker(20);

// Notification worker (concurrency 10)
const notifWorker = startNotificationWorker(10);

// AI tasks worker (concurrency 5 — LLM calls are expensive)
const aiWorker = startAITaskWorker(5);

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async function shutdown() {
  console.log("\n🛑 Shutting down workers...");
  await Promise.all([
    eventWorker.close(),
    notifWorker.close(),
    aiWorker.close(),
  ]);
  await prisma.$disconnect();
  console.log("✅ Workers stopped gracefully");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("✅ Workers running:");
console.log("   - events (concurrency: 20)");
console.log("   - notifications (concurrency: 10)");
console.log("   - ai-tasks (concurrency: 5)");
console.log("\nPress Ctrl+C to stop");
