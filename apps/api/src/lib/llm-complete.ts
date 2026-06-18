// src/lib/llm-complete.ts
// Phase B: gọi LLM non-Claude (Gemini/Ollama) cho CHAT KHÔNG dùng tool.
// Dùng fetch REST thuần (zero-dependency) với credential đã resolve theo công ty.
// Tool-use (MCP) KHÔNG hỗ trợ ở đây — path đó vẫn chạy qua Claude CLI.

import type { ResolvedCredential } from "./llm-credential.js";

export interface CompleteResult {
  text: string;
  provider: string;
  model: string;
  durationMs: number;
  usage: { inputTokens: number; outputTokens: number };
}

const DEFAULT_GEMINI_BASE = "https://generativelanguage.googleapis.com";
const DEFAULT_OLLAMA_BASE = "http://localhost:11434";
const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";

/** Gọi Gemini generateContent (non-stream). */
async function completeGemini(
  resolved: ResolvedCredential,
  systemPrompt: string,
  prompt: string,
): Promise<CompleteResult> {
  if (!resolved.apiKey) throw new Error("Gemini cần API key trong credential");
  const model = resolved.model || "gemini-2.0-flash";
  const base = (resolved.baseUrl || DEFAULT_GEMINI_BASE).replace(/\/$/, "");
  const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(resolved.apiKey)}`;
  const started = Date.now();
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });
  if (!resp.ok) {
    throw new Error(`Gemini API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  }
  const json = (await resp.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = (json.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? "").join("");
  return {
    text, provider: "gemini", model, durationMs: Date.now() - started,
    usage: {
      inputTokens:  json.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

/** Gọi Ollama /api/chat (non-stream). */
async function completeOllama(
  resolved: ResolvedCredential,
  systemPrompt: string,
  prompt: string,
): Promise<CompleteResult> {
  const model = resolved.model || "qwen2.5:14b";
  const base = (resolved.baseUrl || DEFAULT_OLLAMA_BASE).replace(/\/$/, "");
  const started = Date.now();
  const resp = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(resolved.apiKey ? { Authorization: `Bearer ${resolved.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!resp.ok) {
    throw new Error(`Ollama API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  }
  const json = (await resp.json()) as {
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  return {
    text: json.message?.content ?? "",
    provider: "ollama", model, durationMs: Date.now() - started,
    usage: { inputTokens: json.prompt_eval_count ?? 0, outputTokens: json.eval_count ?? 0 },
  };
}

/**
 * Hoàn tất 1 lượt với provider non-Claude. Chỉ gọi khi resolved.provider !== "claude".
 * Ném lỗi nếu provider không hỗ trợ.
 */
/** Gọi OpenAI-compatible /chat/completions (non-stream, không tool). */
async function completeOpenAI(
  resolved: ResolvedCredential,
  systemPrompt: string,
  prompt: string,
): Promise<CompleteResult> {
  if (!resolved.apiKey) throw new Error("OpenAI-compatible cần API key trong credential");
  const model = resolved.model || "gpt-4o";
  const base = (resolved.baseUrl || DEFAULT_OPENAI_BASE).replace(/\/$/, "");
  const started = Date.now();
  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${resolved.apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!resp.ok) {
    throw new Error(`OpenAI-compatible API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  }
  const json = (await resp.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: json.choices?.[0]?.message?.content ?? "",
    provider: "openai", model, durationMs: Date.now() - started,
    usage: { inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0 },
  };
}

export async function completeNonClaude(
  resolved: ResolvedCredential,
  systemPrompt: string,
  prompt: string,
): Promise<CompleteResult> {
  if (resolved.provider === "gemini") return completeGemini(resolved, systemPrompt, prompt);
  if (resolved.provider === "ollama") return completeOllama(resolved, systemPrompt, prompt);
  if (resolved.provider === "openai") return completeOpenAI(resolved, systemPrompt, prompt);
  throw new Error(`completeNonClaude không hỗ trợ provider "${resolved.provider}"`);
}
