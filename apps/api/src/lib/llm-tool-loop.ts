// src/lib/llm-tool-loop.ts
// Vòng lặp function-calling cho agent NON-Claude (gemini/ollama/openai).
// Dùng adapter packages/llm (qua re-export @vsme/ai-sdk) + registry tool dùng chung.
// Claude KHÔNG đi qua đây (vẫn dùng MCP/Claude CLI).

import {
  GeminiAdapter, OllamaAdapter, OpenAICompatAdapter,
  type LLMMessage, type LLMResponse, type ToolDefinition,
} from "@vsme/ai-sdk";
import type { ResolvedCredential } from "./llm-credential.js";
import { getAgentTools, executeAgentTool, type ToolCtx } from "./agent-tool-registry.js";

export interface ToolLoopResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  toolCallsMade: number;
  durationMs: number;
}

interface LLMProviderLike {
  complete(req: {
    system?: string; messages: LLMMessage[]; tools?: ToolDefinition[]; model?: string; maxTokens?: number;
  }): Promise<LLMResponse>;
}

/** Dựng adapter theo credential đã resolve (chỉ non-Claude). */
function buildAdapter(resolved: ResolvedCredential): LLMProviderLike {
  switch (resolved.provider) {
    case "gemini":
      return new GeminiAdapter({ apiKey: resolved.apiKey ?? "", defaultModel: resolved.model });
    case "ollama":
      return new OllamaAdapter({ baseUrl: resolved.baseUrl, defaultModel: resolved.model });
    case "openai":
      return new OpenAICompatAdapter({ apiKey: resolved.apiKey ?? "", baseUrl: resolved.baseUrl, defaultModel: resolved.model });
    default:
      throw new Error(`runToolLoop không hỗ trợ provider "${resolved.provider}" (Claude dùng MCP)`);
  }
}

/**
 * Chạy hội thoại có tool: model → tool_calls → thực thi → feed tool_result → lặp.
 * Chặn maxIters để tránh vòng lặp vô hạn / tốn token.
 */
export async function runToolLoop(args: {
  resolved: ResolvedCredential;
  systemPrompt: string;
  userPrompt: string;
  ctx: ToolCtx;
  includeWrite?: boolean;
  maxIters?: number;
}): Promise<ToolLoopResult> {
  const { resolved, systemPrompt, userPrompt, ctx } = args;
  const maxIters = args.maxIters ?? 6;
  const adapter = buildAdapter(resolved);
  const tools = getAgentTools({ includeWrite: args.includeWrite });

  const messages: LLMMessage[] = [{ role: "user", content: userPrompt }];
  let inputTokens = 0, outputTokens = 0, toolCallsMade = 0;
  const started = Date.now();
  let finalText = "";

  for (let iter = 0; iter < maxIters; iter++) {
    const resp = await adapter.complete({ system: systemPrompt, messages, tools, model: resolved.model });
    inputTokens += resp.usage.inputTokens;
    outputTokens += resp.usage.outputTokens;
    finalText = resp.text || finalText;

    if (!resp.toolCalls || resp.toolCalls.length === 0) break;

    // Lưu lượt assistant (kèm tool_calls) để model nhớ ngữ cảnh
    messages.push({
      role: "assistant",
      content: [
        ...(resp.text ? [{ type: "text" as const, text: resp.text }] : []),
        ...resp.toolCalls.map((tc) => ({ type: "tool_call" as const, id: tc.id, name: tc.name, input: tc.input })),
      ],
    });

    // Thực thi từng tool → đẩy tool_result
    for (const tc of resp.toolCalls) {
      toolCallsMade++;
      const result = await executeAgentTool(tc.name, tc.input, ctx);
      messages.push({
        role: "tool",
        content: [{ type: "tool_result" as const, tool_call_id: tc.id, content: result.content, is_error: result.isError }],
      });
    }
    // hết vòng → gọi lại model với tool_result
  }

  return { text: finalText, usage: { inputTokens, outputTokens }, toolCallsMade, durationMs: Date.now() - started };
}
