// src/app/(dashboard)/admin/agents/page.tsx
// Màn hình quản trị AI Agents trong khu Quản Trị Hệ Thống (/admin).
// Khu /admin đã được guard bởi admin/layout.tsx (chỉ company_admin/system_admin).
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@vsme/db/client";
import { AgentsAdminClient } from "./agents-admin-client";
import { getAllAgents, initSkillRegistry, SUPPORTED_MODELS } from "@vsme/ai-sdk";
import { join } from "node:path";

export const metadata: Metadata = { title: "Quản Lý AI Agents" };

const skillsDir = process.env["SKILLS_DIR"] ?? join(process.cwd(), "../../skills");
initSkillRegistry(skillsDir);

export default async function AdminAgentsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const companyId = session.user.companyId;

  const [dbAgents, credentials] = await Promise.all([
    prisma.companyAgent.findMany({
      where: { companyId },
      orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
      include: {
        _count: { select: { sessions: true } },
        credential: { select: { id: true, label: true, provider: true } },
      },
    }),
    prisma.companyLlmCredential.findMany({
      where: { companyId },
      orderBy: [{ isDefault: "desc" }, { label: "asc" }],
      // KHÔNG select apiKeyEnc — key không bao giờ rời server
      select: {
        id: true, label: true, provider: true, baseUrl: true, defaultModel: true,
        isActive: true, isDefault: true, apiKeyEnc: true, createdAt: true,
      },
    }),
  ]);

  const fileAgents = getAllAgents();

  return (
    <AgentsAdminClient
      dbAgents={dbAgents.map(a => ({
        id: a.id,
        agentId: a.agentId,
        displayName: a.displayName,
        description: a.description,
        department: a.department,
        level: a.level,
        systemPrompt: a.systemPrompt,
        model: a.model,
        provider: a.provider,
        allowTools: a.allowTools,
        icon: a.icon,
        isActive: a.isActive,
        isCustom: a.isCustom,
        sortOrder: a.sortOrder,
        credentialId: a.credentialId,
        credential: a.credential,
        sessionCount: a._count.sessions,
      }))}
      fileAgents={fileAgents.map(a => ({
        agentId:     a.agentId,
        displayName: a.displayName,
        department:  a.department ?? null,
        level:       a.level,
        description: null as string | null,
      }))}
      credentials={credentials.map(c => ({
        id: c.id,
        label: c.label,
        provider: c.provider,
        baseUrl: c.baseUrl,
        defaultModel: c.defaultModel,
        isActive: c.isActive,
        isDefault: c.isDefault,
        hasKey: !!c.apiKeyEnc,
        createdAt: c.createdAt.toISOString(),
      }))}
      supportedModels={SUPPORTED_MODELS}
      companyId={companyId}
    />
  );
}
