// src/lib/agent-tool-registry.ts
// Registry tool DÙNG CHUNG cho vòng lặp function-calling của agent non-Claude
// (Gemini/Ollama/OpenAI-compatible). Mỗi tool = { definition, execute(input, ctx) } — thuần,
// KHÔNG phụ thuộc MCP/Claude CLI. Port logic GL từ src/mcp/gl-mcp-server.ts (giữ nguyên query Prisma),
// + gộp DOCUMENT_TOOLS từ @vsme/ai-sdk.
//
// Claude vẫn dùng MCP (gl-mcp-server.ts) như cũ — registry này CHỈ phục vụ non-Claude.

import { createJournalEntry } from "@vsme/db";
import { prisma, Prisma } from "@vsme/db/client";
import { readDocumentText } from "@vsme/storage";
import type { ToolDefinition } from "@vsme/ai-sdk";
import { DOCUMENT_TOOL_DEFINITIONS, isDocumentTool, executeDocumentTool } from "@vsme/ai-sdk";

export interface ToolCtx {
  companyId: string;
  userId: string;
  roleId?: string | null;
  workItemId?: string;
}

export interface ToolResult { content: string; isError?: boolean }

interface GlTool {
  definition: ToolDefinition;
  execute: (input: Record<string, unknown>, ctx: ToolCtx) => Promise<ToolResult>;
}

// ─── helpers (port từ gl-mcp-server) ─────────────────────────────────────────
const n = (v: unknown) => (v == null ? 0 : Number(v));
const vnd = (v: unknown) => n(v).toLocaleString("vi-VN");
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const ok = (content: string): ToolResult => ({ content });
const err = (content: string): ToolResult => ({ content, isError: true });
const dateFilter = (from?: string, to?: string) =>
  from || to ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {};

async function accountsByCode(companyId: string) {
  const accs = await prisma.glAccount.findMany({ where: { companyId }, select: { id: true, code: true, name: true, type: true } });
  return { byId: new Map(accs.map((a) => [a.id, a])), list: accs };
}

// ─── GL tools (read) ─────────────────────────────────────────────────────────

const getTrialBalance: GlTool = {
  definition: {
    name: "get_trial_balance",
    description: "Bảng cân đối số phát sinh (CĐPS) từ bút toán ĐÃ GHI SỔ. Trả số phát sinh Nợ/Có & số dư theo tài khoản. Lọc theo khoảng ngày nếu cần.",
    input_schema: { type: "object", properties: {
      from: { type: "string", description: "Từ ngày YYYY-MM-DD (tùy chọn)" },
      to: { type: "string", description: "Đến ngày YYYY-MM-DD (tùy chọn)" },
    } },
  },
  async execute(args, ctx) {
    const { byId } = await accountsByCode(ctx.companyId);
    const grouped = await prisma.journalLine.groupBy({
      by: ["accountId"], _sum: { debit: true, credit: true },
      where: { entry: { companyId: ctx.companyId, status: "posted", ...dateFilter(str(args["from"]), str(args["to"])) } },
    });
    const rows = grouped.map((g) => { const a = byId.get(g.accountId); const d = n(g._sum.debit), c = n(g._sum.credit);
      return `${a?.code ?? "?"} ${a?.name ?? ""}: Nợ ${vnd(d)} | Có ${vnd(c)} | Dư ${vnd(d - c)}`; }).sort();
    const td = grouped.reduce((s, g) => s + n(g._sum.debit), 0), tc = grouped.reduce((s, g) => s + n(g._sum.credit), 0);
    return ok(rows.length ? `${rows.join("\n")}\n— TỔNG: Nợ ${vnd(td)} | Có ${vnd(tc)} (cân: ${Math.round(td) === Math.round(tc)})` : "Chưa có bút toán đã ghi sổ.");
  },
};

const getAccountBalance: GlTool = {
  definition: {
    name: "get_account_balance",
    description: "Số dư lũy kế của MỘT tài khoản (theo mã TK, vd 1111) tính từ bút toán đã ghi sổ đến ngày chỉ định.",
    input_schema: { type: "object", properties: {
      accountCode: { type: "string", description: "Mã TK TT200, vd 1111, 4111, 331" },
      asOf: { type: "string", description: "Tính đến ngày YYYY-MM-DD (mặc định hôm nay)" },
    }, required: ["accountCode"] },
  },
  async execute(args, ctx) {
    const code = str(args["accountCode"]); if (!code) return err("Thiếu accountCode");
    const acc = await prisma.glAccount.findFirst({ where: { companyId: ctx.companyId, code }, select: { id: true, code: true, name: true } });
    if (!acc) return err(`Không tìm thấy TK ${code}`);
    const asOf = str(args["asOf"]);
    const g = await prisma.journalLine.aggregate({ _sum: { debit: true, credit: true },
      where: { accountId: acc.id, entry: { companyId: ctx.companyId, status: "posted", ...(asOf ? { date: { lte: new Date(asOf) } } : {}) } } });
    const d = n(g._sum.debit), c = n(g._sum.credit);
    return ok(`TK ${acc.code} ${acc.name}: Nợ ${vnd(d)} | Có ${vnd(c)} | Số dư ${vnd(d - c)}${asOf ? ` (đến ${asOf})` : ""}`);
  },
};

