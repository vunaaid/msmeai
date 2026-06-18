// src/lib/llm-credential.ts
// Phân giải credential LLM hiệu lực cho một agent: credential chỉ định → credential default
// của công ty (đúng provider) → fallback env (hành vi cũ). Giải mã API key ở server-side,
// KHÔNG bao giờ log key.

import { prisma } from "@vsme/db/client";
import { decryptSecret } from "./crypto.js";

export type LlmProviderName = "claude" | "gemini" | "ollama" | "openai";

export interface ResolvedCredential {
  provider: LlmProviderName;
  model: string;
  /** API key đã giải mã — chỉ dùng server-side, không log, không trả về client. */
  apiKey?: string;
  baseUrl?: string;
  /** id credential đã dùng (null = fallback env). */
  credentialId: string | null;
}

export async function resolveAgentCredential(args: {
  companyId: string;
  credentialId?: string | null;
  provider: LlmProviderName;
  model: string;
}): Promise<ResolvedCredential> {
  const { companyId, credentialId, provider, model } = args;

  let cred = credentialId
    ? await prisma.companyLlmCredential.findFirst({
        where: { id: credentialId, companyId, isActive: true },
      })
    : null;

  // Không có credential chỉ định → thử credential default của công ty cho đúng provider.
  if (!cred) {
    cred = await prisma.companyLlmCredential.findFirst({
      where: { companyId, isActive: true, isDefault: true, provider },
    });
  }

  let result: ResolvedCredential;
  if (!cred) {
    result = { provider, model, credentialId: null };
  } else {
    let apiKey: string | undefined;
    if (cred.apiKeyEnc) {
      apiKey = decryptSecret(cred.apiKeyEnc); // ném lỗi rõ ràng nếu khóa sai
    }
    result = {
      provider: cred.provider as LlmProviderName,
      model: cred.defaultModel ?? model,
      apiKey,
      baseUrl: cred.baseUrl ?? undefined,
      credentialId: cred.id,
    };
  }

  // FALLBACK: provider non-Claude nhưng KHÔNG có credential khả dụng (company cred / env key thật)
  // → quay về Claude CLI (OAuth ~/.claude) thay vì gọi REST và "fetch failed".
  if (result.provider !== "claude" && !providerUsable(result.provider, result.apiKey)) {
    return { provider: "claude", model: toClaudeModel(result.model), credentialId: result.credentialId };
  }
  return result;
}

/** Provider non-Claude có credential dùng được không (company key đã giải mã hoặc env key thật). */
function providerUsable(provider: LlmProviderName, apiKey?: string): boolean {
  if (apiKey) return true;
  switch (provider) {
    case "gemini": { const k = process.env["GOOGLE_AI_API_KEY"]; return !!k && k.startsWith("AIza"); }
    case "ollama": return process.env["OLLAMA_ENABLED"] === "true";
    case "openai": { const k = process.env["OPENAI_API_KEY"]; return !!k && k.startsWith("sk-"); }
    default: return false;
  }
}

/** Đưa model về dạng Claude hợp lệ khi fallback (model non-Claude → model Claude mặc định). */
function toClaudeModel(model: string): string {
  const m = (model ?? "").trim();
  if (m.startsWith("claude-") || ["sonnet", "opus", "haiku", "default"].includes(m.toLowerCase())) return m;
  return process.env["CLAUDE_DEFAULT_MODEL"] || "sonnet";
}

/** Dựng env override cho Claude CLI từ credential đã resolve (chỉ áp dụng provider=claude). */
export function claudeCredentialEnv(
  resolved: Pick<ResolvedCredential, "provider" | "apiKey" | "baseUrl">,
): { ANTHROPIC_API_KEY?: string; ANTHROPIC_BASE_URL?: string } | undefined {
  if (resolved.provider !== "claude") return undefined;
  const env: { ANTHROPIC_API_KEY?: string; ANTHROPIC_BASE_URL?: string } = {};
  if (resolved.apiKey) env.ANTHROPIC_API_KEY = resolved.apiKey;
  if (resolved.baseUrl) env.ANTHROPIC_BASE_URL = resolved.baseUrl;
  return Object.keys(env).length > 0 ? env : undefined;
}
