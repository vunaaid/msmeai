// src/modules/chat/agent-reply.ts
// Khi người dùng nhắn vào hội thoại có AI agent → agent tự load skill/role và trả lời.
//
// Cơ chế:
//  - Chỉ kích hoạt khi NGƯỜI GỬI là người thật (chống vòng lặp agent↔agent).
//  - Direct (1-1) với agent: agent luôn trả lời.
//  - Group: agent chỉ trả lời khi được nhắc tên trong tin nhắn.
//  - Sinh câu trả lời bằng runClaude (non-streaming) với system prompt theo CompanyAgent,
//    rồi đăng làm ChatMessage của agent và fan-out realtime (SSE) + web push.
//  - Chạy nền (fire-and-forget) — KHÔNG chặn response của API gửi tin.

import { prisma } from "@vsme/db/client";
import { createJournalEntry } from "@vsme/db";
import type { LLMProvider, WorkItemStatus } from "@vsme/db";
import { runClaudeForAgent } from "../../lib/agent-claude.js";
import { roleCanWriteGl, buildAgentMcpServer } from "../../lib/agent-tools.js";
import { buildDbAgentSystemPrompt } from "../../lib/agent-prompt.js";
import { resolveAgentCredential } from "../../lib/llm-credential.js";
import { completeNonClaude } from "../../lib/llm-complete.js";
import { runToolLoop } from "../../lib/llm-tool-loop.js";
import { pushToUsers, isOnline } from "../../lib/realtime.js";
import { sendPushToUsers } from "../../lib/push.js";
import { buildDataContext, createMarkdownReport } from "./agent-data.js";

interface TriggerSender { id: string; accountType: string; roleName?: string | null; roleLevel?: string | null; }

const MAX_HISTORY = 20;

export async function maybeTriggerAgentReply(
  conversationId: string,
  companyId: string,
  sender: TriggerSender,
  messageContent: string,
): Promise<void> {
  // Chống vòng lặp: tin do agent gửi thì không kích hoạt agent khác.
  if (sender.accountType === "agent") return;

  const conv = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: {
        include: {
          user: {
            select: {
              id: true, name: true, accountType: true, roleId: true,
              companyAgent: {
                select: { id: true, agentId: true, displayName: true, level: true,
                          department: true, systemPrompt: true, model: true,
                          provider: true, allowTools: true, credentialId: true, isActive: true },
              },
            },
          },
        },
      },
    },
  });
  if (!conv) return;

  // Agent tham gia hội thoại (đang hoạt động)
  const agents = conv.participants
    .map((p) => p.user)
    .filter((u) => u.accountType === "agent" && u.companyAgent?.isActive);
  if (agents.length === 0) return;

  // Direct: agent trả lời luôn.
  // Group: agent được @nhắc tên trả lời theo thứ tự được nhắc; nếu KHÔNG @ ai →
  //        trợ lý cá nhân của người gửi (trong số agent tham gia nhóm) đứng ra điều phối.
  const lower = messageContent.toLowerCase();
  let responders: typeof agents;
  if (conv.type === "direct") {
    responders = agents;
  } else {
    const mentioned = agents
      .map((a) => {
        const ca = a.companyAgent!;
        const positions = [lower.indexOf(ca.displayName.toLowerCase()), lower.indexOf(a.name.toLowerCase())]
          .filter((i) => i >= 0);
        return { agent: a, pos: positions.length ? Math.min(...positions) : -1 };
      })
      .filter((x) => x.pos >= 0)
      .sort((x, y) => x.pos - y.pos)
      .map((x) => x.agent);
    if (mentioned.length > 0) {
      responders = mentioned;
    } else {
      // Không @ ai → chọn trợ lý theo vai trò người gửi (khớp displayName, rồi level, rồi đầu DS).
      const rn = (sender.roleName ?? "").toLowerCase().trim();
      const assistant =
        (rn ? agents.find((a) => a.companyAgent!.displayName.toLowerCase().includes(rn)) : undefined) ??
        (sender.roleLevel ? agents.find((a) => a.companyAgent!.level === sender.roleLevel) : undefined) ??
        agents[0];
      responders = assistant ? [assistant] : [];
    }
  }
  if (responders.length === 0) return;

  const company = await prisma.company.findUnique({
    where: { id: companyId }, select: { name: true },
  });
  const companyName = company?.name ?? "công ty";
  const memberIds = conv.participants.map((p) => p.userId);

  // Trả lời tuần tự (thường chỉ 1 agent)
  for (const agentUser of responders) {
    await generateAndPost(conv.id, conv.type, agentUser, companyName, companyId, memberIds, sender.id, messageContent);
  }
}

// ─── Trích xuất {reply, tasks} từ output của agent ────────────────────────────

interface TaskSpec { title: string; description?: string; dueInDays?: number; priority?: string; assignTo?: string }

// Agent có thể được giao việc & tự thực thi (persona + cấu hình để gọi LLM)
export interface ExecAgent {
  userId: string;       // id user persona (để gán assignedTo)
  roleId: string | null; // role của persona → quyền đọc tài liệu
  managerId: string | null; // cấp trên trực tiếp (persona) → routing đa cấp
  agentId: string;      // slug agent
  displayName: string;
  department: string | null;
  level: string;
  systemPrompt: string;
  model: string;
  provider: LLMProvider;
  allowTools: boolean;
  credentialId: string | null; // credential LLM dùng chung của công ty (null = fallback env)
}

/**
 * Sinh text 1 lượt cho path KHÔNG dùng tool, có nhận biết provider:
 * - provider non-Claude (Gemini/Ollama) → gọi REST (completeNonClaude).
 * - provider Claude (hoặc fallback) → runClaude với credentialEnv của công ty.
 */
