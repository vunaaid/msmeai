// src/app/(dashboard)/ai/claude/page.tsx
import type { Metadata } from "next";
import { ClaudeChat } from "./claude-chat";

export const metadata: Metadata = { title: "Claude AI Chat" };

export default function ClaudeChatPage() {
  return <ClaudeChat />;
}
