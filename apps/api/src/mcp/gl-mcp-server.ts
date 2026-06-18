// src/mcp/gl-mcp-server.ts
// MCP stdio server (zero-dep) — expose công cụ kế toán cho Claude CLI.
// Claude CLI spawn process này, giao tiếp JSON-RPC 2.0 newline-delimited qua stdin/stdout.
// Ngữ cảnh (công ty/người dùng) nhận qua biến môi trường do mcp-config truyền vào:
//   VSME_COMPANY_ID, VSME_USER_ID (+ DATABASE_URL để @vsme/db kết nối).
//
// QUAN TRỌNG: chỉ ghi JSON-RPC ra stdout. Mọi log debug → stderr.

import { createInterface } from "node:readline";
import { createJournalEntry } from "@vsme/db";
import { prisma, Prisma } from "@vsme/db/client";
import { readDocumentText } from "@vsme/storage";

const COMPANY_ID = process.env["VSME_COMPANY_ID"] ?? "";
const USER_ID = process.env["VSME_USER_ID"] ?? "";
const WORK_ITEM_ID = process.env["VSME_WORK_ITEM_ID"] ?? ""; // để gắn bút toán ↔ công việc (duyệt/rollback)
const ROLE_ID = process.env["VSME_ROLE_ID"] ?? ""; // để phân quyền đọc tài liệu theo role

const n = (v: unknown) => (v == null ? 0 : Number(v));
const vnd = (v: unknown) => n(v).toLocaleString("vi-VN");

const SERVER_INFO = { name: "vsme", version: "0.1.0" };

const TOOLS = [
  {
    name: "create_journal_entry",
    description:
      "Lập bút toán kép vào Sổ Cái (GL) theo TT200. Dùng MÃ tài khoản (VD: 1111 tiền mặt, 4111 vốn góp, 3331 thuế GTGT). " +
      "Mỗi dòng chỉ có Nợ HOẶC Có (>0); tổng Nợ phải bằng tổng Có. " +
      "Bút toán tạo ở trạng thái 'pending' (chờ Kế toán trưởng ghi sổ).",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Ngày chứng từ YYYY-MM-DD (mặc định hôm nay)" },
        description: { type: "string", description: "Diễn giải bút toán" },
        journalCode: { type: "string", description: "Mã nhật ký: NKC/PT/PC/NKMH/NKBH (mặc định NKC)" },
        lines: {
          type: "array",
          description: "Các dòng bút toán",
          items: {
            type: "object",
            properties: {
              accountCode: { type: "string", description: "Mã TK TT200, VD 1111, 4111" },
              debit: { type: "number", description: "Số tiền ghi Nợ (VND)" },
              credit: { type: "number", description: "Số tiền ghi Có (VND)" },
              description: { type: "string" },
            },
            required: ["accountCode"],
          },
        },
      },
      required: ["date", "lines"],
    },
  },
  // ── Công cụ ĐỌC (read-only) — để agent lấy thông tin & phân tích ──
  {
    name: "get_trial_balance",
    description: "Bảng cân đối số phát sinh (CĐPS) từ bút toán ĐÃ GHI SỔ. Trả số phát sinh Nợ/Có & số dư theo tài khoản. Lọc theo khoảng ngày nếu cần.",
    inputSchema: { type: "object", properties: {
      from: { type: "string", description: "Từ ngày YYYY-MM-DD (tùy chọn)" },
      to: { type: "string", description: "Đến ngày YYYY-MM-DD (tùy chọn)" },
    } },
  },
  {
    name: "get_account_balance",
    description: "Số dư lũy kế của MỘT tài khoản (theo mã TK, vd 1111) tính từ bút toán đã ghi sổ đến ngày chỉ định.",
    inputSchema: { type: "object", properties: {
      accountCode: { type: "string", description: "Mã TK TT200, vd 1111, 4111, 331" },
      asOf: { type: "string", description: "Tính đến ngày YYYY-MM-DD (mặc định hôm nay)" },
    }, required: ["accountCode"] },
  },
  {
    name: "list_journal_entries",
    description: "Liệt kê bút toán (lịch sử) theo trạng thái/khoảng ngày. Trả số hiệu, ngày, trạng thái, diễn giải, tổng tiền.",
    inputSchema: { type: "object", properties: {
      status: { type: "string", description: "draft|pending|posted|reversed|cancelled (tùy chọn)" },
      from: { type: "string" }, to: { type: "string" },
      limit: { type: "number", description: "Số dòng tối đa (mặc định 20)" },
    } },
  },
  {
    name: "list_accounts",
    description: "Danh mục tài khoản kế toán (TT200) của công ty. Có thể lọc theo từ khóa mã/tên.",
    inputSchema: { type: "object", properties: {
      query: { type: "string", description: "Từ khóa mã hoặc tên TK (tùy chọn)" },
    } },
  },
  {
    name: "list_work_items",
    description: "Liệt kê công việc của công ty theo trạng thái. Trả tiêu đề, trạng thái, người giao/nhận, hạn.",
    inputSchema: { type: "object", properties: {
      status: { type: "string", description: "draft|active|in_progress|pending_approval|completed|cancelled (tùy chọn)" },
      limit: { type: "number", description: "Mặc định 20" },
    } },
  },
  {
    name: "search_documents",
    description: "Tìm tài liệu trong hệ thống (theo quyền role của bạn) và đọc nội dung. Dùng để tra cứu quy định/biểu mẫu/dữ liệu đã lưu.",
    inputSchema: { type: "object", properties: {
      query: { type: "string", description: "Từ khóa tên/nội dung tài liệu" },
      read: { type: "boolean", description: "true = đọc nội dung tài liệu khớp nhất (mặc định false, chỉ liệt kê)" },
    }, required: ["query"] },
  },
];

