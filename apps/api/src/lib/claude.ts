// src/lib/claude/cli.ts
// Wrapper gọi Claude CLI subprocess — dùng cho API routes

import { spawn } from "child_process";
import { existsSync, readdirSync, writeFileSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";

// ─── Tìm binary Claude CLI ─────────────────────────────────────────────────

const SEARCH_PATHS = [
  process.env.CLAUDE_CLI_PATH,
  // Tìm trong tất cả versions của extension
  ...(function () {
    try {
      const extDir = path.join(os.homedir(), ".vscode-server/extensions");
      if (!existsSync(extDir)) return [];
      return readdirSync(extDir)
        .filter((d) => d.startsWith("anthropic.claude-code-"))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) // newest version first
        .map((d) => path.join(extDir, d, "resources/native-binary/claude"));
    } catch {
      return [];
    }
  })(),
].filter(Boolean) as string[];

export function getClaudeBinary(): string {
  for (const p of SEARCH_PATHS) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    "Claude CLI binary không tìm thấy. Cài đặt Claude Code extension hoặc set CLAUDE_CLI_PATH."
  );
}

// Claude CLI chỉ chạy model Claude (alias sonnet/opus/haiku hoặc id "claude-*").
// Model của provider khác (Ollama "qwen2.5:14b", "gemini-*"…) → quy về model Claude mặc định
// thay vì để CLI báo lỗi "model không tồn tại".
const CLAUDE_MODEL_ALIASES = new Set(["sonnet", "opus", "haiku", "default"]);
export function normalizeClaudeModel(model?: string): string | undefined {
  if (!model) return undefined;
  const m = model.trim();
  if (CLAUDE_MODEL_ALIASES.has(m.toLowerCase()) || m.startsWith("claude-")) return m;
  return process.env.CLAUDE_DEFAULT_MODEL || "sonnet";
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ClaudeRunOptions {
  prompt: string;
  /** Model alias: 'sonnet' | 'opus' | 'haiku' hoặc full ID */
  model?: string;
  /** System prompt tuỳ chỉnh */
  systemPrompt?: string;
  /** Working directory (mặc định: /tmp) */
  cwd?: string;
  /** Timeout milliseconds (mặc định: 120s) */
  timeout?: number;
  /** Disable tools (chỉ text chat) */
  noTools?: boolean;
  /** MCP servers để bật tool-use qua Claude CLI. Key = tên server (vd "vsme"). */
  mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
  /** Danh sách tool được phép (vd ["mcp__vsme__create_journal_entry"]). Khi set → ghi đè noTools. */
  allowedTools?: string[];
  /** Override env credential (inject vào spawn env, KHÔNG log). Dùng cho credential LLM theo công ty. */
  credentialEnv?: { ANTHROPIC_API_KEY?: string; ANTHROPIC_BASE_URL?: string };
}

/**
 * Gộp env cho subprocess Claude CLI. Ưu tiên credential:
 *   credentialEnv (credential công ty đã resolve) > ANTHROPIC_API_KEY thật trong env > phiên OAuth ~/.claude.
 * Vệ sinh: bỏ ANTHROPIC_API_KEY kế thừa nếu KHÔNG phải key thật (vd placeholder "your-…") để không
 * vô tình ghi đè phiên OAuth. Dùng CHUNG cho cả runClaude & streamClaude (trước đây streamClaude
 * tự dựng env nên BỎ QUA credentialEnv — đã chuẩn hóa về đây).
 */
function buildSpawnEnv(opts: ClaudeRunOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: process.env.HOME ?? os.homedir() };
  if (env["ANTHROPIC_API_KEY"] && !env["ANTHROPIC_API_KEY"].startsWith("sk-")) {
    delete env["ANTHROPIC_API_KEY"]; // key rác/placeholder → dùng OAuth thay vì auth fail
  }
  if (opts.credentialEnv?.ANTHROPIC_API_KEY) env["ANTHROPIC_API_KEY"] = opts.credentialEnv.ANTHROPIC_API_KEY;
  if (opts.credentialEnv?.ANTHROPIC_BASE_URL) env["ANTHROPIC_BASE_URL"] = opts.credentialEnv.ANTHROPIC_BASE_URL;
  return env;
}

/**
 * Dựng các tham số CLI cho tool-use / MCP. Trả về args + hàm cleanup (xóa file tạm).
 * - Có mcpServers → ghi mcp-config tạm + --mcp-config/--strict-mcp-config/--permission-mode bypassPermissions.
 * - Có allowedTools → --allowedTools <list>; ngược lại nếu noTools → --allowedTools "".
 */
