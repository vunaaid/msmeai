// src/lib/agent-exec.ts
// Hàng đợi worker (Postgres): scan WorkItem agentJob=true status='active', claim atomic,
// load skill nhân viên (CompanyAgent persona) rồi thực thi qua executeAsStaff (Claude CLI + MCP).

import { prisma } from "@vsme/db/client";
import { executeAsStaff, auditByManager, type ExecAgent, type RouteCtx } from "../modules/chat/agent-reply.js";

const MAX_ATTEMPTS = 3;

/** Claim 1 job khả dụng (atomic): active + agentJob → in_progress. Trả workItemId hoặc null. */
async function claimJob(): Promise<string | null> {
  const candidate = await prisma.workItem.findFirst({
    // Điều phối tuần tự: việc con chỉ chạy sau khi việc cha đã hoàn thành
    // (tránh hạch toán/duyệt chạy trước khi việc gốc xong → double-book).
    where: {
      agentJob: true,
      status: "active",
      OR: [{ parentId: null }, { parent: { status: "completed" } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!candidate) return null;

  // Atomic: chỉ 1 worker thắng (status còn 'active' mới update được).
  const claimed = await prisma.workItem.updateMany({
    where: { id: candidate.id, status: "active" },
    data: { status: "in_progress", startedAt: new Date(), agentAttempts: { increment: 1 } },
  });
  return claimed.count === 1 ? candidate.id : null;
}

/** Thực thi 1 job: load skill nhân viên + chạy executeAsStaff; xử lý retry/hủy nếu lỗi. */
export async function executeStaffWorkItem(workItemId: string): Promise<void> {
  const wi = await prisma.workItem.findUnique({ where: { id: workItemId } });
  if (!wi || !wi.aiAssignee) return;

  const ca = await prisma.companyAgent.findFirst({
    where: { companyId: wi.companyId, agentId: wi.aiAssignee },
    select: {
      agentId: true, displayName: true, department: true, level: true,
      systemPrompt: true, model: true, provider: true, allowTools: true, credentialId: true,
      persona: { select: { id: true, roleId: true, managerId: true } },
    },
  });
  if (!ca?.persona) return;

  const company = await prisma.company.findUnique({ where: { id: wi.companyId }, select: { name: true } });
  const c = (wi.agentContext ?? {}) as {
    conversationId?: string; convType?: string; memberIds?: string[]; approverName?: string;
  };

  const exec: ExecAgent = {
    userId: ca.persona.id, roleId: ca.persona.roleId, managerId: ca.persona.managerId,
    agentId: ca.agentId, displayName: ca.displayName, department: ca.department, level: ca.level,
    systemPrompt: ca.systemPrompt, model: ca.model, provider: ca.provider, allowTools: ca.allowTools,
    credentialId: ca.credentialId,
  };
  const ctx: RouteCtx = {
    conversationId: c.conversationId ?? "", convType: c.convType ?? "direct",
    companyId: wi.companyId, companyName: company?.name ?? "",
    memberIds: c.memberIds ?? [], senderId: "", execAgents: [],
  };
  const approver = c.approverName ? ({ displayName: c.approverName } as ExecAgent) : null;

  await executeAsStaff(ctx, exec, { title: wi.title, description: wi.description ?? undefined }, workItemId, "Hệ thống", approver);

  // executeAsStaff đặt completed/pending_approval khi xong. Nếu vẫn in_progress → coi như lỗi.
  const after = await prisma.workItem.findUnique({ where: { id: workItemId }, select: { status: true, agentAttempts: true } });
  if (after?.status === "in_progress") {
    const retry = (after.agentAttempts ?? MAX_ATTEMPTS) < MAX_ATTEMPTS;
    await prisma.workItem.update({
      where: { id: workItemId },
      data: retry ? { status: "active" } : { status: "cancelled", completionNote: "Worker thất bại sau nhiều lần thử" },
    }).catch(() => {});
    return;
  }

  // Nhân viên đã ra kết quả → cấp quản lý (agent) AUDIT lại với role quản lý.
  if (after?.status === "completed" || after?.status === "pending_approval") {
    await auditByManager(wi.companyId, company?.name ?? "", exec, workItemId).catch((e) =>
      console.error(`[audit] lỗi audit ${workItemId.slice(0, 8)}:`, e));
  }
}

// ─── Bộ kéo queue in-process (on-demand) ───────────────────────────────────────
// Cho phép chính process API tự thực thi job ngay khi giao việc, KHÔNG phụ thuộc
// process worker.ts riêng (vốn thường không chạy trong PM2 web+api).
//   • Chưa chạy  → khởi động drain ngay (việc chạy luôn).
//   • Đang chạy  → chỉ cần đánh dấu, việc mới đã nằm trong queue sẽ được nhặt tuần tự.
// Atomic-claim ở claimJob() chống trùng nếu worker.ts cũng đang chạy song song.

let draining = false;        // có một vòng drain đang chạy?
let pending  = false;        // có việc mới cần kéo?
const QUEUE_CONCURRENCY = Number(process.env["AGENT_WORKER_CONCURRENCY"] ?? 3);

async function drainLoop(maxConcurrent: number): Promise<void> {
  try {
    while (pending) {
      pending = false;
      // Kéo tới khi hết việc claim được (việc con sẽ đủ điều kiện sau khi cha xong).
      while ((await runQueueOnce(maxConcurrent)) > 0) { /* tiếp tục */ }
    }
  } catch (e) {
    console.error("[agent-queue] lỗi drain:", e instanceof Error ? e.message : e);
  } finally {
    draining = false;
    // Chốt race: nếu có việc được thêm ngay trước khi tắt cờ → khởi động lại.
    if (pending) ensureQueueRunning(maxConcurrent);
  }
}

/**
 * Đảm bảo hàng đợi agent-job đang được kéo. Gọi sau khi giao việc cho agent.
 * - Nếu chưa có vòng drain → khởi động ngay (fire-and-forget).
 * - Nếu đã có → chỉ đánh dấu pending; vòng hiện tại sẽ kéo tiếp.
 */
export function ensureQueueRunning(maxConcurrent = QUEUE_CONCURRENCY): void {
  pending = true;
  if (draining) return;
  draining = true;
  void drainLoop(maxConcurrent);
}

/** Quét hàng đợi 1 lượt: claim tối đa `maxConcurrent` job & chạy song song. Trả số job đã chạy. */
export async function runQueueOnce(maxConcurrent = 3): Promise<number> {
  const ids: string[] = [];
  for (let i = 0; i < maxConcurrent; i++) {
    const id = await claimJob();
    if (!id) break;
    ids.push(id);
  }
  if (ids.length === 0) return 0;

  await Promise.allSettled(ids.map((id) =>
    executeStaffWorkItem(id).catch(async (e) => {
      const wi = await prisma.workItem.findUnique({ where: { id }, select: { agentAttempts: true } });
      const retry = (wi?.agentAttempts ?? MAX_ATTEMPTS) < MAX_ATTEMPTS;
      await prisma.workItem.update({
        where: { id },
        data: retry ? { status: "active" } : { status: "cancelled", completionNote: `Lỗi worker: ${e instanceof Error ? e.message : String(e)}` },
      }).catch(() => {});
    }),
  ));
  return ids.length;
}
