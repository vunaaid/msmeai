// src/app/(dashboard)/ai/chat/[agentId]/page.tsx
// AI Chat Page — multi-turn conversation with an agent

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSkill, initSkillRegistry } from "@vsme/ai-sdk";
import { AIChatClient } from "./chat-client";
import { join } from "node:path";

// Initialize skill registry
const skillsDir = process.env["SKILLS_DIR"] ?? join(process.cwd(), "../../../../skills");
initSkillRegistry(skillsDir);

export default async function AIChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { agentId } = await params;
  const { session: sessionId } = await searchParams;

  const skill = getSkill(agentId);
  if (!skill) {
    redirect("/ai");
  }

  return (
    <AIChatClient
      agentId={agentId}
      agentName={skill.displayName}
      agentLevel={skill.level}
      agentDepartment={skill.department}
      initialSessionId={sessionId ?? null}
      userId={session.user.id}
      companyName={session.user.companyName}
      aiMode={session.user.aiMode ?? "assistant"}
    />
  );
}