function buildToolArgs(opts: ClaudeRunOptions): { args: string[]; cleanup: () => void } {
  const args: string[] = [];
  let tmpFile: string | null = null;

  if (opts.mcpServers && Object.keys(opts.mcpServers).length > 0) {
    tmpFile = path.join(os.tmpdir(), `vsme-mcp-${randomUUID()}.json`);
    writeFileSync(tmpFile, JSON.stringify({ mcpServers: opts.mcpServers }), "utf8");
    args.push("--mcp-config", tmpFile, "--strict-mcp-config", "--permission-mode", "bypassPermissions");
  }

  if (opts.allowedTools && opts.allowedTools.length > 0) {
    args.push("--allowedTools", ...opts.allowedTools);
  } else if (opts.noTools ?? true) {
    args.push("--allowedTools", "");
  }

  return {
    args,
    cleanup: () => {
      if (tmpFile) { try { unlinkSync(tmpFile); } catch { /* ignore */ } }
    },
  };
}

export interface ClaudeResult {
  result: string;
  sessionId: string;
  durationMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    totalCostUsd: number;
  };
}

// ─── Stream event types (từ --output-format stream-json) ───────────────────

export type ClaudeStreamEvent =
  | { type: "init"; sessionId: string; model: string }
  | { type: "text"; text: string; sessionId: string }
  | { type: "thinking"; thinking: string; sessionId: string }
  | { type: "result"; result: string; sessionId: string; durationMs: number; usage: ClaudeResult["usage"] }
  | { type: "error"; error: string };

// ─── Chạy Claude CLI (non-streaming) ──────────────────────────────────────