interface NoToolResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; totalCostUsd: number };
  durationMs: number;
}

export async function runNoToolText(
  companyId: string,
  agent: { credentialId: string | null; provider: LLMProvider; model: string },
  args: { prompt: string; systemPrompt: string; timeoutMs?: number },
): Promise<NoToolResult> {
  const resolved = await resolveAgentCredential({
    companyId,
    credentialId: agent.credentialId,
    provider: agent.provider as "claude" | "gemini" | "ollama" | "openai",
    model: agent.model,
  });
  if (resolved.provider !== "claude") {
    const out = await completeNonClaude(resolved, args.systemPrompt, args.prompt);
    return {
      text: out.text,
      usage: { inputTokens: out.usage.inputTokens, outputTokens: out.usage.outputTokens, cacheReadInputTokens: 0, totalCostUsd: 0 },
      durationMs: out.durationMs,
    };
  }
  const res = await runClaudeForAgent(resolved, {
    prompt: args.prompt, systemPrompt: args.systemPrompt, allowTools: false,
    ...(args.timeoutMs ? { timeout: args.timeoutMs } : {}),
  });
  return {
    text: res.result,
    usage: { inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, cacheReadInputTokens: res.usage.cacheReadInputTokens, totalCostUsd: res.usage.totalCostUsd },
    durationMs: res.durationMs,
  };
}

/** Kết quả chuẩn hóa giống runClaude (để tái dùng logic parse/ghi GL/log). */
interface StaffLLMResult {
  result: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; totalCostUsd: number };
  durationMs: number;
}

/**
 * Thực thi LLM cho NHÂN VIÊN có tool tra cứu (read-only):
 * - Claude → MCP server + Claude CLI (giữ nguyên).
 * - Non-Claude (gemini/ollama/openai) → vòng lặp function-calling (runToolLoop).
 * GL write KHÔNG qua tool ở đây — worker vẫn parse glEntry & ghi tất định.
 */
async function runStaffLLM(
  companyId: string,
  exec: ExecAgent,
  args: { prompt: string; systemPrompt: string; workItemId: string },
): Promise<StaffLLMResult> {
  const resolved = await resolveAgentCredential({
    companyId, credentialId: exec.credentialId,
    provider: exec.provider as "claude" | "gemini" | "ollama" | "openai", model: exec.model,
  });

  if (resolved.provider !== "claude") {
    const r = await runToolLoop({
      resolved, systemPrompt: args.systemPrompt, userPrompt: args.prompt,
      ctx: { companyId, userId: exec.userId, roleId: exec.roleId, workItemId: args.workItemId },
      includeWrite: false,
    });
    return {
      result: r.text,
      usage: { inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, cacheReadInputTokens: 0, totalCostUsd: 0 },
      durationMs: r.durationMs,
    };
  }

  // Claude: MCP + Claude CLI
  const tools = buildAgentMcpServer(companyId, exec.userId, { roleId: exec.roleId, workItemId: args.workItemId });
  const res = await runClaudeForAgent(resolved, {
    prompt: args.prompt, systemPrompt: args.systemPrompt, allowTools: true,
    mcpServers: tools.mcpServers, allowedTools: tools.allowedTools,
  });
  return {
    result: res.result,
    usage: { inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, cacheReadInputTokens: res.usage.cacheReadInputTokens, totalCostUsd: res.usage.totalCostUsd },
    durationMs: res.durationMs,
  };
}

// Trích {summary, document} từ output agent được giao (document = nội dung markdown đầy đủ).
function parseDeliverable(raw: string): { summary: string; document: string } {
  const text = raw.trim();
  const s = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(s.slice(start, end + 1)) as { summary?: unknown; document?: unknown };
      const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
      const document = typeof obj.document === "string" ? obj.document.trim() : "";
      if (summary || document) return { summary: summary || document.slice(0, 300), document };
    } catch { /* không phải JSON → coi cả khối là tài liệu */ }
  }
  return { summary: text.slice(0, 300), document: text };
}

interface GlEntryDraft {
  journalCode?: string;
  description?: string;
  lines: { accountCode?: string; debit?: number; credit?: number; description?: string }[];
}

// Trích "glEntry" (định khoản) từ JSON output của agent kế toán.
export function parseGlEntry(raw: string): GlEntryDraft | null {
  const s = raw.replace(/```json/gi, "").replace(/```/g, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a === -1 || b <= a) return null;
  try {
    const obj = JSON.parse(s.slice(a, b + 1)) as { glEntry?: unknown };
    const ge = obj.glEntry as Record<string, unknown> | null | undefined;
    if (!ge || !Array.isArray(ge["lines"])) return null;
    const lines = (ge["lines"] as Record<string, unknown>[])
      .filter((l) => l && typeof l["accountCode"] === "string")
      .map((l) => ({
        accountCode: String(l["accountCode"]),
        debit: Number(l["debit"]) || 0,
        credit: Number(l["credit"]) || 0,
        description: typeof l["description"] === "string" ? (l["description"] as string) : undefined,
      }));
    return {
      journalCode: typeof ge["journalCode"] === "string" ? (ge["journalCode"] as string) : undefined,
      description: typeof ge["description"] === "string" ? (ge["description"] as string) : undefined,
      lines,
    };
  } catch { return null; }
}

