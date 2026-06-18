// packages/llm/src/adapters/ollama.ts
// Ollama adapter — self-hosted local models

import { Ollama as OllamaClient } from "ollama";
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMMessage,
  ToolCall,
} from "../types/index.js";

// ─── Type Helpers ─────────────────────────────────────────────────────────────

interface OllamaMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: Array<{
    function: { name: string; arguments: Record<string, unknown> };
  }>;
}

function toOllamaMessages(messages: LLMMessage[]): OllamaMessage[] {
  return messages.map((m): OllamaMessage => {
    const role =
      m.role === "tool" ? "tool" : (m.role as OllamaMessage["role"]);

    if (typeof m.content === "string") {
      return { role, content: m.content };
    }

    const contents = Array.isArray(m.content) ? m.content : [m.content];
    const text = contents
      .map((c) => {
        if (typeof c === "string") return c;
        if (c.type === "text") return c.text;
        if (c.type === "tool_result") return c.content;
        return JSON.stringify(c);
      })
      .join("\n");

    return { role, content: text };
  });
}

// ─── Ollama Adapter ───────────────────────────────────────────────────────────

export class OllamaAdapter implements LLMProvider {
  readonly name = "ollama" as const;
  readonly defaultModel: string;

  private client: OllamaClient;

  constructor(config?: { baseUrl?: string; defaultModel?: string }) {
    this.client = new OllamaClient({
      host: config?.baseUrl ?? "http://localhost:11434",
    });
    this.defaultModel = config?.defaultModel ?? "qwen2.5:14b";
  }

  async isAvailable(): Promise<boolean> {
    try {
      const list = await this.client.list();
      return Array.isArray(list.models);
    } catch {
      return false;
    }
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model ?? this.defaultModel;
    const start = Date.now();

    const messages: OllamaMessage[] = [];

    // Inject system prompt as system message
    if (request.system) {
      messages.push({ role: "system", content: request.system });
    }

    messages.push(...toOllamaMessages(request.messages));

    // Build tools array for Ollama (models that support function calling)
    const tools = request.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    const response = await this.client.chat({
      model,
      messages,
      tools,
      options: {
        temperature: request.temperature ?? 0.3,
        num_predict: request.maxTokens ?? 4096,
        stop: request.stopSequences,
      },
    });

    const latencyMs = Date.now() - start;

    // Extract text
    const text = response.message.content ?? "";

    // Extract tool calls
    const toolCalls: ToolCall[] = (response.message.tool_calls ?? []).map(
      (tc, i) => ({
        id: `ollama_${Date.now()}_${i}`,
        name: tc.function.name,
        input: tc.function.arguments as Record<string, unknown>,
      })
    );

    let stopReason: LLMResponse["stopReason"] = "end_turn";
    if (toolCalls.length > 0) stopReason = "tool_use";
    else if (response.done_reason === "length") stopReason = "max_tokens";

    // Ollama doesn't provide detailed token counts for all models
    const promptEvalCount = response.prompt_eval_count ?? 0;
    const evalCount = response.eval_count ?? 0;

    return {
      text,
      toolCalls,
      stopReason,
      usage: {
        inputTokens: promptEvalCount,
        outputTokens: evalCount,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      provider: "ollama",
      model,
      latencyMs,
    };
  }
}
