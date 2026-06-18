// src/modules/ai/ai.router.ts
// AI module — agents, sessions, messages, tasks, usage, approvals

import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { join } from "node:path";
import { prisma } from "@vsme/db/client";
import { createJournalEntry } from "@vsme/db";
import type { LLMProvider, AITaskStatus } from "@vsme/db";
import {
  getAllAgents, getSkill, getAuthoritySummary, initSkillRegistry, buildSystemPrompt,
} from "@vsme/ai-sdk";
import { requireAuth } from "../../middleware/auth.js";
import {
  ok, created, notFound, badRequest, forbidden, wrap,
} from "../../lib/response.js";
import { assertPermission } from "../../lib/rbac.js";
import { runClaude } from "../../lib/claude.js";
import { streamClaudeForAgent } from "../../lib/agent-claude.js";
import { ocrImage } from "../../lib/ocr.js";
import { buildDbAgentSystemPrompt } from "../../lib/agent-prompt.js";
import { encryptSecret } from "../../lib/crypto.js";
import { resolveAgentCredential } from "../../lib/llm-credential.js";
import { completeNonClaude } from "../../lib/llm-complete.js";
import { runToolLoop } from "../../lib/llm-tool-loop.js";
import { SUPPORTED_MODELS } from "@vsme/ai-sdk";
import { getAssignableUsers } from "../../lib/hierarchy.js";
import { qs, qsOr, qi, param } from "../../lib/query.js";
import { orchestrateInline, loadExecAgents, runNoToolText, parseGlEntry, type ExecAgent } from "../chat/agent-reply.js";
import { buildDataContext, createMarkdownReport } from "../chat/agent-data.js";
import { startKeepalive } from "../../lib/realtime.js";
import type { Request, Response } from "express";

// ─── Init skill registry ──────────────────────────────────────────────────────

const skillsDir = process.env["SKILLS_DIR"] ?? join(process.cwd(), "../..", "skills");
initSkillRegistry(skillsDir);

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — đủ cho ảnh chụp & tài liệu nhỏ
});

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createAgentSchema = z.object({
  agentId:      z.string().min(2).max(64).regex(/^[a-z0-9_-]+$/),
  displayName:  z.string().min(2).max(100),
  description:  z.string().max(500).optional(),
  department:   z.string().max(100).optional(),
  level:        z.enum(["board","c_suite","manager","staff","special"]).default("staff"),
  systemPrompt: z.string().min(10).max(10_000),
  provider:     z.enum(["claude","gemini","ollama","openai"]).default("claude"),
  model:        z.string().default("sonnet"),
  allowTools:   z.boolean().default(false),
  icon:         z.string().default("Bot"),
  sortOrder:    z.number().int().default(50),
  credentialId: z.string().uuid().nullable().optional(),
});

const updateAgentSchema = createAgentSchema.partial().omit({ agentId: true });

const createCredentialSchema = z.object({
  label:        z.string().min(2).max(64),
  provider:     z.enum(["claude","gemini","ollama","openai"]).default("claude"),
  baseUrl:      z.string().url().max(300).optional(),
  apiKey:       z.string().min(8).max(400).optional(), // optional cho ollama
  defaultModel: z.string().max(100).optional(),
  isDefault:    z.boolean().default(false),
});

const updateCredentialSchema = createCredentialSchema.partial();

/** Map credential → DTO an toàn (KHÔNG chứa apiKeyEnc/key thô). */
function credentialDto(c: {
  id: string; label: string; provider: LLMProvider; baseUrl: string | null;
  defaultModel: string | null; isActive: boolean; isDefault: boolean;
  apiKeyEnc: string | null; createdAt: Date;
}) {
  return {
    id: c.id, label: c.label, provider: c.provider, baseUrl: c.baseUrl,
    defaultModel: c.defaultModel, isActive: c.isActive, isDefault: c.isDefault,
    hasKey: !!c.apiKeyEnc, createdAt: c.createdAt,
  };
}

const chatSchema = z.object({
  message:   z.string().min(1).max(20_000),
  sessionId: z.string().uuid().optional(),
});

const planSchema = z.object({ content: z.string().min(5).max(8_000) });

const describeSchema = z.object({
  title:       z.string().min(2).max(200),
  description: z.string().max(4_000).optional(),
});

interface PlanTask {
  title: string;
  description: string;
  assigneeId: string | null;
  dueInDays: number;
  priority: "urgent" | "high" | "normal" | "low";
}

// ─── GET /ai/agents ───────────────────────────────────────────────────────────

router.get("/agents", requireAuth, wrap(async (_req, res) => {
  const agents = getAllAgents();
  const levelOrder = { board: 0, c_suite: 1, manager: 2, staff: 3, special: 4 };

  const enriched = agents.map(agent => {
    const skill   = getSkill(agent.agentId);
    const summary = skill ? getAuthoritySummary(skill) : null;
    return {
      ...agent,
      authoritySummary: summary ? {
        canDoCount:         summary.canDo.length,
        needsApprovalCount: summary.needsApproval.length,
        cannotDoCount:      summary.cannotDo.length,
      } : null,
    };
  }).sort((a, b) =>
    (levelOrder[a.level as keyof typeof levelOrder] ?? 5) -
    (levelOrder[b.level as keyof typeof levelOrder] ?? 5)
  );

  return ok(res, enriched);
}));

// ─── GET /ai/agents/company ───────────────────────────────────────────────────