// ─── JSON-RPC I/O ──────────────────────────────────────────────────────────

function send(msg: unknown): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function reply(id: unknown, result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id: unknown, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function textResult(text: string, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

// ─── Tool execution ──────────────────────────────────────────────────────────

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const dateFilter = (from?: string, to?: string) =>
  from || to ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {};

/** Tài khoản công ty theo mã (cache nhẹ trong 1 lần chạy). */
async function accountsByCode() {
  const accs = await prisma.glAccount.findMany({ where: { companyId: COMPANY_ID }, select: { id: true, code: true, name: true, type: true } });
  return { byId: new Map(accs.map((a) => [a.id, a])), list: accs };
}

async function callRead(name: string, args: Record<string, unknown>) {
  if (name === "get_trial_balance") {
    const { byId } = await accountsByCode();
    const grouped = await prisma.journalLine.groupBy({
      by: ["accountId"], _sum: { debit: true, credit: true },
      where: { entry: { companyId: COMPANY_ID, status: "posted", ...dateFilter(str(args["from"]), str(args["to"])) } },
    });
    const rows = grouped.map((g) => { const a = byId.get(g.accountId); const d = n(g._sum.debit), c = n(g._sum.credit);
      return `${a?.code ?? "?"} ${a?.name ?? ""}: Nợ ${vnd(d)} | Có ${vnd(c)} | Dư ${vnd(d - c)}`; }).sort();
    const td = grouped.reduce((s, g) => s + n(g._sum.debit), 0), tc = grouped.reduce((s, g) => s + n(g._sum.credit), 0);
    return textResult(rows.length ? `${rows.join("\n")}\n— TỔNG: Nợ ${vnd(td)} | Có ${vnd(tc)} (cân: ${Math.round(td) === Math.round(tc)})` : "Chưa có bút toán đã ghi sổ.");
  }
  if (name === "get_account_balance") {
    const code = str(args["accountCode"]); if (!code) return textResult("Thiếu accountCode", true);
    const acc = await prisma.glAccount.findFirst({ where: { companyId: COMPANY_ID, code }, select: { id: true, code: true, name: true } });
    if (!acc) return textResult(`Không tìm thấy TK ${code}`, true);
    const asOf = str(args["asOf"]);
    const g = await prisma.journalLine.aggregate({ _sum: { debit: true, credit: true },
      where: { accountId: acc.id, entry: { companyId: COMPANY_ID, status: "posted", ...(asOf ? { date: { lte: new Date(asOf) } } : {}) } } });
    const d = n(g._sum.debit), c = n(g._sum.credit);
    return textResult(`TK ${acc.code} ${acc.name}: Nợ ${vnd(d)} | Có ${vnd(c)} | Số dư ${vnd(d - c)}${asOf ? ` (đến ${asOf})` : ""}`);
  }
  if (name === "list_journal_entries") {
    const limit = Math.min(n(args["limit"]) || 20, 100);
    const es = await prisma.journalEntry.findMany({
      where: { companyId: COMPANY_ID, ...(str(args["status"]) ? { status: str(args["status"]) as never } : {}), ...dateFilter(str(args["from"]), str(args["to"])) },
      orderBy: { date: "desc" }, take: limit,
      select: { number: true, date: true, status: true, description: true, totalDebit: true },
    });
    return textResult(es.length ? es.map((e) => `${e.number} ${e.date.toISOString().slice(0, 10)} [${e.status}] ${vnd(e.totalDebit)} — ${e.description ?? ""}`).join("\n") : "Không có bút toán khớp.");
  }
  if (name === "list_accounts") {
    const { list } = await accountsByCode();
    const qv = str(args["query"])?.toLowerCase();
    const filtered = qv ? list.filter((a) => a.code.includes(qv) || a.name.toLowerCase().includes(qv)) : list;
    return textResult(filtered.slice(0, 80).map((a) => `${a.code} ${a.name} (${a.type})`).sort().join("\n") || "Không có tài khoản.");
  }
  if (name === "list_work_items") {
    const limit = Math.min(n(args["limit"]) || 20, 100);
    const items = await prisma.workItem.findMany({
      where: { companyId: COMPANY_ID, ...(str(args["status"]) ? { status: str(args["status"]) as never } : {}) },
      orderBy: { createdAt: "desc" }, take: limit,
      select: { title: true, status: true, priority: true, dueDate: true },
    });
    return textResult(items.length ? items.map((w) => `[${w.status}] (${w.priority}) ${w.title}${w.dueDate ? ` — hạn ${w.dueDate.toISOString().slice(0, 10)}` : ""}`).join("\n") : "Không có công việc.");
  }
  if (name === "search_documents") {
    const qv = (str(args["query"]) ?? "").toLowerCase();
    const roleOr: Prisma.DocumentWhereInput[] = [{ allowedRoleIds: { equals: Prisma.DbNull } }];
    if (ROLE_ID) roleOr.push({ allowedRoleIds: { array_contains: ROLE_ID } });
    const docs = await prisma.document.findMany({
      where: { companyId: COMPANY_ID, deletedAt: null, OR: roleOr },
      select: { id: true, name: true, fileType: true }, take: 200,
    });
    const words = [...new Set(qv.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3))];
    const scored = docs.map((d) => ({ d, score: words.reduce((s, w) => s + (d.name.toLowerCase().includes(w) ? 1 : 0), 0) }))
      .filter((x) => x.score > 0 || !words.length).sort((a, b) => b.score - a.score);
    if (!scored.length) return textResult("Không tìm thấy tài liệu phù hợp (theo quyền của bạn).");
    if (args["read"] === true && scored[0]) {
      const top = scored[0].d;
      const text = await readDocumentText({ documentId: top.id, companyId: COMPANY_ID }).catch(() => "");
      return textResult(`📄 ${top.name} [${top.fileType}]:\n${text.slice(0, 4000) || "(không đọc được nội dung)"}`);
    }
    return textResult(scored.slice(0, 15).map((x) => `- ${x.d.name} [${x.d.fileType}]`).join("\n"));
  }
  return null;
}

async function callTool(name: string, args: Record<string, unknown>) {
  if (!COMPANY_ID) return textResult("Thiếu ngữ cảnh công ty (VSME_COMPANY_ID)", true);

  // Công cụ đọc
  const read = await callRead(name, args);
  if (read) return read;

  if (name !== "create_journal_entry") {
    return textResult(`Công cụ "${name}" không tồn tại`, true);
  }
  if (!USER_ID) {
    return textResult("Thiếu ngữ cảnh người dùng (VSME_USER_ID)", true);
  }

  const date =
    typeof args["date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args["date"] as string)
      ? (args["date"] as string)
      : new Date().toISOString().slice(0, 10);

  const rawLines = Array.isArray(args["lines"]) ? (args["lines"] as Record<string, unknown>[]) : [];
  const lines = rawLines.map((l) => ({
    accountCode: typeof l["accountCode"] === "string" ? (l["accountCode"] as string) : undefined,
    debit: typeof l["debit"] === "number" ? (l["debit"] as number) : undefined,
    credit: typeof l["credit"] === "number" ? (l["credit"] as number) : undefined,
    description: typeof l["description"] === "string" ? (l["description"] as string) : undefined,
  }));

  const res = await createJournalEntry({
    companyId: COMPANY_ID,
    createdBy: USER_ID,
    date,
    description: typeof args["description"] === "string" ? (args["description"] as string) : undefined,
    journalCode: typeof args["journalCode"] === "string" ? (args["journalCode"] as string) : undefined,
    lines,
    status: "pending",
    sourceModule: "ai-agent",
    sourceRef: WORK_ITEM_ID || undefined,
  });

  if (!res.ok) return textResult(`Không lập được bút toán: ${res.error}`, true);
  return textResult(
    `Đã lập bút toán ${res.entry.number} (trạng thái chờ ghi sổ), tổng phát sinh ` +
      `${res.entry.totalDebit.toLocaleString("vi-VN")} đ. Cần Kế toán trưởng/CFO kiểm tra & ghi sổ.`,
  );
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

async function handle(msg: { id?: unknown; method?: string; params?: Record<string, unknown> }): Promise<void> {
  const { id, method, params } = msg;

  // Notifications (không có id) → không trả lời
  if (id === undefined || id === null) {
    return; // vd: notifications/initialized
  }

  switch (method) {
    case "initialize": {
      const clientProto = (params?.["protocolVersion"] as string) || "2024-11-05";
      reply(id, {
        protocolVersion: clientProto,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
      return;
    }
    case "ping":
      reply(id, {});
      return;
    case "tools/list":
      reply(id, { tools: TOOLS });
      return;
    case "tools/call": {
      const name = params?.["name"] as string;
      const args = (params?.["arguments"] as Record<string, unknown>) ?? {};
      try {
        const result = await callTool(name, args);
        reply(id, result);
      } catch (e) {
        reply(id, textResult(`Lỗi thực thi: ${e instanceof Error ? e.message : String(e)}`, true));
      }
      return;
    }
    default:
      replyError(id, -32601, `Method không hỗ trợ: ${method}`);
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return; // bỏ qua dòng không phải JSON
  }
  void handle(msg);
});
rl.on("close", () => process.exit(0));
