// packages/llm/src/supported-models.ts
// NGUỒN CHÂN LÝ danh sách model hỗ trợ — UI giới hạn theo đây, API validate theo đây.
// Mỗi provider có toolCapable (hỗ trợ function-calling) + danh sách model gợi ý.
// openai/ollama cho phép nhập model tự do (allowCustom) vì endpoint tùy người dùng (base_url).

export type ProviderName = "claude" | "gemini" | "ollama" | "openai";

export interface ModelOption {
  id: string;
  label: string;
  /** Model này có hỗ trợ tool-calling không (vd deepseek-reasoner thì không). */
  toolCapable?: boolean;
}

export interface ProviderModels {
  provider: ProviderName;
  label: string;
  /** Provider có cơ chế tool-calling nói chung. */
  toolCapable: boolean;
  /** Cho phép nhập model tự do (endpoint/biến thể tùy người dùng). */
  allowCustom: boolean;
  /** Cần base_url (OpenAI-compatible) hay không. */
  needsBaseUrl: boolean;
  models: ModelOption[];
}

export const SUPPORTED_MODELS: Record<ProviderName, ProviderModels> = {
  claude: {
    provider: "claude", label: "Claude (Anthropic)", toolCapable: true, allowCustom: false, needsBaseUrl: false,
    models: [
      { id: "sonnet", label: "Sonnet (alias)" },
      { id: "opus", label: "Opus (alias)" },
      { id: "haiku", label: "Haiku (alias)" },
      { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    ],
  },
  gemini: {
    provider: "gemini", label: "Gemini (Google)", toolCapable: true, allowCustom: true, needsBaseUrl: false,
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
  },
  openai: {
    provider: "openai", label: "OpenAI-compatible (DeepSeek/Kimi/Qwen/GPT)", toolCapable: true, allowCustom: true, needsBaseUrl: true,
    models: [
      { id: "deepseek-chat", label: "DeepSeek V3 (deepseek-chat)" },
      { id: "deepseek-reasoner", label: "DeepSeek R1 (deepseek-reasoner) — KHÔNG tool", toolCapable: false },
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "moonshot-v1-128k", label: "Kimi (moonshot-v1-128k)" },
      { id: "qwen-max", label: "Qwen Max (DashScope)" },
      { id: "qwen-plus", label: "Qwen Plus (DashScope)" },
    ],
  },
  ollama: {
    provider: "ollama", label: "Ollama (self-host)", toolCapable: true, allowCustom: true, needsBaseUrl: true,
    models: [
      { id: "qwen2.5:14b", label: "Qwen 2.5 14B" },
      { id: "llama3.1:8b", label: "Llama 3.1 8B" },
      { id: "llama3.3", label: "Llama 3.3" },
      { id: "mistral-nemo", label: "Mistral Nemo" },
    ],
  },
};

/** Model này có tool-calling không (theo provider + override từng model). */
export function isModelToolCapable(provider: ProviderName, modelId?: string): boolean {
  const p = SUPPORTED_MODELS[provider];
  if (!p || !p.toolCapable) return false;
  if (!modelId) return true;
  const m = p.models.find((x) => x.id === modelId);
  // model có cờ toolCapable=false thì không; ngoài danh sách (custom) thì theo provider.
  return m?.toolCapable === false ? false : true;
}