router.get("/agents/company", requireAuth, wrap(async (req, res) => {
  const user      = req.user!;
  const companyId = user.companyId;

  const dbAgents = await prisma.companyAgent.findMany({
    where:   { companyId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
    include: { credential: { select: { id: true, label: true, provider: true, defaultModel: true } } },
  });

  const fileAgents = getAllAgents();
  const dbAgentIds = new Set(dbAgents.map(a => a.agentId));
  const fileOnly   = fileAgents
    .filter(a => !dbAgentIds.has(a.agentId))
    .map(a => {
      const skill = getSkill(a.agentId);
      return {
        id: null as null, agentId: a.agentId, displayName: a.displayName,
        description: null as string | null, department: a.department, level: a.level,
        systemPrompt: null as string | null,
        model:    skill?.preferredModel  ?? "sonnet",
        provider: (skill?.preferredProvider ?? "claude") as LLMProvider,
        allowTools: false, icon: "Bot", isActive: true, isCustom: false, sortOrder: 50,
        credentialId: null as string | null,
        credential: null as { id: string; label: string; provider: LLMProvider; defaultModel: string | null } | null,
        source: "file" as const,
      };
    });

  const merged = [
    ...dbAgents.map(a => ({ ...a, source: "db" as const })),
    ...fileOnly,
  ].sort((a, b) => a.sortOrder - b.sortOrder);

  return ok(res, merged);
}));

// ─── POST /ai/agents/company ──────────────────────────────────────────────────

router.post("/agents/company", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "ai", "write");

  const data = createAgentSchema.parse(req.body);

  const existing = await prisma.companyAgent.findUnique({
    where: { companyId_agentId: { companyId: user.companyId, agentId: data.agentId } },
  });
  if (existing) return badRequest(res, `AgentId '${data.agentId}' đã tồn tại trong công ty`);

  if (data.credentialId) {
    const cred = await prisma.companyLlmCredential.findFirst({
      where: { id: data.credentialId, companyId: user.companyId },
    });
    if (!cred) return badRequest(res, "Credential không tồn tại trong công ty");
  }

  const agent = await prisma.companyAgent.create({
    data: {
      companyId:    user.companyId,
      agentId:      data.agentId,
      displayName:  data.displayName,
      description:  data.description,
      department:   data.department,
      level:        data.level,
      systemPrompt: data.systemPrompt,
      provider:     data.provider as LLMProvider,
      model:        data.model,
      allowTools:   data.allowTools,
      icon:         data.icon,
      isActive:     true,
      isCustom:     true,
      sortOrder:    data.sortOrder,
      credentialId: data.credentialId ?? null,
      createdBy:    user.id,
    },
  });

  return created(res, agent);
}));

// ─── POST /ai/agents/company/import-skills ───────────────────────────────────
// Tạo + KÍCH HOẠT DB agent từ TOÀN BỘ file skill (full agent). Idempotent:
//  - Agent đã tồn tại → chỉ bật isActive (KHÔNG ghi đè tùy biến của người dùng).
//  - Agent mới → tạo từ skill (provider/model theo skill; fallback Claude CLI tự lo khi thiếu key).
router.post("/agents/company/import-skills", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!(user.accountType === "company_admin" || user.isSuperAdmin)) {
    return forbidden(res, "Chỉ quản trị công ty được nhập agent");
  }
  const ORDER: Record<string, number> = { board: 10, c_suite: 20, manager: 30, staff: 40, special: 50 };
  const entries = getAllAgents();
  let created = 0, activated = 0;
  for (const e of entries) {
    const skill = getSkill(e.agentId);
    if (!skill) continue;
    const existing = await prisma.companyAgent.findUnique({
      where: { companyId_agentId: { companyId: user.companyId, agentId: e.agentId } },
      select: { id: true },
    });
    if (existing) {
      await prisma.companyAgent.update({ where: { id: existing.id }, data: { isActive: true } });
      activated++;
    } else {
      await prisma.companyAgent.create({
        data: {
          companyId:    user.companyId,
          agentId:      e.agentId,
          displayName:  skill.displayName,
          description:  skill.capabilities?.[0] ?? skill.department,
          department:   skill.department,
          level:        skill.level,
          systemPrompt: buildSystemPrompt(skill, "assistant"),
          provider:     (skill.preferredProvider ?? "claude") as LLMProvider,
          model:        skill.preferredModel ?? "sonnet",
          allowTools:   false,
          icon:         "Bot",
          isActive:     true,
          isCustom:     false,
          sortOrder:    ORDER[skill.level] ?? 100,
          createdBy:    user.id,
        },
      });
      created++;
    }
  }
  return ok(res, { total: entries.length, created, activated });
}));

// ─── GET /ai/agents/company/:agentId ─────────────────────────────────────────

router.get("/agents/company/:agentId", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const agent = await prisma.companyAgent.findUnique({
    where: { companyId_agentId: { companyId: user.companyId, agentId: param(param(req.params["agentId"])) } },
  });
  if (!agent) return notFound(res, "Agent");
  return ok(res, agent);
}));

// ─── PATCH /ai/agents/company/:agentId ───────────────────────────────────────

