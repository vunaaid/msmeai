// packages/llm/src/adapters/gemini.ts
// Gemini adapter — Google Generative AI SDK

import {
  GoogleGenerativeAI,
  SchemaType,
  type Content,
  type Tool,
  type FunctionDeclaration,
  type Part,
} from "@google/generative-ai";
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMMessage,
  ToolDefinition,
  ToolCall,
} from "../types/index.js";

// ─── Type Helpers ─────────────────────────────────────────────────────────────

function toGeminiHistory(messages: LLMMessage[]): Content[] {
  // Gemini doesn't have a system role in history — system is passed separately
  return messages
    .filter((m) => m.role !== "system" && m.role !== "tool")
    .map((m): Content => {
      const role = m.role === "assistant" ? "model" : "user";

      if (typeof m.content === "string") {
        return { role, parts: [{ text: m.content }] };
      }

      const contents = Array.isArray(m.content) ? m.content : [m.content];
      const parts: Part[] = contents.map((c) => {
        if (typeof c === "string") return { text: c };
        if (c.type === "text") return { text: c.text };
        if (c.type === "tool_call") {
          return {
            functionCall: {
              name: c.name,
              args: c.input,
            },
          };
        }
        if (c.type === "tool_result") {
          return {
            functionResponse: {
              name: c.tool_call_id, // Gemini uses function name, not call id
              response: { result: c.content },
            },
          };
        }
        return { text: JSON.stringify(c) };
      });

      return { role, parts };
    });
}

function toGeminiTools(tools: ToolDefinition[]): Tool[] {
  const functionDeclarations: FunctionDeclaration[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: SchemaType.OBJECT,
      properties: Object.fromEntries(
        Object.entries(t.input_schema.properties).map(([key, val]) => [
          key,
          {
            type: val.type.toUpperCase() as SchemaType,
            description: val.description ?? "",
          },
        ])
      ),
      required: t.input_schema.required ?? [],
    },
  }));

  return [{ functionDeclarations }];
}

// ─── Gemini Adapter ───────────────────────────────────────────────────────────

export class GeminiAdapter implements LLMProvider {
  readonly name = "gemini" as const;
  readonly defaultModel: string;

  private client: GoogleGenerativeAI;

  constructor(config: { apiKey: string; defaultModel?: string }) {
    this.client = new GoogleGenerativeAI(config.apiKey);
    this.defaultModel = config.defaultModel ?? "gemini-2.0-flash";
  }

  async isAvailable(): Promise<boolean> {
    try {
      const model = this.client.getGenerativeModel({
        model: this.defaultModel,
      });
      // Quick health check
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: "Hi" }] }],
        generationConfig: { maxOutputTokens: 5 },
      });
      return !!result.response;
    } catch {
      return false;
    }
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model ?? this.defaultModel;
    const start = Date.now();

    const genModel = this.client.getGenerativeModel({
      model,
      systemInstruction: request.system,
      tools: request.tools ? toGeminiTools(request.tools) : undefined,
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.3,
        stopSequences: request.stopSequences,
      },
    });

    const history = toGeminiHistory(request.messages.slice(0, -1));
    const lastMessage = request.messages[request.messages.length - 1];

    const chat = genModel.startChat({ history });

    const lastContent =
      typeof lastMessage?.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage?.content);

    const result = await chat.sendMessage(lastContent);
    const latencyMs = Date.now() - start;
    const response = result.response;

    // Extract text
    const text = response.text();

    // Extract tool calls (function calls)
    const toolCalls: ToolCall[] = [];
    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.functionCall) {
          toolCalls.push({
            id: `gemini_${Date.now()}_${toolCalls.length}`,
            name: part.functionCall.name ?? "",
            input: (part.functionCall.args ?? {}) as Record<string, unknown>,
          });
        }
      }
    }

    // Usage
    const usageMetadata = response.usageMetadata;

    let stopReason: LLMResponse["stopReason"] = "end_turn";
    const finishReason = candidate?.finishReason;
    if (finishReason === "MAX_TOKENS") stopReason = "max_tokens";
    else if (finishReason === "STOP") stopReason = "end_turn";
    else if (toolCalls.length > 0) stopReason = "tool_use";

    return {
      text,
      toolCalls,
      stopReason,
      usage: {
        inputTokens: usageMetadata?.promptTokenCount ?? 0,
        outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      provider: "gemini",
      model,
      latencyMs,
    };
  }
}