// Danh sách agent (kèm persona đang hoạt động) để giao & thực thi việc.
export async function loadExecAgents(companyId: string): Promise<ExecAgent[]> {
  const rows = await prisma.companyAgent.findMany({
    where: { companyId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
    select: {
      agentId: true, displayName: true, department: true, level: true,
      systemPrompt: true, model: true, provider: true, allowTools: true, credentialId: true,
      persona: { select: { id: true, isActive: true, roleId: true, managerId: true } },
    },
  });
  return rows
    .filter((r) => r.persona?.isActive)
    .map((r) => ({
      userId: r.persona!.id, roleId: r.persona!.roleId, managerId: r.persona!.managerId,
      agentId: r.agentId, displayName: r.displayName,
      department: r.department, level: r.level, systemPrompt: r.systemPrompt,
      model: r.model, provider: r.provider, allowTools: r.allowTools, credentialId: r.credentialId,
    }));
}

// Khớp "assignTo" (tên bộ phận/agent/level) → agent thực thi.
function resolveExecAgent(agents: ExecAgent[], target: string): ExecAgent | null {
  const t = target.toLowerCase().trim();
  if (!t) return null;
  return (
    agents.find((a) => a.agentId.toLowerCase() === t) ??
    agents.find((a) => a.displayName.toLowerCase() === t) ??
    agents.find((a) => a.displayName.toLowerCase().includes(t) || t.includes(a.displayName.toLowerCase())) ??
    agents.find((a) => (a.department ?? "").toLowerCase() !== "" &&
      ((a.department ?? "").toLowerCase() === t || t.includes((a.department ?? "").toLowerCase()))) ??
    agents.find((a) => a.level.toLowerCase() === t) ??
    null
  );
}

// ─── Điều phối INLINE (đồng bộ, KHÔNG tạo WorkItem, KHÔNG side-effect) ─────────
// Trợ lý điều phối: lập kế hoạch → các agent chạy TUẦN TỰ (agent sau dùng kết quả
// agent trước) → trợ lý TỔNG HỢP thành 1 bản. Dùng cho /chat & WorkAssistant.

export interface InlinePlanStep { assignee?: string; title: string; instruction?: string }
export type InlineProgress =
  | { kind: "plan"; steps: { agent: string; title: string }[] }
  | { kind: "step_start"; agent: string; title: string }
  | { kind: "step_done"; agent: string; output: string }
  | { kind: "synthesis"; text: string };

export interface InlineResult {
  plan: { agent: string; title: string }[];
  sections: { agent: string; output: string }[];
  consolidated: string;
}

const STEP_TIMEOUT_MS = 90_000;

// Ghi log dùng LLM (best-effort) cho 1 lượt gọi của engine.
function logInlineUsage(companyId: string, agent: ExecAgent, u: NoToolResult): void {
  void prisma.lLMUsageLog.create({
    data: {
      companyId, agentId: agent.agentId, provider: agent.provider, model: agent.model,
      inputTokens: u.usage.inputTokens, outputTokens: u.usage.outputTokens,
      cacheTokens: u.usage.cacheReadInputTokens, costUsd: u.usage.totalCostUsd,
      latencyMs: u.durationMs, success: true,
    },
  }).catch(() => {});
}

// Trợ lý lập kế hoạch: tách yêu cầu thành các bước theo thứ tự, mỗi bước gán 1 agent.
async function planInline(
  companyId: string, companyName: string, orchestrator: ExecAgent, others: ExecAgent[],
  userRequest: string, transcript: string, dataContext: string,
): Promise<InlinePlanStep[]> {
  if (others.length === 0) return [];
  const roster = others.map((a) => `- ${a.displayName} (id=${a.agentId}${a.department ? `, ${a.department}` : ""})`).join("\n");
  const systemPrompt = buildDbAgentSystemPrompt(orchestrator, companyName);
  const prompt =
    `Bạn là ${orchestrator.displayName} — trợ lý điều phối của ${companyName}. Dựa trên yêu cầu mới nhất, hãy LẬP KẾ HOẠCH: ` +
    `tách thành các bước (subtask) theo THỨ TỰ THỰC HIỆN, mỗi bước giao cho 1 agent phù hợp; bước sau có thể dùng kết quả bước trước. ` +
    `Nếu việc đơn giản hoặc tự làm được thì trả {"steps":[]}.\n\n` +
    `--- DỮ LIỆU THỰC TẾ ---\n${dataContext}\n--- HẾT ---\n\n` +
    `--- HỘI THOẠI ---\n${transcript}\n--- HẾT ---\n\n` +
    `Yêu cầu mới nhất: ${userRequest}\n\n` +
    `Agent có thể giao:\n${roster}\n\n` +
    `Chỉ trả JSON (tối đa 5 bước): {"steps":[{"assignee":"<id agent>","title":"<tên bước>","instruction":"<hướng dẫn>"}]}`;
  const res = await runNoToolText(companyId, orchestrator, { prompt, systemPrompt, timeoutMs: STEP_TIMEOUT_MS }).catch(() => null);
  if (!res) return [];
  logInlineUsage(companyId, orchestrator, res);
  const s = res.text.replace(/```json/gi, "").replace(/```/g, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a === -1 || b <= a) return [];
  try {
    const obj = JSON.parse(s.slice(a, b + 1)) as { steps?: InlinePlanStep[] };
    return (obj.steps ?? [])
      .filter((t) => t && typeof t.title === "string" && t.title.trim().length > 0)
      .map((t) => ({ assignee: t.assignee, title: t.title.trim(), instruction: t.instruction }))
      .slice(0, 5);
  } catch { return []; }
}

export async function orchestrateInline(args: {
  companyId: string; companyName: string;
  orchestrator: ExecAgent; execAgents: ExecAgent[];
  userRequest: string; transcript: string; dataContext: string;
  onProgress?: (ev: InlineProgress) => void;
}): Promise<InlineResult> {
  const { companyId, companyName, orchestrator, execAgents, userRequest, transcript, dataContext, onProgress } = args;
  const others = execAgents.filter((a) => a.userId !== orchestrator.userId);

  const rawPlan = await planInline(companyId, companyName, orchestrator, others, userRequest, transcript, dataContext);
  const steps = rawPlan
    .map((p) => ({ step: p, agent: p.assignee ? resolveExecAgent(others, p.assignee) : null }))
    .filter((x): x is { step: InlinePlanStep; agent: ExecAgent } => !!x.agent);

  // Degenerate: không có bước khả thi → trợ lý tự trả lời 1 lượt (không giao ai).
  if (steps.length === 0) {
    const systemPrompt = buildDbAgentSystemPrompt(orchestrator, companyName);
    const prompt =
      `Bạn là ${orchestrator.displayName}. Hãy THỰC HIỆN/trả lời yêu cầu NGAY dựa trên dữ liệu thực tế, tiếng Việt, có thể markdown.\n\n` +
      `--- DỮ LIỆU THỰC TẾ ---\n${dataContext}\n--- HẾT ---\n\n--- HỘI THOẠI ---\n${transcript}\n--- HẾT ---\n\nYêu cầu: ${userRequest}`;
    const r = await runNoToolText(companyId, orchestrator, { prompt, systemPrompt, timeoutMs: STEP_TIMEOUT_MS }).catch(() => null);
    if (r) logInlineUsage(companyId, orchestrator, r);
    const consolidated = (r?.text ?? "").trim() || "Xin lỗi, tôi chưa xử lý được yêu cầu này.";
    onProgress?.({ kind: "synthesis", text: consolidated });
    return { plan: [], sections: [], consolidated };
  }

  onProgress?.({ kind: "plan", steps: steps.map((s) => ({ agent: s.agent.displayName, title: s.step.title })) });

  const sections: { agent: string; output: string }[] = [];
  let priorOutputs = "";
  for (const { step, agent } of steps) {
    onProgress?.({ kind: "step_start", agent: agent.displayName, title: step.title });
    const systemPrompt = buildDbAgentSystemPrompt(agent, companyName);
    const prompt =
      `Bạn là "${agent.displayName}". Trợ lý điều phối giao bạn thực hiện 1 bước trong kế hoạch chung của ${companyName}.\n\n` +
      (priorOutputs ? `--- KẾT QUẢ CÁC BƯỚC TRƯỚC (dùng làm đầu vào) ---\n${priorOutputs}\n--- HẾT ---\n\n` : "") +
      `--- DỮ LIỆU THỰC TẾ ---\n${dataContext}\n--- HẾT ---\n\n` +
      `• Yêu cầu gốc: ${userRequest}\n• Bước của bạn: ${step.title}\n` +
      (step.instruction ? `• Hướng dẫn: ${step.instruction}\n` : "") +
      `\nHãy THỰC HIỆN ngay, tạo SẢN PHẨM markdown. Chỉ trả JSON: {"summary":"<tóm tắt>","document":"<toàn văn markdown>"}`;
    let output = "";
    try {
      const r = await runNoToolText(companyId, agent, { prompt, systemPrompt, timeoutMs: STEP_TIMEOUT_MS });
      logInlineUsage(companyId, agent, r);
      const { summary, document } = parseDeliverable(r.text);
      output = (document || summary || "").trim();
    } catch (e) {
      output = `*(Không hoàn thành: ${e instanceof Error ? e.message : "lỗi"})*`;
    }
    sections.push({ agent: agent.displayName, output });
    priorOutputs += `\n\n### ${agent.displayName} — ${step.title}\n${output}`;
    onProgress?.({ kind: "step_done", agent: agent.displayName, output });
  }

  // Trợ lý tổng hợp thành 1 bản.
  const systemPrompt = buildDbAgentSystemPrompt(orchestrator, companyName);
  const synthPrompt =
    `Bạn là ${orchestrator.displayName} — trợ lý điều phối. Các agent đã hoàn thành từng phần dưới đây. ` +
    `Hãy TỔNG HỢP thành MỘT bản kết quả markdown hoàn chỉnh, mạch lạc, tiếng Việt cho yêu cầu: "${userRequest}".\n\n` +
    `--- KẾT QUẢ TỪNG PHẦN ---\n${priorOutputs}\n--- HẾT ---\n\nChỉ trả về văn bản markdown cuối cùng (không kèm JSON, không rào đầu).`;
  const synth = await runNoToolText(companyId, orchestrator, { prompt: synthPrompt, systemPrompt, timeoutMs: STEP_TIMEOUT_MS }).catch(() => null);
  if (synth) logInlineUsage(companyId, orchestrator, synth);
  const consolidated = (synth?.text ?? "").trim() || priorOutputs.trim();
  onProgress?.({ kind: "synthesis", text: consolidated });

  return { plan: steps.map((s) => ({ agent: s.agent.displayName, title: s.step.title })), sections, consolidated };
}

// ─── Routing đa cấp: Trợ lý → Quản lý → Nhân viên. CHỈ staff được THỰC THI. ──────

export interface RouteCtx {
  conversationId: string; convType: string;
  companyId: string; companyName: string;
  memberIds: string[]; senderId: string;
  execAgents: ExecAgent[];
}

// Thông báo cho người có quyền DUYỆT GL (human, gl:approve) khi có bút toán chờ duyệt.
async function notifyGlApprovers(companyId: string, title: string, body: string): Promise<number> {
  const approvers = await prisma.user.findMany({
    where: {
      companyId, isActive: true, accountType: { not: "agent" },
      role: { permissions: { some: { permission: { moduleKey: "gl", action: "approve" } } } },
    },
    select: { id: true },
  });
  if (approvers.length === 0) return 0;
  await prisma.notification.createMany({
    data: approvers.map((u) => ({ companyId, userId: u.id, type: "ai.gl.approval", title, body, channel: "inapp" as const })),
  }).catch(() => {});
  return approvers.length;
}

// ─── Quản lý-agent AUDIT kết quả nhân viên ──────────────────────────────────
// Đạt → duyệt deliverable (completed/giữ pending cho GL). Không đạt → hủy bút toán + hủy việc.
// Bút toán tiền: agent CHỈ rà soát; ghi sổ cuối vẫn do người thật (giữ pending + đã notify).
function parseVerdict(raw: string): { pass: boolean; note: string } {
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  if (a !== -1 && b > a) {
    try {
      const o = JSON.parse(raw.slice(a, b + 1)) as { verdict?: string; note?: string };
      if (o.verdict === "fail") return { pass: false, note: (o.note ?? "").slice(0, 600) };
      if (o.verdict === "pass") return { pass: true, note: (o.note ?? "").slice(0, 600) };
    } catch { /* ignore */ }
  }
  return { pass: true, note: "Audit không trả kết luận rõ ràng — giữ nguyên kết quả." };
}

export async function auditByManager(companyId: string, companyName: string, staff: ExecAgent, workItemId: string): Promise<void> {
  if (!staff.managerId) return;
  // Quản lý phải là AGENT (có persona). Quản lý là người thật → giữ luồng người thật duyệt, bỏ audit-agent.
  const mgrUser = await prisma.user.findFirst({ where: { id: staff.managerId, companyId }, select: { companyAgentId: true } });
  if (!mgrUser?.companyAgentId) return;
  const mca = await prisma.companyAgent.findUnique({
    where: { id: mgrUser.companyAgentId },
    select: { agentId: true, displayName: true, department: true, level: true, systemPrompt: true, model: true, provider: true, allowTools: true, credentialId: true, isActive: true, persona: { select: { id: true, roleId: true, managerId: true } } },
  });
  if (!mca?.persona || !mca.isActive) return;

  const item = await prisma.workItem.findUnique({ where: { id: workItemId }, select: { title: true, description: true, status: true, completionNote: true } });
  if (!item || (item.status !== "completed" && item.status !== "pending_approval")) return;

  const glEntries = await prisma.journalEntry.findMany({
    where: { companyId, sourceRef: workItemId, status: "pending" },
    select: { id: true, number: true, description: true, lines: { select: { debit: true, credit: true, account: { select: { code: true, name: true } } } } },
  });
  const hasGl = glEntries.length > 0;
  const glText = hasGl
    ? glEntries.map((e) => `• ${e.number}: ${e.description ?? ""}\n` + e.lines.map((l) =>
        `   ${l.account?.code} ${l.account?.name}: ${Number(l.debit) > 0 ? "Nợ " + Number(l.debit).toLocaleString("vi-VN") : "Có " + Number(l.credit).toLocaleString("vi-VN")}`).join("\n")).join("\n")
    : "";

  const manager: ExecAgent = {
    userId: mca.persona.id, roleId: mca.persona.roleId, managerId: mca.persona.managerId,
    agentId: mca.agentId, displayName: mca.displayName, department: mca.department, level: mca.level,
    systemPrompt: mca.systemPrompt, model: mca.model, provider: mca.provider, allowTools: mca.allowTools,
    credentialId: mca.credentialId,
  };

  const systemPrompt = buildDbAgentSystemPrompt(manager, companyName);
  const prompt =
    `Bạn là "${manager.displayName}" (cấp quản lý). Nhân viên cấp dưới vừa HOÀN THÀNH công việc dưới đây. ` +
    `Hãy KIỂM TRA – ĐÁNH GIÁ (audit) với góc nhìn quản lý; dùng tool tra cứu dữ liệu thực tế nếu cần.\n\n` +
    `• Công việc: ${item.title}\n` + (item.description ? `• Yêu cầu: ${item.description}\n` : "") +
    `• Kết quả nhân viên báo: ${item.completionNote ?? "(trống)"}\n` +
    (hasGl ? `• Bút toán đề xuất (chờ ghi sổ):\n${glText}\n` : "") +
    `\nKết luận 'pass' nếu đạt yêu cầu${hasGl ? " & định khoản hợp lý theo TT200" : ""}; 'fail' nếu sai/thiếu/không hợp lý.\n` +
    `Chỉ trả về JSON: {"verdict":"pass"|"fail","note":"<nhận xét ngắn>"}`;

  // Claude → MCP; non-Claude → runToolLoop (read-only). Lỗi → verdict rỗng (pass theo parseVerdict mặc định).
  const res = await runStaffLLM(companyId, manager, { prompt, systemPrompt, workItemId }).catch(() => null);
  const v = parseVerdict(res?.result ?? "");
  const newNote = ((item.completionNote ?? "") + `\n\n[Audit – ${manager.displayName}] ${v.pass ? "✅ ĐẠT" : "❌ KHÔNG ĐẠT"}: ${v.note}`).slice(0, 2000);

  if (v.pass) {
    await prisma.workItem.update({ where: { id: workItemId }, data: { approvedBy: manager.userId, approvedAt: new Date(), completionNote: newNote } }).catch(() => {});
  } else {
    if (hasGl) await prisma.journalEntry.updateMany({ where: { id: { in: glEntries.map((e) => e.id) } }, data: { status: "cancelled" } }).catch(() => {});
    await prisma.workItem.update({ where: { id: workItemId }, data: { status: "cancelled" as WorkItemStatus, completionNote: newNote } }).catch(() => {});
  }
  console.log(`[audit] ${manager.agentId} → ${workItemId.slice(0, 8)}: ${v.pass ? "PASS" : "FAIL"}`);
}

// Số dư tài khoản THỰC TẾ từ bút toán ĐÃ GHI SỔ (posted) — nguồn chính thống cho báo cáo kế toán.
async function buildGlSnapshot(companyId: string): Promise<string> {
  const grouped = await prisma.journalLine.groupBy({
    by: ["accountId"], _sum: { debit: true, credit: true },
    where: { entry: { companyId, status: "posted" } },
  });
  if (grouped.length === 0) return "(Chưa có bút toán nào được ghi sổ — số dư = 0)";
  const accs = await prisma.glAccount.findMany({
    where: { companyId, id: { in: grouped.map((g) => g.accountId) } },
    select: { id: true, code: true, name: true },
  });
  const m = new Map(accs.map((a) => [a.id, a]));
  const rows = grouped.map((g) => {
    const a = m.get(g.accountId);
    return { code: a?.code ?? "?", name: a?.name ?? "", bal: Number(g._sum.debit ?? 0) - Number(g._sum.credit ?? 0) };
  }).sort((x, y) => x.code.localeCompare(y.code));
  const cash = rows.filter((r) => r.code.startsWith("111") || r.code.startsWith("112")).reduce((s, r) => s + r.bal, 0);
  return rows.map((r) => `${r.code} ${r.name}: số dư ${r.bal.toLocaleString("vi-VN")} đ`).join("\n") +
    `\n→ TIỀN & TƯƠNG ĐƯƠNG TIỀN (TK 111+112) hiện có: ${cash.toLocaleString("vi-VN")} đ`;
}

// NHÂN VIÊN (staff) thực thi việc & report. Action tác động hệ thống → chờ duyệt mới chính thức.
// Export để worker (agent-exec) tái dùng đúng logic này khi scan hàng đợi.
export async function executeAsStaff(
  ctx: RouteCtx, exec: ExecAgent, task: TaskSpec, workItemId: string,
  fromName: string, approver: ExecAgent | null,
): Promise<void> {
  const { conversationId, convType, companyId, companyName, memberIds } = ctx;
  const otherIds = memberIds.filter((id) => id !== exec.userId);
  pushToUsers(otherIds, "chat:typing", { conversationId, userId: exec.userId, name: exec.displayName, state: "start" });
  const started = Date.now();
  try {
    const dataContext = await buildDataContext(companyId, `${task.title} ${task.description ?? ""}`, exec.roleId);

    // Nhân viên có quyền ghi GL → yêu cầu trả ĐỊNH KHOẢN có cấu trúc; worker ghi bút toán bằng code
    // (deterministic, không phụ thuộc tool-calling/MCP — chạy ổn định trong tiến trình worker).
    const glEnabled = await roleCanWriteGl(exec.roleId).catch(() => false);

    // Với nghiệp vụ kế toán: nhồi SỐ DƯ THẬT từ sổ cái đã ghi sổ (tất định) để báo cáo phản ánh
    // đúng số liệu, KHÔNG bị lệ thuộc/nhầm theo nội dung tài liệu cũ.
    const glSnapshot = glEnabled ? await buildGlSnapshot(companyId).catch(() => "") : "";

    const systemPrompt = buildDbAgentSystemPrompt(exec, companyName);
    const promptHead =
      `Bạn là "${exec.displayName}" (nhân viên). "${fromName}" vừa giao việc trong hệ thống nội bộ của ${companyName}.\n\n` +
      `• Công việc: ${task.title}\n` +
      (task.description ? `• Chi tiết: ${task.description}\n` : "") +
      (glSnapshot ? `\n--- SỐ DƯ TÀI KHOẢN THỰC TẾ (đã ghi sổ — NGUỒN CHÍNH THỐNG, ưu tiên dùng) ---\n${glSnapshot}\n--- HẾT SỐ DƯ ---\n` : "") +
      `\n--- DỮ LIỆU THAM KHẢO TỪ TÀI LIỆU ---\n${dataContext}\n--- HẾT DỮ LIỆU ---\n`;

    // MỌI loại việc đều phải tạo SẢN PHẨM markdown ("document") để lưu vào phân hệ Tài liệu.
    const prompt = glEnabled
      ? promptHead +
        `\n⚙️ ĐÂY LÀ NGHIỆP VỤ KẾ TOÁN. Hãy ĐỊNH KHOẢN theo TT200 và trả trong trường "glEntry": ` +
        `mỗi dòng chỉ có "debit" HOẶC "credit" (> 0); tổng Nợ = tổng Có; dùng MÃ tài khoản (vd 1111, 4111, 3331). ` +
        `journalCode: PT (thu tiền)/PC (chi tiền)/NKMH (mua)/NKBH (bán)/NKC (chung). ` +
        `Bút toán ở trạng thái chờ cấp trên duyệt & ghi sổ. Nếu KHÔNG đủ dữ liệu định khoản → "glEntry": null + lý do ở "summary".\n` +
        `Khi báo cáo SỐ DƯ/SỐ LIỆU (vd báo cáo quỹ tiền, tiền & tương đương tiền, công nợ): PHẢI dùng "SỐ DƯ TÀI KHOẢN THỰC TẾ" ở trên (sổ cái đã ghi sổ), KHÔNG suy đoán từ tài liệu. ` +
        `Có thể dùng tool get_trial_balance/get_account_balance để đối chiếu.\n` +
        `BẮT BUỘC kèm "document": bản markdown mô tả nghiệp vụ/chứng từ (diễn giải, bảng định khoản Nợ/Có, căn cứ).\n` +
        `Chỉ trả về DUY NHẤT một JSON:\n` +
        `{"summary":"<tóm tắt>","glEntry":{"journalCode":"PT","description":"<diễn giải>","lines":[{"accountCode":"1111","debit":0,"credit":0}]},"document":"<toàn văn markdown>"}`
      : promptHead +
        `\nHãy THỰC HIỆN công việc NGAY, dựa trên dữ liệu thực tế. BẮT BUỘC tạo SẢN PHẨM dạng markdown ("document"). ` +
        `Nếu KHÔNG đủ dữ liệu, "document" vẫn phải nêu rõ hiện trạng/đề xuất (không để trống). Tiếng Việt, đúng vai trò.\n\n` +
        `Chỉ trả về DUY NHẤT một JSON hợp lệ:\n` +
        `{"summary": "<tóm tắt kết quả>", "document": "<toàn văn markdown>"}`;

    // Bật tool ĐỌC (đa module, role-scoped) để agent tự tra cứu dữ liệu trước khi trả kết quả.
    // GL write vẫn do worker ghi tất định (includeWrite=false) — ổn định, không phụ thuộc tool-calling.
    // Claude → MCP/Claude CLI. Non-Claude (gemini/ollama/openai) → vòng lặp function-calling (runToolLoop).
    const result = await runStaffLLM(companyId, exec, { prompt, systemPrompt, workItemId });
    const { summary, document } = parseDeliverable(result.result);

    // Agent kế toán trả glEntry → worker ghi bút toán (pending, gắn workItemId để duyệt/rollback).
    if (glEnabled) {
      const glEntry = parseGlEntry(result.result);
      if (glEntry && glEntry.lines.length >= 2) {
        const r = await createJournalEntry({
          companyId, createdBy: exec.userId,
          date: new Date().toISOString().slice(0, 10),
          journalCode: glEntry.journalCode,
          description: glEntry.description ?? task.title,
          lines: glEntry.lines,
          status: "pending", sourceModule: "ai-agent", sourceRef: workItemId,
        });
        if (!r.ok) console.error(`[exec] ${exec.agentId} lập bút toán lỗi: ${r.error}`);
      }
    }

    // MỌI việc đều tạo file .md trong phân hệ Tài liệu (fallback dùng summary nếu agent quên document).
    const docContent = document.trim().length > 0
      ? document
      : `# ${task.title}\n\n${summary || "(Không có nội dung chi tiết)"}`;
    const rep = await createMarkdownReport(companyId, exec.userId, task.title, docContent);
    const link = rep?.link ?? null;

    // Có action tác động hệ thống (bút toán gắn workItemId) → CHỜ DUYỆT, chưa chính thức.
    const sysCount = await prisma.journalEntry.count({ where: { companyId, sourceRef: workItemId } });
    const head = summary || "(không có nội dung)";
    console.log(`[exec] ${exec.agentId} glEnabled=${glEnabled} resultLen=${result.result.length} sysCount=${sysCount}`);

    if (sysCount > 0) {
      await prisma.workItem.update({
        where: { id: workItemId },
        data: { status: "pending_approval" as WorkItemStatus, completionNote: head.slice(0, 2000) },
      }).catch(() => {});
      const approverName = approver?.displayName ?? "cấp quản lý phụ trách";
      await notifyGlApprovers(
        companyId,
        `Bút toán chờ duyệt: ${task.title}`,
        `${exec.displayName} đã đề xuất ${sysCount} bút toán cho "${task.title}". Vào Kế Toán → Sổ Cái để kiểm tra & ghi sổ.`,
      );
      const content =
        `🧾 **${exec.displayName}** đã ĐỀ XUẤT ${sysCount} bút toán cho "${task.title}" — **chờ ${approverName} duyệt & ghi sổ**.\n\n${head}` +
        (link ? `\n\n📄 [Xem chứng từ](${link})` : "");
      await postAgentMessage(conversationId, convType, exec.userId, exec.displayName, content, companyId, memberIds, otherIds);
    } else {
      await prisma.workItem.update({
        where: { id: workItemId },
        data: { status: "completed" as WorkItemStatus, completedAt: new Date(), completionNote: `${head}${link ? `\n\nTài liệu: ${link}` : ""}`.slice(0, 2000) },
      }).catch(() => {});
      const content = link
        ? `✅ **${exec.displayName}** — "${task.title}"\n\n${head}\n\n📄 [Xem tài liệu](${link})`
        : `ℹ️ **${exec.displayName}** — "${task.title}"\n\n${head}`;
      await postAgentMessage(conversationId, convType, exec.userId, exec.displayName, content, companyId, memberIds, otherIds);
    }

    await prisma.lLMUsageLog.create({
      data: {
        companyId, agentId: exec.agentId, provider: exec.provider, model: exec.model,
        inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
        cacheTokens: result.usage.cacheReadInputTokens, costUsd: result.usage.totalCostUsd,
        latencyMs: result.durationMs, success: true,
      },
    }).catch(() => {});
  } catch (err) {
    console.error(`[chat:agent] execute ${exec.agentId} lỗi:`, err);
    await postAgentMessage(
      conversationId, convType, exec.userId, exec.displayName,
      `⚠️ ${exec.displayName}: gặp sự cố khi thực hiện "${task.title}". Sẽ thử lại sau.`,
      companyId, memberIds, otherIds,
    ).catch(() => {});
    await prisma.lLMUsageLog.create({
      data: {
        companyId, agentId: exec.agentId, provider: exec.provider, model: exec.model,
        inputTokens: 0, outputTokens: 0, cacheTokens: 0, costUsd: 0,
        latencyMs: Date.now() - started, success: false,
        error: err instanceof Error ? err.message : String(err),
      },
    }).catch(() => {});
  } finally {
    pushToUsers(otherIds, "chat:typing", { conversationId, userId: exec.userId, state: "stop" });
  }
}

async function generateAndPost(
  conversationId: string,
  convType: string,
  agentUser: { id: string; name: string; roleId: string | null; companyAgent: NonNullable<unknown> & {
    agentId: string; displayName: string; level: string; department: string | null;
    systemPrompt: string; model: string; provider: LLMProvider; allowTools: boolean;
    credentialId: string | null;
  } | null },
  companyName: string,
  companyId: string,
  memberIds: string[],
  senderId: string,
  triggerText: string,
): Promise<void> {
  const ca = agentUser.companyAgent;
  if (!ca) return;

  const otherIds = memberIds.filter((id) => id !== agentUser.id);

  // Báo "đang soạn..." cho các thành viên khác
  pushToUsers(otherIds, "chat:typing", { conversationId, userId: agentUser.id, name: ca.displayName, state: "start" });

  const started = Date.now();
  try {
    // Lịch sử gần nhất → transcript
    const history = await prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY,
      include: { user: { select: { id: true, name: true } } },
    });
    const transcript = history.reverse().map((m) =>
      `${m.userId === agentUser.id ? ca.displayName : m.user.name}: ${m.content}`,
    ).join("\n");

    // Roster agent + dữ liệu THẬT (ground theo quyền role của trợ lý điều phối)
    const execAgents = await loadExecAgents(companyId);
    const dataContext = await buildDataContext(companyId, triggerText, agentUser.roleId);

    // Trợ lý điều phối = chính agent đang trả lời (lấy ExecAgent đầy đủ từ roster).
    const orchestrator: ExecAgent = execAgents.find((a) => a.userId === agentUser.id) ?? {
      userId: agentUser.id, roleId: agentUser.roleId, managerId: null,
      agentId: ca.agentId, displayName: ca.displayName, department: ca.department, level: ca.level,
      systemPrompt: ca.systemPrompt, model: ca.model, provider: ca.provider,
      allowTools: ca.allowTools, credentialId: ca.credentialId,
    };

    // Điều phối INLINE: lập kế hoạch → các agent chạy tuần tự → tổng hợp 1 bản.
    // /chat đăng 2 tin: (1) kế hoạch + đang thực hiện, (2) bản tổng hợp.
    let planPosted = false;
    const { consolidated } = await orchestrateInline({
      companyId, companyName, orchestrator, execAgents,
      userRequest: triggerText, transcript, dataContext,
      onProgress: (ev) => {
        if (ev.kind === "plan" && ev.steps.length > 0 && !planPosted) {
          planPosted = true;
          const planText = `🗂 **Kế hoạch** — ${ca.displayName} điều phối:\n` +
            ev.steps.map((s, i) => `${i + 1}. ${s.title} → **${s.agent}**`).join("\n") +
            `\n\n⏳ Đang thực hiện...`;
          void postAgentMessage(conversationId, convType, agentUser.id, ca.displayName, planText, companyId, memberIds, otherIds);
        }
      },
    });

    const text = consolidated || "(không có nội dung)";
    await postAgentMessage(conversationId, convType, agentUser.id, ca.displayName, text, companyId, memberIds, otherIds);
  } catch (err) {
    console.error(`[chat:agent] ${ca.agentId} lỗi:`, err);
    await postAgentMessage(
      conversationId, convType, agentUser.id, ca.displayName,
      "Xin lỗi, tôi đang gặp sự cố khi xử lý. Vui lòng thử lại sau giây lát.",
      companyId, memberIds, otherIds,
    ).catch(() => {});
    await prisma.lLMUsageLog.create({
      data: {
        companyId, agentId: ca.agentId, provider: ca.provider, model: ca.model,
        inputTokens: 0, outputTokens: 0, cacheTokens: 0, costUsd: 0,
        latencyMs: Date.now() - started, success: false,
        error: err instanceof Error ? err.message : String(err),
      },
    }).catch(() => {});
  } finally {
    pushToUsers(otherIds, "chat:typing", { conversationId, userId: agentUser.id, state: "stop" });
  }
}

