// packages/llm/src/adapters/claude.ts
// Claude adapter — Anthropic SDK with prompt caching

import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMMessage,
  ToolDefinition,
  ToolCall,
} from "../types/index.js";

// ─── Type Helpers ─────────────────────────────────────────────────────────────

type AnthropicContent =
  | Anthropic.Messages.TextBlockParam
  | Anthropic.Messages.ToolUseBlockParam
  | Anthropic.Messages.ToolResultBlockParam;

function toAnthropicMessages(
  messages: LLMMessage[]
): Anthropic.Messages.MessageParam[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m): Anthropic.Messages.MessageParam => {
      const role = m.role === "tool" ? "user" : (m.role as "user" | "assistant");

      if (typeof m.content === "string") {
        return { role, content: m.content };
      }

      const contents = Array.isArray(m.content) ? m.content : [m.content];
      const blocks: AnthropicContent[] = contents.map((c) => {
        if (typeof c === "string") {
          return { type: "text", text: c } as Anthropic.Messages.TextBlockParam;
        }
        if (c.type === "text") {
          return { type: "text", text: c.text } as Anthropic.Messages.TextBlockParam;
        }
        if (c.type === "tool_call") {
          return {
            type: "tool_use",
            id: c.id,
            name: c.name,
            input: c.input,
          } as Anthropic.Messages.ToolUseBlockParam;
        }
        if (c.type === "tool_result") {
          return {
            type: "tool_result",
            tool_use_id: c.tool_call_id,
            content: c.content,
            is_error: c.is_error,
          } as Anthropic.Messages.ToolResultBlockParam;
        }
        return { type: "text", text: JSON.stringify(c) } as Anthropic.Messages.TextBlockParam;
      });

      return { role, content: blocks };
    });
}

function toAnthropicTools(
  tools: ToolDefinition[]
): Anthropic.Messages.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}

// ─── Claude Adapter ───────────────────────────────────────────────────────────

export class ClaudeAdapter implements LLMProvider {
  readonly name = "claude" as const;
  readonly defaultModel: string;

  private client: Anthropic;

  constructor(config: { apiKey: string; defaultModel?: string }) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.defaultModel = config.defaultModel ?? "claude-sonnet-4-6";
  }

  async isAvailable(): Promise<boolean> {
    // Available if API key is configured
    return !!this.client;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model ?? this.defaultModel;
    const start = Date.now();

    // Build system prompt array — enable prompt caching for system prompt
    const systemBlocks: Anthropic.Messages.TextBlockParam[] = [];
    if (request.system) {
      systemBlocks.push({
        type: "text",
        text: request.system,
        // @ts-expect-error — cache_control is supported but types may lag
        cache_control: { type: "ephemeral" },
      });
    }

    const messages = toAnthropicMessages(request.messages);
    const tools = request.tools ? toAnthropicTools(request.tools) : undefined;

    const response = await this.client.messages.create({
      model,
      system: systemBlocks.length > 0 ? systemBlocks : undefined,
      messages,
      tools,
      tool_choice: tools && tools.length > 0 ? { type: "auto" } : undefined,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.3,
      stop_sequences: request.stopSequences,
    });

    const latencyMs = Date.now() - start;

    // Extract text content
    const text = response.content
      .filter((c): c is Anthropic.Messages.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");

    // Extract tool calls
    const toolCalls: ToolCall[] = response.content
      .filter((c): c is Anthropic.Messages.ToolUseBlock => c.type === "tool_use")
      .map((c) => ({
        id: c.id,
        name: c.name,
        input: c.input as Record<string, unknown>,
      }));

    // Map stop reason
    const stopReasonMap: Record<string, LLMResponse["stopReason"]> = {
      end_turn: "end_turn",
      max_tokens: "max_tokens",
      tool_use: "tool_use",
      stop_sequence: "stop_sequence",
    };
    const stopReason = stopReasonMap[response.stop_reason ?? "end_turn"] ?? "end_turn";

    // Usage — including cache tokens
    const usage = response.usage as Anthropic.Messages.Usage & {
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };

    return {
      text,
      toolCalls,
      stopReason,
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      },
      provider: "claude",
      model,
      latencyMs,
    };
  }
}