const listJournalEntries: GlTool = {
  definition: {
    name: "list_journal_entries",
    description: "Liệt kê bút toán (lịch sử) theo trạng thái/khoảng ngày. Trả số hiệu, ngày, trạng thái, diễn giải, tổng tiền.",
    input_schema: { type: "object", properties: {
      status: { type: "string", description: "draft|pending|posted|reversed|cancelled (tùy chọn)" },
      from: { type: "string" }, to: { type: "string" },
      limit: { type: "number", description: "Số dòng tối đa (mặc định 20)" },
    } },
  },
  async execute(args, ctx) {
    const limit = Math.min(n(args["limit"]) || 20, 100);
    const es = await prisma.journalEntry.findMany({
      where: { companyId: ctx.companyId, ...(str(args["status"]) ? { status: str(args["status"]) as never } : {}), ...dateFilter(str(args["from"]), str(args["to"])) },
      orderBy: { date: "desc" }, take: limit,
      select: { number: true, date: true, status: true, description: true, totalDebit: true },
    });
    return ok(es.length ? es.map((e) => `${e.number} ${e.date.toISOString().slice(0, 10)} [${e.status}] ${vnd(e.totalDebit)} — ${e.description ?? ""}`).join("\n") : "Không có bút toán khớp.");
  },
};

const listAccounts: GlTool = {
  definition: {
    name: "list_accounts",
    description: "Danh mục tài khoản kế toán (TT200) của công ty. Có thể lọc theo từ khóa mã/tên.",
    input_schema: { type: "object", properties: {
      query: { type: "string", description: "Từ khóa mã hoặc tên TK (tùy chọn)" },
    } },
  },
  async execute(args, ctx) {
    const { list } = await accountsByCode(ctx.companyId);
    const qv = str(args["query"])?.toLowerCase();
    const filtered = qv ? list.filter((a) => a.code.includes(qv) || a.name.toLowerCase().includes(qv)) : list;
    return ok(filtered.slice(0, 80).map((a) => `${a.code} ${a.name} (${a.type})`).sort().join("\n") || "Không có tài khoản.");
  },
};

const listWorkItems: GlTool = {
  definition: {
    name: "list_work_items",
    description: "Liệt kê công việc của công ty theo trạng thái. Trả tiêu đề, trạng thái, độ ưu tiên, hạn.",
    input_schema: { type: "object", properties: {
      status: { type: "string", description: "draft|active|in_progress|pending_approval|completed|cancelled (tùy chọn)" },
      limit: { type: "number", description: "Mặc định 20" },
    } },
  },
  async execute(args, ctx) {
    const limit = Math.min(n(args["limit"]) || 20, 100);
    const items = await prisma.workItem.findMany({
      where: { companyId: ctx.companyId, ...(str(args["status"]) ? { status: str(args["status"]) as never } : {}) },
      orderBy: { createdAt: "desc" }, take: limit,
      select: { title: true, status: true, priority: true, dueDate: true },
    });
    return ok(items.length ? items.map((w) => `[${w.status}] (${w.priority}) ${w.title}${w.dueDate ? ` — hạn ${w.dueDate.toISOString().slice(0, 10)}` : ""}`).join("\n") : "Không có công việc.");
  },
};

const searchDocuments: GlTool = {
  definition: {
    name: "search_documents",
    description: "Tìm tài liệu trong hệ thống (theo quyền role của bạn) và đọc nội dung. Dùng để tra cứu quy định/biểu mẫu/dữ liệu đã lưu.",
    input_schema: { type: "object", properties: {
      query: { type: "string", description: "Từ khóa tên/nội dung tài liệu" },
      read: { type: "boolean", description: "true = đọc nội dung tài liệu khớp nhất (mặc định false, chỉ liệt kê)" },
    }, required: ["query"] },
  },
  async execute(args, ctx) {
    const qv = (str(args["query"]) ?? "").toLowerCase();
    const roleOr: Prisma.DocumentWhereInput[] = [{ allowedRoleIds: { equals: Prisma.DbNull } }];
    if (ctx.roleId) roleOr.push({ allowedRoleIds: { array_contains: ctx.roleId } });
    const docs = await prisma.document.findMany({
      where: { companyId: ctx.companyId, deletedAt: null, OR: roleOr },
      select: { id: true, name: true, fileType: true }, take: 200,
    });
    const words = [...new Set(qv.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3))];
    const scored = docs.map((d) => ({ d, score: words.reduce((s, w) => s + (d.name.toLowerCase().includes(w) ? 1 : 0), 0) }))
      .filter((x) => x.score > 0 || !words.length).sort((a, b) => b.score - a.score);
    if (!scored.length) return ok("Không tìm thấy tài liệu phù hợp (theo quyền của bạn).");
    if (args["read"] === true && scored[0]) {
      const top = scored[0].d;
      const text = await readDocumentText({ documentId: top.id, companyId: ctx.companyId }).catch(() => "");
      return ok(`📄 ${top.name} [${top.fileType}]:\n${text.slice(0, 4000) || "(không đọc được nội dung)"}`);
    }
    return ok(scored.slice(0, 15).map((x) => `- ${x.d.name} [${x.d.fileType}]`).join("\n"));
  },
};

