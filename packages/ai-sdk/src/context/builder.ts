// packages/ai-sdk/src/context/builder.ts
// Context Builder — assembles the business context for an AI agent

import { prisma } from "@vsme/db/client";
import type { SkillDefinition } from "../skill/types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentContext {
  company: {
    id: string;
    name: string;
    taxCode: string;
    aiMode: "full" | "assistant";
  };
  user: {
    id: string;
    name: string;
    email: string;
    roleLevel: string;
  };
  agent: {
    agentId: string;
    displayName: string;
    level: string;
    department: string;
  };
  enabledModules: string[];
  pendingApprovals: number;
  /** Recent domain events relevant to this agent */
  recentEvents: Array<{
    eventType: string;
    sourceModule: string;
    publishedAt: Date;
  }>;
  /** Additional context data passed per request */
  requestData?: Record<string, unknown>;
}

// ─── Context Builder ──────────────────────────────────────────────────────────

/**
 * Build context for an AI agent session
 * Pulls company info, enabled modules, pending approvals, recent events
 */
export async function buildAgentContext(
  companyId: string,
  userId: string,
  skill: SkillDefinition,
  requestData?: Record<string, unknown>
): Promise<AgentContext> {
  // Parallel fetches
  const [company, user, moduleConfigs, pendingCount, recentEvents] =
    await Promise.all([
      prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { id: true, name: true, taxCode: true, ai_mode: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: { select: { level: true } },
        },
      }),
      prisma.moduleConfig.findMany({
        where: { companyId, enabled: true },
        select: { moduleKey: true },
      }),
      prisma.aIApprovalRequest.count({
        where: {
          companyId,
          decision: null,
          agentId: skill.agentId,
        },
      }),
      prisma.domainEvent.findMany({
        where: {
          companyId,
          status: { in: ["processed", "pending"] },
          sourceModule: { in: skill.modules.length > 0 ? skill.modules : undefined },
        },
        orderBy: { publishedAt: "desc" },
        take: 10,
        select: { eventType: true, sourceModule: true, publishedAt: true },
      }),
    ]);

  return {
    company: {
      id: company.id,
      name: company.name,
      taxCode: company.taxCode,
      aiMode: company.ai_mode as "full" | "assistant",
    },
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roleLevel: user.role?.level ?? "staff",
    },
    agent: {
      agentId: skill.agentId,
      displayName: skill.displayName,
      level: skill.level,
      department: skill.department,
    },
    enabledModules: moduleConfigs.map((m) => m.moduleKey),
    pendingApprovals: pendingCount,
    recentEvents: recentEvents.map((e) => ({
      eventType: e.eventType,
      sourceModule: e.sourceModule,
      publishedAt: e.publishedAt,
    })),
    requestData,
  };
}

/**
 * Serialize context to inject into system prompt
 */
export function serializeContext(ctx: AgentContext): string {
  const lines: string[] = [
    `## Ngữ Cảnh Hiện Tại`,
    `- Công ty: **${ctx.company.name}** (MST: ${ctx.company.taxCode})`,
    `- Người dùng: **${ctx.user.name}** (${ctx.user.email})`,
    `- Modules đang bật: ${ctx.enabledModules.join(", ") || "Chưa có"}`,
    `- Approval đang chờ: ${ctx.pendingApprovals} mục`,
  ];

  if (ctx.recentEvents.length > 0) {
    lines.push(`\n### Events Gần Đây`);
    for (const e of ctx.recentEvents.slice(0, 5)) {
      const ago = Math.round((Date.now() - e.publishedAt.getTime()) / 60000);
      lines.push(`- [${e.sourceModule}] ${e.eventType} — ${ago} phút trước`);
    }
  }

  if (ctx.requestData && Object.keys(ctx.requestData).length > 0) {
    lines.push(`\n### Dữ Liệu Request`);
    lines.push("```json");
    lines.push(JSON.stringify(ctx.requestData, null, 2));
    lines.push("```");
  }

  return lines.join("\n");
}