router.patch("/agents/company/:agentId", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "ai", "write");

  const agent = await prisma.companyAgent.findUnique({
    where: { companyId_agentId: { companyId: user.companyId, agentId: param(param(req.params["agentId"])) } },
  });
  if (!agent) return notFound(res, "Agent");

  const data = updateAgentSchema.parse(req.body);

  if (data.credentialId) {
    const cred = await prisma.companyLlmCredential.findFirst({
      where: { id: data.credentialId, companyId: user.companyId },
    });
    if (!cred) return badRequest(res, "Credential không tồn tại trong công ty");
  }

  const updated = await prisma.companyAgent.update({
    where: { id: agent.id },
    data: {
      ...(data.displayName  !== undefined && { displayName:  data.displayName }),
      ...(data.description  !== undefined && { description:  data.description }),
      ...(data.department   !== undefined && { department:   data.department }),
      ...(data.level        !== undefined && { level:        data.level }),
      ...(data.systemPrompt !== undefined && { systemPrompt: data.systemPrompt }),
      ...(data.provider     !== undefined && { provider:     data.provider as LLMProvider }),
      ...(data.model        !== undefined && { model:        data.model }),
      ...(data.allowTools   !== undefined && { allowTools:   data.allowTools }),
      ...(data.icon         !== undefined && { icon:         data.icon }),
      ...(data.sortOrder    !== undefined && { sortOrder:    data.sortOrder }),
      ...(data.credentialId !== undefined && { credentialId: data.credentialId }),
    },
  });

  return ok(res, updated);
}));

// ─── DELETE /ai/agents/company/:agentId ──────────────────────────────────────

router.delete("/agents/company/:agentId", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "ai", "write");

  const agent = await prisma.companyAgent.findUnique({
    where: { companyId_agentId: { companyId: user.companyId, agentId: param(param(req.params["agentId"])) } },
  });
  if (!agent) return notFound(res, "Agent");

  await prisma.companyAgent.update({ where: { id: agent.id }, data: { isActive: false } });
  return ok(res, { deleted: true });
}));

// ═══ Credential LLM dùng chung cấp công ty ═══════════════════════════════════
// API key được mã hóa (AES-256-GCM) trước khi lưu và KHÔNG BAO GIỜ trả về client.

const CRED_SELECT = {
  id: true, label: true, provider: true, baseUrl: true, defaultModel: true,
  isActive: true, isDefault: true, apiKeyEnc: true, createdAt: true,
} as const;

// ─── GET /ai/credentials ─────────────────────────────────────────────────────
router.get("/credentials", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const creds = await prisma.companyLlmCredential.findMany({
    where:   { companyId: user.companyId },
    orderBy: [{ isDefault: "desc" }, { label: "asc" }],
    select:  CRED_SELECT,
  });
  return ok(res, creds.map(credentialDto));
}));

// ─── POST /ai/credentials ────────────────────────────────────────────────────
router.post("/credentials", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "ai", "write");

  const data = createCredentialSchema.parse(req.body);
  if (data.provider !== "ollama" && !data.apiKey) {
    return badRequest(res, "Provider này cần API key");
  }

  const dup = await prisma.companyLlmCredential.findUnique({
    where: { companyId_label: { companyId: user.companyId, label: data.label } },
  });
  if (dup) return badRequest(res, `Đã có credential tên '${data.label}'`);

  const created_ = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.companyLlmCredential.updateMany({
        where: { companyId: user.companyId, provider: data.provider as LLMProvider, isDefault: true },
        data:  { isDefault: false },
      });
    }
    return tx.companyLlmCredential.create({
      data: {
        companyId:    user.companyId,
        label:        data.label,
        provider:     data.provider as LLMProvider,
        baseUrl:      data.baseUrl ?? null,
        apiKeyEnc:    data.apiKey ? encryptSecret(data.apiKey) : null,
        defaultModel: data.defaultModel ?? null,
        isDefault:    data.isDefault,
        createdBy:    user.id,
      },
      select: CRED_SELECT,
    });
  });

  return created(res, credentialDto(created_));
}));

// ─── PATCH /ai/credentials/:id ───────────────────────────────────────────────
router.patch("/credentials/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "ai", "write");

  const id = param(req.params["id"]);
  const cred = await prisma.companyLlmCredential.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!cred) return notFound(res, "Credential");

  const data = updateCredentialSchema.parse(req.body);
  const provider = (data.provider ?? cred.provider) as LLMProvider;

  const updated = await prisma.$transaction(async (tx) => {
    if (data.isDefault === true) {
      await tx.companyLlmCredential.updateMany({
        where: { companyId: user.companyId, provider, isDefault: true, id: { not: cred.id } },
        data:  { isDefault: false },
      });
    }
    return tx.companyLlmCredential.update({
      where: { id: cred.id },
      data: {
        ...(data.label        !== undefined && { label:        data.label }),
        ...(data.provider     !== undefined && { provider }),
        ...(data.baseUrl      !== undefined && { baseUrl:      data.baseUrl ?? null }),
        ...(data.defaultModel !== undefined && { defaultModel: data.defaultModel ?? null }),
        ...(data.isDefault    !== undefined && { isDefault:    data.isDefault }),
        // Chỉ ghi đè key khi người dùng nhập key mới (để trống = giữ key cũ)
        ...(data.apiKey ? { apiKeyEnc: encryptSecret(data.apiKey) } : {}),
      },
      select: CRED_SELECT,
    });
  });

  return ok(res, credentialDto(updated));
}));

