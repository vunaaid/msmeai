// src/lib/agent-claude.ts
// API CHUẨN để AI agent gọi Claude CLI. Nhận credential đã resolve (resolveAgentCredential)
// rồi dựng option nhất quán (model, credentialEnv, cwd, tools/MCP) và gọi runClaude/streamClaude.
// MỌI agent dùng Claude CLI nên đi qua đây để đồng nhất hành vi credential + tool + env.

import { runClaude, streamClaude, type ClaudeResult, type ClaudeStreamEvent } from "./claude.js";
import { claudeCredentialEnv, type ResolvedCredential } from "./llm-credential.js";

export interface AgentClaudeCall {
  prompt: string;
  systemPrompt?: string;
  /** Bật tool. Truyền mcpServers/allowedTools cũng được coi là bật tool. */
  allowTools?: boolean;
  mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
  allowedTools?: string[];
  cwd?: string;
  timeout?: number;
}

/** Chuẩn hóa option Claude CLI từ credential đã resolve + tham số gọi. */
function buildOpts(resolved: ResolvedCredential, call: AgentClaudeCall) {
  return {
    prompt: call.prompt,
    model: resolved.model,
    ...(call.systemPrompt ? { systemPrompt: call.systemPrompt } : {}),
    cwd: call.cwd ?? "/tmp",
    credentialEnv: claudeCredentialEnv(resolved),
    ...(call.mcpServers ? { mcpServers: call.mcpServers } : {}),
    ...(call.allowedTools && call.allowedTools.length > 0
      ? { allowedTools: call.allowedTools }
      : { noTools: !call.allowTools }),
    ...(call.timeout ? { timeout: call.timeout } : {}),
  };
}

/** Gọi Claude CLI cho agent (non-streaming). Yêu cầu resolved.provider === "claude". */
export function runClaudeForAgent(resolved: ResolvedCredential, call: AgentClaudeCall): Promise<ClaudeResult> {
  return runClaude(buildOpts(resolved, call));
}

/** Gọi Claude CLI cho agent (streaming SSE). Yêu cầu resolved.provider === "claude". */
export function streamClaudeForAgent(resolved: ResolvedCredential, call: AgentClaudeCall): AsyncGenerator<ClaudeStreamEvent> {
  return streamClaude(buildOpts(resolved, call));
}
