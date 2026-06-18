// packages/ai-sdk/src/index.ts
// AI SDK package exports

// Skill Engine
export * from "./skill/types.js";
export * from "./skill/parser.js";

// Authority Checker
export * from "./authority/checker.js";

// Context Builder
export * from "./context/builder.js";

// Escalation Engine
export * from "./escalation/engine.js";

// Tool Definitions
export * from "./tools/definitions.js";

// Document Tools — bộ tool ĐỘC LẬP (tool-only); nơi khác tự quyết định cách dùng
export * from "./tools/document-tools.js";

// Agent Runner
export * from "./runner/agent-runner.js";

// Re-export LLM adapters/types cho apps/api dùng trực tiếp (apps/api chỉ dep @vsme/ai-sdk,
// không khai báo @vsme/llm → tránh footgun pnpm). Chọn lọc để khỏi đụng tên.
export {
  GeminiAdapter, OllamaAdapter, OpenAICompatAdapter, ClaudeAdapter,
  SUPPORTED_MODELS, isModelToolCapable,
} from "@vsme/llm";
export type {
  LLMRequest, LLMResponse, LLMMessage, LLMUsage, ToolCall, ToolDefinition,
  ProviderName, ProviderModels, ModelOption,
} from "@vsme/llm";
