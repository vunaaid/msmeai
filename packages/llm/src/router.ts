// packages/llm/src/router.ts
// LLM Router — chọn provider theo config, fallback khi lỗi

import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMRouterConfig,
} from "./types/index.js";
import { ClaudeAdapter } from "./adapters/claude.js";
import { GeminiAdapter } from "./adapters/gemini.js";
import { OllamaAdapter } from "./adapters/ollama.js";
import { OpenAICompatAdapter } from "./adapters/openai.js";

// ─── LLM Router ───────────────────────────────────────────────────────────────

export class LLMRouter {
  private providers: Map<string, LLMProvider> = new Map();
  private config: LLMRouterConfig;

  constructor(config: LLMRouterConfig) {
    this.config = config;

    // Initialize providers that have credentials
    if (config.providers.claude?.apiKey) {
      this.providers.set(
        "claude",
        new ClaudeAdapter(config.providers.claude)
      );
    }
    if (config.providers.gemini?.apiKey) {
      this.providers.set(
        "gemini",
        new GeminiAdapter(config.providers.gemini)
      );
    }
    // Ollama: always available if configured (no API key needed)
    if (config.providers.ollama !== undefined) {
      this.providers.set(
        "ollama",
        new OllamaAdapter(config.providers.ollama)
      );
    }
    if (config.providers.openai?.apiKey) {
      this.providers.set(
        "openai",
        new OpenAICompatAdapter(config.providers.openai)
      );
    }

    if (this.providers.size === 0) {
      throw new Error("[LLMRouter] No providers configured");
    }
  }

  /**
   * Complete a request — tries primary provider, then fallback
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const providerName =
      request.preferProvider ?? this.config.routing.primary;

    const primary = this.providers.get(providerName);
    if (!primary) {
      throw new Error(`[LLMRouter] Provider "${providerName}" not configured`);
    }

    try {
      return await primary.complete(request);
    } catch (primaryError) {
      const fallbackName = this.config.routing.fallback;

      if (!fallbackName || fallbackName === providerName) {
        throw primaryError;
      }

      const fallback = this.providers.get(fallbackName);
      if (!fallback) {
        throw primaryError;
      }

      console.warn(
        `[LLMRouter] Primary provider "${providerName}" failed, trying fallback "${fallbackName}":`,
        primaryError instanceof Error ? primaryError.message : String(primaryError)
      );

      // Retry on fallback — strip preferProvider so it uses the fallback
      const fallbackRequest = { ...request, preferProvider: undefined, model: undefined };
      return await fallback.complete(fallbackRequest);
    }
  }

  /**
   * Get a specific provider (for direct access)
   */
  getProvider(name: "claude" | "gemini" | "ollama" | "openai"): LLMProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Check which providers are currently available
   */
  async checkAvailability(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    await Promise.all(
      Array.from(this.providers.entries()).map(async ([name, provider]) => {
        results[name] = await provider.isAvailable();
      })
    );
    return results;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create an LLMRouter from environment variables
 */
export function createRouterFromEnv(): LLMRouter {
  const config: LLMRouterConfig = {
    routing: {
      primary: (process.env["LLM_PRIMARY_PROVIDER"] as "claude" | "gemini" | "ollama" | "openai") ?? "claude",
      fallback: (process.env["LLM_FALLBACK_PROVIDER"] as "claude" | "gemini" | "ollama" | "openai") ?? "gemini",
      fast: (process.env["LLM_FAST_PROVIDER"] as "claude" | "gemini" | "ollama" | "openai") ?? "gemini",
    },
    providers: {},
  };

  if (process.env["ANTHROPIC_API_KEY"]) {
    config.providers.claude = {
      apiKey: process.env["ANTHROPIC_API_KEY"],
      defaultModel: process.env["CLAUDE_DEFAULT_MODEL"] ?? "claude-sonnet-4-6",
    };
  }

  if (process.env["GOOGLE_AI_API_KEY"]) {
    config.providers.gemini = {
      apiKey: process.env["GOOGLE_AI_API_KEY"],
      defaultModel: process.env["GEMINI_DEFAULT_MODEL"] ?? "gemini-2.0-flash",
    };
  }

  // Always try Ollama if host is set
  if (process.env["OLLAMA_HOST"] || process.env["OLLAMA_ENABLED"] === "true") {
    config.providers.ollama = {
      baseUrl: process.env["OLLAMA_HOST"] ?? "http://localhost:11434",
      defaultModel: process.env["OLLAMA_DEFAULT_MODEL"] ?? "qwen2.5:14b",
    };
  }

  return new LLMRouter(config);
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _router: LLMRouter | null = null;

export function getLLMRouter(): LLMRouter {
  if (!_router) {
    _router = createRouterFromEnv();
  }
  return _router;
}