export async function runClaude(opts: ClaudeRunOptions): Promise<ClaudeResult> {
  const binary = getClaudeBinary();
  const { prompt, model, systemPrompt, cwd = "/tmp", timeout = 120_000 } = opts;

  const cliModel = normalizeClaudeModel(model);
  const args: string[] = [
    "--print",
    "--output-format", "json",
  ];
  if (cliModel) args.push("--model", cliModel);
  if (systemPrompt) args.push("--system-prompt", systemPrompt);
  const tool = buildToolArgs(opts);
  args.push(...tool.args);
  const mcpDebug = !!process.env["AGENT_MCP_DEBUG"] && !!opts.mcpServers;
  if (mcpDebug) args.push("--debug");

  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, {
      cwd,
      env: buildSpawnEnv(opts),
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Gửi prompt qua stdin
    proc.stdin.write(prompt, "utf8");
    proc.stdin.end();

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      tool.cleanup();
      reject(new Error(`Claude CLI timeout sau ${timeout}ms`));
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timer);
      tool.cleanup();
      if (mcpDebug) {
        const mcpLines = stderr.split("\n").filter((l) => /mcp|vsme|tool|server|error|connect|fail/i.test(l)).slice(-25);
        console.error("[claude-mcp-debug]\n" + mcpLines.join("\n"));
      }
      if (code !== 0) {
        reject(new Error(`Claude CLI exited ${code}: ${stderr.trim()}`));
        return;
      }
      try {
        const json = JSON.parse(stdout.trim()) as {
          type: string;
          subtype?: string;
          result?: string;
          session_id?: string;
          duration_ms?: number;
          usage?: {
            input_tokens: number;
            output_tokens: number;
            cache_read_input_tokens: number;
            cache_creation_input_tokens: number;
          };
          total_cost_usd?: number;
          is_error?: boolean;
          api_error_status?: string | null;
        };

        if (json.is_error || json.subtype === "error") {
          reject(new Error(json.api_error_status ?? "Claude CLI returned error"));
          return;
        }

        resolve({
          result: json.result ?? "",
          sessionId: json.session_id ?? "",
          durationMs: json.duration_ms ?? 0,
          usage: {
            inputTokens: json.usage?.input_tokens ?? 0,
            outputTokens: json.usage?.output_tokens ?? 0,
            cacheReadInputTokens: json.usage?.cache_read_input_tokens ?? 0,
            cacheCreationInputTokens: json.usage?.cache_creation_input_tokens ?? 0,
            totalCostUsd: json.total_cost_usd ?? 0,
          },
        });
      } catch {
        reject(new Error(`Parse JSON thất bại: ${stdout.slice(0, 200)}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      tool.cleanup();
      reject(err);
    });
  });
}

// ─── Stream Claude CLI (server-sent events) ────────────────────────────────

/**
 * Trả về AsyncGenerator yield từng ClaudeStreamEvent.
 * Dùng trong API route với ReadableStream.
 */
export async function* streamClaude(
  opts: ClaudeRunOptions
): AsyncGenerator<ClaudeStreamEvent> {
  const binary = getClaudeBinary();
  const { prompt, model, systemPrompt, cwd = "/tmp", timeout = 120_000 } = opts;

  const cliModel = normalizeClaudeModel(model);
  const args: string[] = [
    "--print",
    "--output-format", "stream-json",
    "--verbose",
  ];
  if (cliModel) args.push("--model", cliModel);
  if (systemPrompt) args.push("--system-prompt", systemPrompt);
  const tool = buildToolArgs(opts);
  args.push(...tool.args);

  const proc = spawn(binary, args, {
    cwd,
    env: buildSpawnEnv(opts), // chuẩn hóa: áp credentialEnv + vệ sinh key giống runClaude
    stdio: ["pipe", "pipe", "pipe"],
  });

  proc.stdin.write(prompt, "utf8");
  proc.stdin.end();

  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; proc.kill("SIGTERM"); }, timeout);

  // Theo dõi stderr + exit code + lỗi spawn để KHÔNG kết thúc lặng lẽ khi CLI hỏng.
  let stderr = "";
  proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  let spawnError: Error | null = null;
  proc.on("error", (err) => { spawnError = err; });
  // Promise close: lấy exit code sau khi stdout đóng để quyết định có phát "error" không.
  const closed = new Promise<number | null>((resolve) => proc.on("close", (code) => resolve(code)));

  // Buffer để xử lý lines không đầy đủ
  let buffer = "";
  let yieldedResult = false; // đã phát "result" (kể cả lỗi) chưa?

  try {
    for await (const chunk of proc.stdout) {
      buffer += (chunk as Buffer).toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // giữ lại dòng chưa kết thúc

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let obj: Record<string, unknown>;
        try {
          obj = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          continue; // skip invalid JSON
        }

        const type = obj.type as string;
        const sessionId = (obj.session_id as string) ?? "";

        if (type === "system" && (obj.subtype as string) === "init") {
          yield {
            type: "init",
            sessionId,
            model: (obj.model as string) ?? "",
          };
          continue;
        }

        if (type === "assistant") {
          const msg = obj.message as { content?: Array<{ type: string; text?: string; thinking?: string }> };
          for (const block of msg.content ?? []) {
            if (block.type === "text" && block.text) {
              yield { type: "text", text: block.text, sessionId };
            } else if (block.type === "thinking" && block.thinking) {
              yield { type: "thinking", thinking: block.thinking, sessionId };
            }
          }
          continue;
        }

        if (type === "result") {
          // CLI báo lỗi qua chính dòng result (is_error / subtype "error") → phát "error".
          if (obj.is_error || obj.subtype === "error") {
            yieldedResult = true;
            yield { type: "error", error: (obj.api_error_status as string) ?? (obj.result as string) ?? "Claude CLI returned error" };
            continue;
          }
          const usage = obj.usage as {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          } | undefined;

          yieldedResult = true;
          yield {
            type: "result",
            result: (obj.result as string) ?? "",
            sessionId,
            durationMs: (obj.duration_ms as number) ?? 0,
            usage: {
              inputTokens: usage?.input_tokens ?? 0,
              outputTokens: usage?.output_tokens ?? 0,
              cacheReadInputTokens: usage?.cache_read_input_tokens ?? 0,
              cacheCreationInputTokens: usage?.cache_creation_input_tokens ?? 0,
              totalCostUsd: (obj.total_cost_usd as number) ?? 0,
            },
          };
          continue;
        }
      }
    }

    // stdout đã đóng. Nếu CLI hỏng (spawn lỗi / timeout / exit ≠ 0) mà CHƯA phát result
    // → phát "error" để route/UI không kết thúc lặng lẽ (mất lượt trả lời).
    const code = await closed;
    if (!yieldedResult) {
      const err = spawnError as Error | null;
      const detail = err
        ? err.message
        : timedOut
          ? `Claude CLI timeout sau ${timeout}ms`
          : stderr.trim() || (code !== 0 && code !== null ? `Claude CLI exited ${code}` : "Claude CLI kết thúc nhưng không trả kết quả");
      yield { type: "error", error: detail };
    }
  } finally {
    clearTimeout(timer);
    if (!proc.killed) proc.kill("SIGTERM");
    tool.cleanup();
  }
}
