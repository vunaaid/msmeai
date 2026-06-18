// packages/llm/src/types/index.ts
// Shared types for LLM providers

// ─── Message Types ────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolCallContent {
  type: "tool_call";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: "tool_result";
  tool_call_id: string;
  content: string;
  is_error?: boolean;
}

export type MessageContent = string | TextContent | ToolCallContent | ToolResultContent;

export interface LLMMessage {
  role: MessageRole;
  content: MessageContent | MessageContent[];
}

// ─── Tool Definition ──────────────────────────────────────────────────────────

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  enum?: string[];
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

// ─── Request / Response ───────────────────────────────────────────────────────

export interface LLMRequest {
  /** System prompt — will be cached if provider supports it */
  system?: string;
  messages: LLMMessage[];
  tools?: ToolDefinition[];
  /** Max tokens in response */
  maxTokens?: number;
  temperature?: number;
  /** Stop sequences */
  stopSequences?: string[];
  /** Provider hint — overrides router decision */
  preferProvider?: "claude" | "gemini" | "ollama" | "openai";
  /** Model override — defaults to provider's default model */
  model?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type StopReason = "end_turn" | "max_tokens" | "tool_use" | "stop_sequence";

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;   // Tokens served from prompt cache
  cacheWriteTokens: number;  // Tokens written to prompt cache
}

export interface LLMResponse {
  /** Primary text content (may be empty if tool_use) */
  text: string;
  /** Tool calls requested by the model */
  toolCalls: ToolCall[];
  stopReason: StopReason;
  usage: LLMUsage;
  /** Which provider actually served this */
  provider: "claude" | "gemini" | "ollama" | "openai";
  model: string;
  /** Latency in ms */
  latencyMs: number;
}

// ─── Provider Interface ───────────────────────────────────────────────────────

export interface LLMProvider {
  readonly name: "claude" | "gemini" | "ollama" | "openai";
  readonly defaultModel: string;
  isAvailable(): Promise<boolean>;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

// ─── Router Config ─────────────────────────────────────────────────────────────

export interface RouterConfig {
  /** Primary provider for most tasks */
  primary: "claude" | "gemini" | "ollama" | "openai";
  /** Fallback if primary fails */
  fallback?: "claude" | "gemini" | "ollama" | "openai";
  /** Provider for long/expensive tasks (optional) */
  longContext?: "claude" | "gemini";
  /** Provider for quick/cheap tasks */
  fast?: "claude" | "gemini" | "ollama" | "openai";
}

export interface LLMRouterConfig {
  routing: RouterConfig;
  providers: {
    claude?: { apiKey: string; defaultModel?: string };
    gemini?: { apiKey: string; defaultModel?: string };
    ollama?: { baseUrl?: string; defaultModel?: string };
    openai?: { apiKey: string; baseUrl?: string; defaultModel?: string };
  };
}

// ─── Cost Estimation ─────────────────────────────────────────────────────────

export interface TokenCost {
  inputCostPer1M: number;  // USD per 1M input tokens
  outputCostPer1M: number; // USD per 1M output tokens
  cacheWritePer1M?: number;
  cacheReadPer1M?: number;
}

export const MODEL_COSTS: Record<string, TokenCost> = {
  // Claude models
  "claude-opus-4-7":    { inputCostPer1M: 15, outputCostPer1M: 75, cacheWritePer1M: 18.75, cacheReadPer1M: 1.5 },
  "claude-sonnet-4-6":  { inputCostPer1M: 3,  outputCostPer1M: 15, cacheWritePer1M: 3.75,  cacheReadPer1M: 0.3 },
  "claude-haiku-4-5-20251001": { inputCostPer1M: 0.8, outputCostPer1M: 4, cacheWritePer1M: 1, cacheReadPer1M: 0.08 },
  // Gemini models
  "gemini-2.0-flash":    { inputCostPer1M: 0.1, outputCostPer1M: 0.4 },
  "gemini-2.5-pro":      { inputCostPer1M: 1.25, outputCostPer1M: 10 },
  // Ollama: free
  "llama3.2":            { inputCostPer1M: 0, outputCostPer1M: 0 },
  "qwen2.5":             { inputCostPer1M: 0, outputCostPer1M: 0 },
};

export function estimateCost(usage: LLMUsage, model: string): number {
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;
  const inputCost = (usage.inputTokens / 1_000_000) * costs.inputCostPer1M;
  const outputCost = (usage.outputTokens / 1_000_000) * costs.outputCostPer1M;
  const cacheWriteCost = costs.cacheWritePer1M
    ? (usage.cacheWriteTokens / 1_000_000) * costs.cacheWritePer1M : 0;
  const cacheReadCost = costs.cacheReadPer1M
    ? (usage.cacheReadTokens / 1_000_000) * costs.cacheReadPer1M : 0;
  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}