async function postAgentMessage(
  conversationId: string,
  convType: string,
  agentUserId: string,
  agentName: string,
  content: string,
  companyId: string,
  memberIds: string[],
  otherIds: string[],
): Promise<void> {
  if (!conversationId) return; // worker chạy ngoài ngữ cảnh chat → bỏ qua post
  const msg = await prisma.chatMessage.create({
    data: { conversationId, userId: agentUserId, content },
    include: { user: { select: { id: true, name: true, avatarUrl: true, accountType: true } } },
  });
  await prisma.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }).catch(() => {});
  await prisma.chatParticipant.update({
    where: { conversationId_userId: { conversationId, userId: agentUserId } },
    data:  { lastReadAt: new Date() },
  }).catch(() => {});

  // SSE realtime tới tất cả thành viên
  pushToUsers(memberIds, "chat:message", { conversationId, message: msg });

  // Web push tới người đang offline
  const offline = otherIds.filter((uid) => !isOnline(uid));
  if (offline.length > 0) {
    const preview = content.length > 80 ? content.slice(0, 80) + "…" : content;
    void sendPushToUsers(offline, {
      title: agentName,
      body:  convType === "group" ? `${agentName}: ${preview}` : preview,
      tag:   `chat:${conversationId}`,
      data:  { url: `/chat?c=${conversationId}` },
    });
  }
}
