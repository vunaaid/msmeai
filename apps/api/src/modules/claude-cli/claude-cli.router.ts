// src/modules/claude-cli/claude-cli.router.ts
// POST /claude-cli        — gọi Claude CLI (non-streaming)
// POST /claude-cli/stream — gọi Claude CLI (SSE streaming)
// GET  /claude-cli/stream — EventSource-friendly

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { ok, badRequest, wrap } from "../../lib/response.js";
import { runClaude, streamClaude } from "../../lib/claude.js";
import type { Request, Response } from "express";

const router = Router();

const runSchema = z.object({
  prompt:       z.string().min(1).max(20_000),
  model:        z.string().optional(),
  systemPrompt: z.string().optional(),
  allowTools:   z.boolean().default(false),
  timeout:      z.number().int().max(300_000).default(120_000),
});

// ─── POST /claude-cli ────────────────────────────────────────────────────────

router.post("/", requireAuth, wrap(async (req, res) => {
  const data = runSchema.parse(req.body);
  const start = Date.now();

  const result = await runClaude({
    prompt:       data.prompt,
    model:        data.model,
    systemPrompt: data.systemPrompt,
    noTools:      !data.allowTools,
    timeout:      data.timeout,
    cwd:          "/tmp",
  });

  return ok(res, {
    result:     result.result,
    sessionId:  result.sessionId,
    durationMs: Date.now() - start,
    usage:      result.usage,
  });
}));

// ─── Stream helper ────────────────────────────────────────────────────────────

async function handleStream(req: Request, res: Response, prompt: string, opts: {
  model?: string;
  systemPrompt?: string;
  allowTools?: boolean;
}) {
  res.writeHead(200, {
    "Content-Type":      "text/event-stream",
    "Cache-Control":     "no-cache, no-transform",
    "Connection":        "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const sendSSE = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    for await (const event of streamClaude({
      prompt,
      model:        opts.model,
      systemPrompt: opts.systemPrompt,
      noTools:      !opts.allowTools,
      cwd:          "/tmp",
    })) {
      sendSSE(event.type, event);
    }
  } catch (err) {
    sendSSE("error", { error: err instanceof Error ? err.message : "Internal error" });
  }

  sendSSE("done", {});
  res.end();
}

// ─── POST /claude-cli/stream ─────────────────────────────────────────────────

router.post("/stream", requireAuth, async (req: Request, res: Response) => {
  const data = runSchema.parse(req.body);
  await handleStream(req, res, data.prompt, {
    model:        data.model,
    systemPrompt: data.systemPrompt,
    allowTools:   data.allowTools,
  });
});

// ─── GET /claude-cli/stream?prompt=... (EventSource-friendly) ────────────────

router.get("/stream", requireAuth, async (req: Request, res: Response) => {
  const prompt = req.query["prompt"] as string | undefined;
  if (!prompt) {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "?prompt= required" } });
    return;
  }

  await handleStream(req, res, prompt, {
    model:        req.query["model"] as string | undefined,
    systemPrompt: req.query["systemPrompt"] as string | undefined,
    allowTools:   req.query["allowTools"] === "true",
  });
});

export default router;