// ─── DELETE /ai/credentials/:id ──────────────────────────────────────────────
router.delete("/credentials/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "ai", "write");

  const id = param(req.params["id"]);
  const cred = await prisma.companyLlmCredential.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!cred) return notFound(res, "Credential");

  // FK onDelete: SetNull → agent đang dùng sẽ tự gỡ về fallback env.
  await prisma.companyLlmCredential.delete({ where: { id: cred.id } });
  return ok(res, { deleted: true });
}));

// ─── GET /ai/supported-models — danh sách model hỗ trợ (giới hạn UI) ──────────
router.get("/supported-models", requireAuth, wrap(async (_req, res) => {
  return ok(res, SUPPORTED_MODELS);
}));

// ─── POST /ai/agents/:agentId/chat — SSE ────────────────────────────────────

// ─── POST /ai/extract ─────────────────────────────────────────────────────────
// Trích nội dung từ ảnh (OCR) hoặc tệp văn bản để bổ sung input cho agent.
// Trả về text để client ghép vào tin nhắn gửi agent (Claude CLI chỉ nhận text).
const MAX_EXTRACT_CHARS = 15_000;

router.post("/extract", requireAuth, upload.single("file"), wrap(async (req, res) => {
  const file = req.file;
  if (!file) return badRequest(res, "Thiếu tệp đính kèm");

  const mime = file.mimetype || "application/octet-stream";
  const name = file.originalname || "tệp";

  let kind: "image" | "text" | "unsupported" = "unsupported";
  let text = "";

  if (mime.startsWith("image/")) {
    kind = "image";
    try {
      text = await ocrImage(file.buffer, name, mime);
    } catch (e) {
      return badRequest(res, `Không đọc được ảnh (OCR): ${e instanceof Error ? e.message : "lỗi"}`);
    }
    if (!text) text = "(Ảnh không có chữ nhận dạng được)";
  } else if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    /\.(txt|md|csv|json|log)$/i.test(name)
  ) {
    kind = "text";
    text = file.buffer.toString("utf8");
  } else {
    return badRequest(
      res,
      `Định dạng "${mime}" chưa hỗ trợ trích xuất. Hiện hỗ trợ: ảnh (OCR) và tệp văn bản (.txt/.md/.csv/.json).`,
    );
  }

  const truncated = text.length > MAX_EXTRACT_CHARS;
  return ok(res, { filename: name, mime, kind, text: text.slice(0, MAX_EXTRACT_CHARS), truncated });
}));

