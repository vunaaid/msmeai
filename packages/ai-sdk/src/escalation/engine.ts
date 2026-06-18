// packages/ai-sdk/src/escalation/engine.ts
// Escalation Engine — routes tasks to superior agents when needed

import { prisma } from "@vsme/db/client";
import type { Prisma } from "@vsme/db";
import type { SkillDefinition } from "../skill/types.js";
import type { AuthorityCheckResult } from "../skill/types.js";
import { getSkill } from "../skill/parser.js";

// ─── Org Hierarchy ────────────────────────────────────────────────────────────
// Level hierarchy for reference (not used directly — hierarchy via reportsTo chain)

/**
 * Find the appropriate escalation target
 * Returns the agentId of who should handle this escalation
 */
export function findEscalationTarget(
  skill: SkillDefinition,
  authorityResult: AuthorityCheckResult
): string | null {
  // If authority result specifies an approver
  if (authorityResult.approver) {
    // If approver looks like an agentId (contains underscore or is known level)
    const knownLevels = ["board", "c_suite", "manager", "staff"];
    if (!knownLevels.includes(authorityResult.approver)) {
      // Treat as specific agentId
      return authorityResult.approver;
    }
  }

  // Otherwise escalate to direct manager
  if (skill.reportsTo) {
    return skill.reportsTo;
  }

  // If no manager defined, escalate to CEO
  return "ceo";
}

// ─── Escalation Record ────────────────────────────────────────────────────────

export interface EscalationParams {
  companyId: string;
  fromAgentId: string;
  toAgentId: string;
  taskId: string;
  action: string;
  authorityResult: AuthorityCheckResult;
  actionInput: Record<string, unknown>;
  reason?: string;
}

/**
 * Create an AIApprovalRequest for an escalation/approval needed scenario
 */
export async function createApprovalRequest(
  params: EscalationParams
): Promise<string> {
  const request = await prisma.aIApprovalRequest.create({
    data: {
      companyId: params.companyId,
      taskId: params.taskId,
      agentId: params.fromAgentId,
      action: params.action,
      authorityResult: params.authorityResult.result,
      reason: params.reason ?? params.authorityResult.reason,
      approver: params.toAgentId,
      actionInput: params.actionInput as unknown as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  // Update task status to awaiting_approval
  await prisma.aITask.update({
    where: { id: params.taskId },
    data: { status: "awaiting_approval" },
  });

  return request.id;
}

// ─── Escalation Chain Resolver ────────────────────────────────────────────────

/**
 * Resolve the full escalation chain for a given agent
 * Returns ordered list from immediate superior to board
 */
export function resolveEscalationChain(
  agentId: string
): string[] {
  const chain: string[] = [];
  let current = agentId;
  const visited = new Set<string>();

  while (current && !visited.has(current)) {
    visited.add(current);
    const skill = getSkill(current);
    if (!skill?.reportsTo) break;
    chain.push(skill.reportsTo);
    current = skill.reportsTo;
  }

  return chain;
}

// ─── Auto-Escalation Handler ──────────────────────────────────────────────────

/**
 * Handle escalation result from authority check:
 * - Create approval request
 * - Notify the approver
 * - Return the approval request ID
 */
export async function handleEscalation(params: {
  skill: SkillDefinition;
  taskId: string;
  action: string;
  actionInput: Record<string, unknown>;
  authorityResult: AuthorityCheckResult;
  companyId: string;
}): Promise<{ approvalRequestId: string; message: string }> {
  const { skill, taskId, action, actionInput, authorityResult, companyId } = params;

  const toAgentId = findEscalationTarget(skill, authorityResult);

  if (!toAgentId) {
    throw new Error(`[Escalation] Cannot find escalation target for ${skill.agentId}`);
  }

  const approvalRequestId = await createApprovalRequest({
    companyId,
    fromAgentId: skill.agentId,
    toAgentId,
    taskId,
    action,
    authorityResult,
    actionInput,
  });

  const targetSkill = getSkill(toAgentId);
  const targetName = targetSkill?.displayName ?? toAgentId;

  const message =
    authorityResult.result === "ESCALATE"
      ? `Hành động "${action}" đã được chuyển lên **${targetName}** để xử lý. ID: ${approvalRequestId}`
      : `Hành động "${action}" đang chờ phê duyệt từ **${targetName}**. ID: ${approvalRequestId}`;

  return { approvalRequestId, message };
}
