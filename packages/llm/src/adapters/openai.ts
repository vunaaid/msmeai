// packages/llm/src/adapters/openai.ts
// OpenAI-compatible adapter (fetch thuần, không cần SDK) — phủ DeepSeek, Kimi/Moonshot,
// Qwen-API (DashScope), GPT… Khác nhau chỉ ở `baseUrl` + `model`. Hỗ trợ function calling
// chuẩn OpenAI: tools[].function + tool_calls + messages role "tool".

import type {
  LLMProvider, LLMRequest, LLMResponse, LLMMessage, ToolCall,
} from "../types/index.js";

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

function flattenText(content: LLMMessage["content"]): { text: string; toolResult?: { id: string; text: string } } {
  if (typeof content === "string") return { text: content };
  const arr = Array.isArray(content) ? content : [content];
  let toolResult: { id: string; text: string } | undefined;
  const text = arr.map((c) => {
    if (typeof c === "string") return c;
    if (c.type === "text") return c.text;
    if (c.type === "tool_result") { toolResult = { id: c.tool_call_id, text: c.content }; return c.content; }
    return JSON.stringify(c);
  }).join("\n");
  return { text, toolResult };
}

function toOpenAIMessages(messages: LLMMessage[]): OpenAIMessage[] {
  return messages.map((m): OpenAIMessage => {
    const { text, toolResult } = flattenText(m.content);
    if (m.role === "tool" || toolResult) {
      return { role: "tool", content: toolResult?.text ?? text, tool_call_id: toolResult?.id ?? "" };
    }
    // assistant message có thể kèm tool_calls (mảng object trong content)
    const arr = Array.isArray(m.content) ? m.content : [m.content];
    const calls = arr.filter((c) => typeof c !== "string" && c.type === "tool_call") as Array<{ type: "tool_call"; id: string; name: string; input: Record<string, unknown> }>;
    if (m.role === "assistant" && calls.length > 0) {
      return {
        role: "assistant",
        content: text || null,
        tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) } })),
      };
    }
    return { role: m.role as OpenAIMessage["role"], content: text };
  });
}

export class OpenAICompatAdapter implements LLMProvider {
  readonly name = "openai" as const;
  readonly defaultModel: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; baseUrl?: string; defaultModel?: string }) {
    this.apiKey = config.apiKey;
    // Mặc định OpenAI; người dùng đặt base_url khác cho DeepSeek/Kimi/Qwen…
    this.baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.defaultModel = config.defaultModel ?? "gpt-4o";
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model ?? this.defaultModel;
    const start = Date.now();

    const messages: OpenAIMessage[] = [];
    if (request.system) messages.push({ role: "system", content: request.system });
    messages.push(...toOpenAIMessages(request.messages));

    const tools = request.tools?.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
        temperature: request.temperature ?? 0.3,
        max_tokens: request.maxTokens ?? 4096,
        ...(request.stopSequences ? { stop: request.stopSequences } : {}),
      }),
    });

    if (!resp.ok) {
      throw new Error(`OpenAI-compatible API ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
    }

    const json = (await resp.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: OpenAIToolCall[] }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = json.choices?.[0];
    const msg = choice?.message;
    const text = msg?.content ?? "";

    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc, i) => {
      let input: Record<string, unknown> = {};
      try { input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}; } catch { input = {}; }
      return { id: tc.id ?? `openai_${Date.now()}_${i}`, name: tc.function.name, input };
    });

    let stopReason: LLMResponse["stopReason"] = "end_turn";
    if (toolCalls.length > 0) stopReason = "tool_use";
    else if (choice?.finish_reason === "length") stopReason = "max_tokens";
    else if (choice?.finish_reason === "stop") stopReason = "end_turn";

    return {
      text,
      toolCalls,
      stopReason,
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      provider: "openai",
      model,
      latencyMs: Date.now() - start,
    };
  }
}