router.post("/agents/:agentId/chat", requireAuth, async (req: Request, res: Response) => {
  const user      = req.user!;
  const agentId   = param(param(req.params["agentId"]));
  const companyId = user.companyId;

  const sendSSE = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  res.writeHead(200, {
    "Content-Type":      "text/event-stream",
    "Cache-Control":     "no-cache, no-transform",
    "Connection":        "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Giữ kết nối SSE sống qua proxy/nginx khi chuỗi điều phối chạy lâu.
  const keepalive = startKeepalive(res);
  req.on("close", () => clearInterval(keepalive));

  try {
    const parsed = chatSchema.parse(req.body);

    const dbAgent   = await prisma.companyAgent.findUnique({
      where: { companyId_agentId: { companyId, agentId } },
    });
    const fileSkill = !dbAgent ? getSkill(agentId) : null;

    if (!dbAgent && !fileSkill) {
      sendSSE("error", { error: `Agent "${agentId}" không tồn tại`, code: "AGENT_NOT_FOUND" });
      clearInterval(keepalive); res.end(); return;
    }
    if (dbAgent && !dbAgent.isActive) {
      sendSSE("error", { error: `Agent "${agentId}" đang tạm ngưng`, code: "AGENT_INACTIVE" });
      clearInterval(keepalive); res.end(); return;
    }

    const companyAiMode: "full" | "assistant" = "assistant";
    const systemPrompt = dbAgent
      ? buildDbAgentSystemPrompt(dbAgent, user.companyName)
      : (fileSkill ? buildSystemPrompt(fileSkill, companyAiMode) : "");

    const baseModel  = dbAgent?.model ?? fileSkill?.preferredModel ?? "sonnet";
    const allowTools = dbAgent?.allowTools ?? false;
    const agentName  = dbAgent?.displayName ?? fileSkill?.displayName ?? agentId;

    // Phân giải credential LLM của công ty (key đã mã hóa) cho agent này.
    const resolved = await resolveAgentCredential({
      companyId,
      credentialId: dbAgent?.credentialId ?? null,
      provider:     (dbAgent?.provider ?? fileSkill?.preferredProvider ?? "claude") as "claude" | "gemini" | "ollama" | "openai",
      model:        baseModel,
    });
    const model        = resolved.model;

    // Session management
    let aiSession: {
      id: string;
      messages: { role: string; content: string }[];
    } | null = null;

    if (parsed.sessionId) {
      const found = await prisma.aISession.findFirst({
        where: { id: parsed.sessionId, companyId, userId: user.id },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
      });
      aiSession = found;
    }

    const isNew = !aiSession;

    if (!aiSession) {
      const created_ = await prisma.aISession.create({
        data: {
          companyId,
          userId:         user.id,
          agentId,
          companyAgentId: dbAgent?.id ?? null,
          title:          `${agentName} — ${new Date().toLocaleDateString("vi-VN")}`,
          mode:           "assistant",
        },
        include: { messages: true },
      });
      aiSession = { id: created_.id, messages: [] };
    }

    const sessionId = aiSession.id;
    sendSSE("session", { sessionId, agentId, agentName, isNew });

    const history = aiSession.messages
      .filter((m) => ["user", "assistant"].includes(m.role))
      .slice(-20);

    const historyText = history.map((m) =>
      `${m.role === "user" ? "Người dùng" : agentName}: ${m.content}`
    ).join("\n\n");

    const fullPrompt = historyText
      ? `${historyText}\n\nNgười dùng: ${parsed.message}`
      : parsed.message;

    await prisma.aIMessage.create({
      data: { sessionId, role: "user", content: parsed.message },
    });

    // ─── Điều phối INLINE: trợ lý lập kế hoạch → các agent chạy tuần tự → tổng hợp ──
    // Chỉ áp dụng cho agent DB có persona (loadExecAgents). Agent file-only → fallback 1 lượt.
    const execAgents = await loadExecAgents(companyId);
    const orchestrator = execAgents.find((a) => a.agentId === agentId);
    if (orchestrator) {
      const dataContext = await buildDataContext(companyId, parsed.message, user.roleId ?? null);
      let assembled = "";
      const emit = (t: string) => { assembled += t; sendSSE("text", { text: t }); };
      try {
        const { consolidated } = await orchestrateInline({
          companyId, companyName: user.companyName, orchestrator, execAgents,
          userRequest: parsed.message, transcript: historyText, dataContext,
          onProgress: (ev) => {
            if (ev.kind === "plan" && ev.steps.length > 0) {
              emit("🗂 **Kế hoạch**\n" + ev.steps.map((s, i) => `${i + 1}. ${s.title} → **${s.agent}**`).join("\n") + "\n\n⏳ Đang thực hiện...\n");
            } else if (ev.kind === "step_done") {
              emit(`\n\n### ${ev.agent}\n${ev.output}\n`);
            } else if (ev.kind === "synthesis") {
              emit(assembled ? `\n\n---\n\n${ev.text}` : ev.text);
            }
          },
        });
        const finalText = assembled.trim() || consolidated || "(không có nội dung)";
        await prisma.aIMessage.create({ data: { sessionId, role: "assistant", content: finalText } });
        await prisma.aISession.update({
          where: { id: sessionId },
          data: { ...(isNew && parsed.message.length > 5 ? { title: parsed.message.slice(0, 80) } : {}), updatedAt: new Date() },
        });
        sendSSE("result", { text: finalText, sessionId, durationMs: 0, usage: { inputTokens: 0, outputTokens: 0, cacheRead: 0, totalCostUsd: 0 } });
      } catch (e) {
        sendSSE("error", { error: e instanceof Error ? e.message : "Lỗi điều phối", code: "STREAM_ERROR" });
      }
      clearInterval(keepalive);
      res.write("event: done\ndata: {}\n\n");
      res.end();
      return;
    }

    let assistantText = "";
    let totalCostUsd = 0;
    let outputTokens = 0;
    let inputTokens  = 0;
    let cacheRead    = 0;

    // Provider non-Claude (Gemini/Ollama/OpenAI-compatible):
    //  - allowTools=true  → vòng lặp function-calling (runToolLoop) với vsme-tools (read-only).
    //  - allowTools=false → gọi REST 1 lượt (completeNonClaude).
    // Cả hai đều non-stream → phát 1 event text rồi result.
    if (resolved.provider !== "claude") {
      try {
        const out = allowTools
          ? await (async () => {
              const r = await runToolLoop({
                resolved, systemPrompt, userPrompt: fullPrompt,
                ctx: { companyId, userId: user.id, roleId: user.roleId ?? null },
                includeWrite: false,
              });
              return { text: r.text, model, usage: r.usage, durationMs: r.durationMs };
            })()
          : await completeNonClaude(resolved, systemPrompt, fullPrompt);
        assistantText = out.text;
        outputTokens  = out.usage.outputTokens;
        inputTokens   = out.usage.inputTokens;
        sendSSE("text", { text: assistantText });
        await prisma.aIMessage.create({
          data: { sessionId, role: "assistant", content: assistantText, outputTokens, inputTokens },
        });
        await prisma.aISession.update({
          where: { id: sessionId },
          data: {
            ...(isNew && parsed.message.length > 5 ? { title: parsed.message.slice(0, 80) } : {}),
            updatedAt: new Date(),
          },
        });
        await prisma.lLMUsageLog.create({
          data: {
            companyId, sessionId, agentId, provider: resolved.provider as LLMProvider, model: out.model,
            inputTokens, outputTokens, cacheTokens: 0,
            costUsd: 0, latencyMs: out.durationMs, success: true,
          },
        });
        sendSSE("result", {
          text: assistantText, sessionId, durationMs: out.durationMs,
          usage: { inputTokens, outputTokens, cacheRead: 0, totalCostUsd: 0 },
        });
      } catch (e) {
        const emsg = e instanceof Error ? e.message : "Lỗi gọi LLM";
        sendSSE("error", { error: emsg, code: "STREAM_ERROR" });
        await prisma.lLMUsageLog.create({
          data: {
            companyId, sessionId, agentId, provider: resolved.provider as LLMProvider, model,
            inputTokens: 0, outputTokens: 0, cacheTokens: 0,
            costUsd: 0, latencyMs: 0, success: false, error: emsg,
          },
        }).catch(() => {});
      }
      clearInterval(keepalive);
      res.write("event: done\ndata: {}\n\n");
      res.end();
      return;
    }

    // Chuẩn hóa: gọi Claude CLI cho agent qua streamClaudeForAgent (tự áp credential + env).
    for await (const event of streamClaudeForAgent(resolved, {
      prompt: fullPrompt, systemPrompt, allowTools,
    })) {
      if (event.type === "text") {
        assistantText += event.text;
        sendSSE("text", { text: event.text });
      }
      if (event.type === "result") {
        totalCostUsd = event.usage.totalCostUsd;
        outputTokens = event.usage.outputTokens;
        inputTokens  = event.usage.inputTokens;
        cacheRead    = event.usage.cacheReadInputTokens;

        await prisma.aIMessage.create({
          data: { sessionId, role: "assistant", content: assistantText, outputTokens, inputTokens },
        });
        await prisma.aISession.update({
          where: { id: sessionId },
          data: {
            ...(isNew && parsed.message.length > 5 ? { title: parsed.message.slice(0, 80) } : {}),
            updatedAt: new Date(),
          },
        });
        await prisma.lLMUsageLog.create({
          data: {
            companyId, sessionId, agentId, provider: resolved.provider as LLMProvider, model,
            inputTokens, outputTokens, cacheTokens: cacheRead,
            costUsd: totalCostUsd, latencyMs: event.durationMs, success: true,
          },
        });
        sendSSE("result", {
          text: assistantText, sessionId, durationMs: event.durationMs,
          usage: { inputTokens, outputTokens, cacheRead, totalCostUsd },
        });
      }
      if (event.type === "error") {
        sendSSE("error", { error: event.error, code: "STREAM_ERROR" });
        await prisma.lLMUsageLog.create({
          data: {
            companyId, sessionId, agentId, provider: resolved.provider as LLMProvider, model,
            inputTokens: 0, outputTokens: 0, cacheTokens: 0,
            costUsd: 0, latencyMs: 0, success: false, error: event.error,
          },
        }).catch(() => {});
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    sendSSE("error", { error: msg, code: "INTERNAL_ERROR" });
  }

  clearInterval(keepalive);
  res.write("event: done\ndata: {}\n\n");
  res.end();
});

// ─── POST /ai/save-document — lưu nội dung tin AI thành tài liệu .md ───────────
// Dùng cho nút "Lưu tài liệu" trên mỗi tin trả lời (chat & WorkAssistant).
const saveDocSchema = z.object({
  content: z.string().min(1).max(100_000),
  name:    z.string().max(200).optional(),
});

router.post("/save-document", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const { content, name } = saveDocSchema.parse(req.body);
  // Lấy tên từ heading markdown đầu tiên, hoặc 60 ký tự đầu.
  const firstLine = content.split("\n").map((l) => l.replace(/^#+\s*/, "").trim()).find((l) => l.length > 0) ?? "";
  const docName = (name?.trim() || firstLine || "Tài liệu AI").slice(0, 200);
  const rep = await createMarkdownReport(user.companyId, user.id, docName, content);
  if (!rep) return badRequest(res, "Không lưu được tài liệu");
  return created(res, rep);
}));

// ─── POST /ai/draft-journal-entry — Trợ lý Kế Toán lập bút toán chờ duyệt ──────
// Từ nội dung trao đổi → agent kế toán sinh định khoản TT200 → tạo bút toán PENDING
// thẳng vào Sổ Cái (sourceModule='ai-assistant'), KHÔNG tạo WorkItem. Người gl:approve
// vào Kế Toán → Sổ Cái để "Ghi sổ".
const draftJeSchema = z.object({
  content: z.string().min(5).max(20_000),
  agentId: z.string().max(64).optional(),
});

router.post("/draft-journal-entry", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const { content, agentId } = draftJeSchema.parse(req.body);

  // Chọn agent kế toán: theo agentId, hoặc mặc định KTT (finance_manager)/kế toán viên/phòng Tài Chính.
  const agent = await prisma.companyAgent.findFirst({
    where: {
      companyId: user.companyId, isActive: true,
      ...(agentId
        ? { agentId }
        : { OR: [{ agentId: "finance_manager" }, { agentId: "accountant" }, { department: { contains: "Tài Chính" } }] }),
    },
    orderBy: { sortOrder: "asc" },
  });
  if (!agent) return badRequest(res, "Chưa có agent kế toán để lập bút toán");

  const systemPrompt = buildDbAgentSystemPrompt(agent, user.companyName);
  const prompt =
    `Từ nội dung trao đổi dưới đây, hãy LẬP ĐỊNH KHOẢN kế toán theo TT200. ` +
    `Mỗi dòng chỉ có "debit" HOẶC "credit" (> 0); tổng Nợ = tổng Có; dùng MÃ tài khoản (vd 1111, 4111, 3331, 131, 331, 511, 3331). ` +
    `journalCode: PT (thu tiền)/PC (chi tiền)/NKMH (mua)/NKBH (bán)/NKC (chung). ` +
    `Nếu KHÔNG đủ dữ liệu (thiếu số tiền hoặc tài khoản) → trả {"glEntry":null}.\n\n` +
    `--- NỘI DUNG ---\n${content}\n--- HẾT ---\n\n` +
    `Chỉ trả về DUY NHẤT JSON: {"glEntry":{"journalCode":"PT","description":"<diễn giải>","lines":[{"accountCode":"1111","debit":0,"credit":0}]}}`;

  const r = await runNoToolText(user.companyId, agent, { prompt, systemPrompt, timeoutMs: 90_000 });
  const gl = parseGlEntry(r.text);
  if (!gl || gl.lines.length < 2) {
    return badRequest(res, "Chưa đủ dữ liệu để lập định khoản — hãy nêu rõ số tiền & tài khoản (Nợ/Có).");
  }

  const result = await createJournalEntry({
    companyId: user.companyId,
    createdBy: user.id,
    date: new Date().toISOString().slice(0, 10),
    journalCode: gl.journalCode,
    description: gl.description ?? "Bút toán từ Trợ lý Kế Toán",
    lines: gl.lines,
    status: "pending",
    sourceModule: "ai-assistant",
  });
  if (!result.ok) return badRequest(res, result.error);
  return created(res, result.entry);
}));

// ─── GET /ai/sessions ────────────────────────────────────────────────────────

router.get("/sessions", requireAuth, wrap(async (req, res) => {
  const user    = req.user!;
  const agentId = qs(req.query["agentId"]);
  const page    = qi(req.query["page"], 1);
  const limit   = Math.min(qi(req.query["limit"], 20), 50);

  const sessions = await prisma.aISession.findMany({
    where: {
      companyId: user.companyId,
      userId:    user.id,
      ...(agentId ? { agentId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    skip:    (page - 1) * limit,
    take:    limit,
    include: { _count: { select: { messages: true } } },
  });

  return ok(res, sessions, { page, limit });
}));

// ─── GET /ai/sessions/:id/messages ───────────────────────────────────────────

router.get("/sessions/:id/messages", requireAuth, wrap(async (req, res) => {
  const user = req.user!;

  const session = await prisma.aISession.findFirst({
    where: { id: param(param(req.params["id"])), companyId: user.companyId, userId: user.id },
  });
  if (!session) return notFound(res, "Session");

  const page  = qi(req.query["page"], 1);
  const limit = Math.min(qi(req.query["limit"], 50), 100);

  const messages = await prisma.aIMessage.findMany({
    where:   { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    skip:    (page - 1) * limit,
    take:    limit,
  });

  return ok(res, messages, { page, limit });
}));

// ─── GET /ai/tasks ───────────────────────────────────────────────────────────

router.get("/tasks", requireAuth, wrap(async (req, res) => {
  const user   = req.user!;
  const status = qs(req.query["status"]) as AITaskStatus | undefined;
  const page   = qi(req.query["page"], 1);
  const limit  = Math.min(qi(req.query["limit"], 20), 50);

  const tasks = await prisma.aITask.findMany({
    where:   { companyId: user.companyId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    skip:    (page - 1) * limit,
    take:    limit,
  });

  return ok(res, tasks, { page, limit });
}));

// ─── GET /ai/usage ───────────────────────────────────────────────────────────

router.get("/usage", requireAuth, wrap(async (req, res) => {
  const user  = req.user!;
  const page  = qi(req.query["page"], 1);
  const limit = Math.min(qi(req.query["limit"], 20), 100);
  const from  = qs(req.query["from"]) ? new Date(qs(req.query["from"])!) : undefined;
  const to    = qs(req.query["to"])   ? new Date(qs(req.query["to"])!)   : undefined;
  const dateFilter = from || to ? { createdAt: { gte: from, lte: to } } : {};

  const [total, logs] = await Promise.all([
    prisma.lLMUsageLog.count({ where: { companyId: user.companyId, ...dateFilter } }),
    prisma.lLMUsageLog.findMany({
      where:   { companyId: user.companyId, ...dateFilter },
      orderBy: { createdAt: "desc" },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
  ]);

  return ok(res, logs, { total, page, limit });
}));

// ─── GET /ai/approvals ───────────────────────────────────────────────────────

router.get("/approvals", requireAuth, wrap(async (req, res) => {
  const user   = req.user!;
  const status = qsOr(req.query["status"], "pending");
  const page   = qi(req.query["page"], 1);
  const limit  = Math.min(qi(req.query["limit"], 20), 50);

  const approvals = await prisma.aIApprovalRequest.findMany({
    where:   { companyId: user.companyId, decision: status === "pending" ? null : { not: null } },
    orderBy: { createdAt: "desc" },
    skip:    (page - 1) * limit,
    take:    limit,
    include: { task: { select: { id: true, title: true, input: true, status: true } } },
  });

  return ok(res, approvals, { page, limit });
}));

// ─── PUT /ai/approvals/:id ────────────────────────────────────────────────────

router.put("/approvals/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const data = z.object({
    decision: z.enum(["approved", "rejected"]),
    comment:  z.string().max(500).optional(),
  }).parse(req.body);

  const approval = await prisma.aIApprovalRequest.findFirst({
    where: { id: param(param(req.params["id"])), companyId: user.companyId },
  });
  if (!approval) return notFound(res, "Approval");
  if (approval.decision !== null) return badRequest(res, "Approval đã được xử lý");

  const updated = await prisma.aIApprovalRequest.update({
    where: { id: approval.id },
    data: {
      decision:   data.decision === "approved" ? "approved" : "rejected",
      decidedBy:  user.id,
      decidedAt:  new Date(),
      comment:    data.comment,
    },
  });

  return ok(res, updated);
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── POST /ai/plan-tasks ─────────────────────────────────────────────────────
// Phân rã nội dung (do trợ lý AI tạo) thành danh sách công việc + đề xuất người nhận.
// Ứng viên nhận việc: chính mình + nhân sự cấp dưới + các trợ lý AI của công ty.
router.post("/plan-tasks", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const { content } = planSchema.parse(req.body);

  // Ứng viên là user: mình + cấp dưới (level thấp hơn)
  const candUsers = await getAssignableUsers(user);

  // Ứng viên là trợ lý AI (company agents + file agents)
  const dbAgents = await prisma.companyAgent.findMany({
    where: { companyId: user.companyId, isActive: true },
    select: { agentId: true, displayName: true },
  });
  const dbIds = new Set(dbAgents.map((a) => a.agentId));
  const fileAgents = getAllAgents()
    .filter((a) => !dbIds.has(a.agentId))
    .map((a) => ({ agentId: a.agentId, displayName: a.displayName }));
  const agents = [...dbAgents, ...fileAgents];

  const candidates = [
    ...candUsers.map((u) => ({ id: u.id, kind: "user" as const, name: u.name, role: u.role?.name ?? "" })),
    ...agents.map((a) => ({ id: a.agentId, kind: "agent" as const, name: a.displayName, role: "Trợ lý AI" })),
  ];

  const candList = candidates.map((c) => `- ${c.id} | ${c.name} | ${c.role}`).join("\n");
  const prompt =
    `Nội dung cần triển khai:\n${content}\n\n` +
    `Danh sách người/trợ-lý có thể nhận việc (id | tên | vai trò):\n${candList || "(trống)"}\n\n` +
    `Hãy phân rã thành các công việc cụ thể, khả thi. CHỈ trả về một JSON array, ` +
    `mỗi phần tử dạng: {"title": string, "description": string, ` +
    `"assigneeId": string|null (chọn 1 id phù hợp nhất từ danh sách trên, hoặc null nếu không rõ), ` +
    `"dueInDays": number, "priority": "urgent"|"high"|"normal"|"low"}. ` +
    `Tuyệt đối không thêm chữ nào ngoài JSON.`;

  let parsed: unknown = [];
  try {
    const r = await runClaude({
      prompt, model: "sonnet", noTools: true, timeout: 90_000,
      systemPrompt: "Bạn là trợ lý phân rã công việc cho doanh nghiệp Việt Nam. Luôn trả về JSON array hợp lệ, không markdown, không giải thích.",
    });
    const text = r.result.trim();
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start >= 0 && end > start) parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    parsed = [];
  }

  const validIds = new Set(candidates.map((c) => c.id));
  const PRIO = ["urgent", "high", "normal", "low"];
  const raw = Array.isArray(parsed) ? parsed : [];
  const tasks: PlanTask[] = raw.slice(0, 20).map((t) => {
    const o = (t ?? {}) as Record<string, unknown>;
    const aid = typeof o["assigneeId"] === "string" && validIds.has(o["assigneeId"] as string) ? (o["assigneeId"] as string) : null;
    const dd = Number(o["dueInDays"]);
    const prio = typeof o["priority"] === "string" && PRIO.includes(o["priority"] as string) ? (o["priority"] as PlanTask["priority"]) : "normal";
    return {
      title: String(o["title"] ?? "").slice(0, 200) || "Công việc",
      description: o["description"] ? String(o["description"]).slice(0, 2000) : "",
      assigneeId: aid,
      dueInDays: Number.isFinite(dd) ? Math.max(0, Math.min(365, Math.round(dd))) : 7,
      priority: prio,
    };
  });

  return ok(res, { tasks, candidates });
}));

// ─── POST /ai/describe-task ──────────────────────────────────────────────────
// Dùng AI viết MÔ TẢ rõ ràng hơn cho một công việc từ tiêu đề (+ mô tả thô nếu có).
router.post("/describe-task", requireAuth, wrap(async (req, res) => {
  const { title, description } = describeSchema.parse(req.body);

  const prompt =
    `Tiêu đề công việc: ${title}\n` +
    (description ? `Mô tả hiện có (thô): ${description}\n` : "") +
    `\nHãy viết lại thành một MÔ TẢ công việc rõ ràng, súc tích bằng tiếng Việt, ` +
    `theo cấu trúc markdown gồm các mục:\n` +
    `**Mục tiêu** (1-2 câu), **Phạm vi / Nội dung** (gạch đầu dòng các việc cần làm), ` +
    `**Kết quả kỳ vọng** (deliverable cụ thể), **Tiêu chí hoàn thành** (gạch đầu dòng, đo lường được).\n` +
    `Không bịa số liệu, tên người hay thời hạn cụ thể nếu không được cung cấp. ` +
    `Chỉ trả về nội dung mô tả, không thêm lời dẫn.`;

  let text = "";
  try {
    const r = await runClaude({
      prompt, model: "sonnet", noTools: true, timeout: 90_000,
      systemPrompt: "Bạn là trợ lý lập kế hoạch công việc cho doanh nghiệp Việt Nam. Viết mô tả công việc rõ ràng, chuyên nghiệp, có cấu trúc.",
    });
    text = r.result.trim();
  } catch {
    return badRequest(res, "Không tạo được mô tả. Vui lòng thử lại.");
  }

  if (!text) return badRequest(res, "AI không trả về nội dung. Vui lòng thử lại.");
  return ok(res, { description: text.slice(0, 4_000) });
}));

export default router;