// ─── GL tool: create_journal_entry (write) ───────────────────────────────────

const createJournalEntryTool: GlTool = {
  definition: {
    name: "create_journal_entry",
    description:
      "Lập bút toán kép vào Sổ Cái (GL) theo TT200. Dùng MÃ tài khoản (VD: 1111 tiền mặt, 4111 vốn góp, 3331 thuế GTGT). " +
      "Mỗi dòng chỉ có Nợ HOẶC Có (>0); tổng Nợ phải bằng tổng Có. Bút toán tạo ở trạng thái 'pending' (chờ ghi sổ).",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Ngày chứng từ YYYY-MM-DD (mặc định hôm nay)" },
        description: { type: "string", description: "Diễn giải bút toán" },
        journalCode: { type: "string", description: "Mã nhật ký: NKC/PT/PC/NKMH/NKBH (mặc định NKC)" },
        lines: {
          type: "array", description: "Các dòng bút toán",
          items: { type: "object", properties: {
            accountCode: { type: "string", description: "Mã TK TT200, VD 1111, 4111" },
            debit: { type: "number", description: "Số tiền ghi Nợ (VND)" },
            credit: { type: "number", description: "Số tiền ghi Có (VND)" },
            description: { type: "string" },
          }, required: ["accountCode"] },
        },
      },
      required: ["date", "lines"],
    },
  },
  async execute(args, ctx) {
    if (!ctx.userId) return err("Thiếu ngữ cảnh người dùng");
    const date = typeof args["date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args["date"] as string)
      ? (args["date"] as string) : new Date().toISOString().slice(0, 10);
    const rawLines = Array.isArray(args["lines"]) ? (args["lines"] as Record<string, unknown>[]) : [];
    const lines = rawLines.map((l) => ({
      accountCode: typeof l["accountCode"] === "string" ? (l["accountCode"] as string) : undefined,
      debit: typeof l["debit"] === "number" ? (l["debit"] as number) : undefined,
      credit: typeof l["credit"] === "number" ? (l["credit"] as number) : undefined,
      description: typeof l["description"] === "string" ? (l["description"] as string) : undefined,
    }));
    const res = await createJournalEntry({
      companyId: ctx.companyId, createdBy: ctx.userId, date,
      description: typeof args["description"] === "string" ? (args["description"] as string) : undefined,
      journalCode: typeof args["journalCode"] === "string" ? (args["journalCode"] as string) : undefined,
      lines, status: "pending", sourceModule: "ai-agent", sourceRef: ctx.workItemId || undefined,
    });
    if (!res.ok) return err(`Không lập được bút toán: ${res.error}`);
    return ok(`Đã lập bút toán ${res.entry.number} (chờ ghi sổ), tổng phát sinh ${res.entry.totalDebit.toLocaleString("vi-VN")} đ.`);
  },
};

const GL_READ_TOOLS: GlTool[] = [getTrialBalance, getAccountBalance, listJournalEntries, listAccounts, listWorkItems, searchDocuments];
const GL_BY_NAME = new Map<string, GlTool>(
  [...GL_READ_TOOLS, createJournalEntryTool].map((t) => [t.definition.name, t]),
);

// ─── Public API ──────────────────────────────────────────────────────────────

/** Danh sách ToolDefinition cho agent (GL read [+ write] + document tools). */
export function getAgentTools(opts: { includeWrite?: boolean } = {}): ToolDefinition[] {
  const gl = GL_READ_TOOLS.map((t) => t.definition);
  if (opts.includeWrite) gl.push(createJournalEntryTool.definition);
  return [...gl, ...DOCUMENT_TOOL_DEFINITIONS];
}

/** Thực thi 1 tool theo tên (route GL → handler nội bộ; document → executeDocumentTool). */
export async function executeAgentTool(
  name: string, input: Record<string, unknown>, ctx: ToolCtx,
): Promise<ToolResult> {
  try {
    const gl = GL_BY_NAME.get(name);
    if (gl) return await gl.execute(input, ctx);
    if (isDocumentTool(name)) {
      const text = await executeDocumentTool(name, input, { companyId: ctx.companyId, userId: ctx.userId });
      return { content: text };
    }
    return err(`Công cụ "${name}" không tồn tại`);
  } catch (e) {
    return err(`Lỗi thực thi ${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
