// src/app/(dashboard)/ai/admin/agents/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@vsme/db/client";
import { AgentsAdminClient } from "./agents-admin-client";
import { getAllAgents, initSkillRegistry } from "@vsme/ai-sdk";
import { join } from "node:path";

export const metadata: Metadata = { title: "Quản Lý AI Agents" };

const skillsDir = process.env["SKILLS_DIR"] ?? join(process.cwd(), "../../skills");
initSkillRegistry(skillsDir);

export default async function AgentsAdminPage() {
  const session = await auth();
  if (!session) redirect("/login");

  if (session.user.accountType !== "company_admin" && !session.user.isSuperAdmin) {
    redirect("/ai");
  }

  const companyId = session.user.companyId;

  // DB agents của công ty
  const dbAgents = await prisma.companyAgent.findMany({
    where: { companyId },
    orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
    include: {
      _count: { select: { sessions: true } },
    },
  });

  // File-based agents
  const fileAgents = getAllAgents();

  return (
    <AgentsAdminClient
      dbAgents={dbAgents.map(a => ({
        ...a,
        sessionCount: a._count.sessions,
      }))}
      fileAgents={fileAgents.map(a => ({
        agentId:     a.agentId,
        displayName: a.displayName,
        department:  a.department ?? null,
        level:       a.level,
        description: null as string | null,
      }))}
      companyId={companyId}
    />
  );
}
