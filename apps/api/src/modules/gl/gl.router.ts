// src/modules/gl/gl.router.ts
// Module GL — Kế Toán Tổng Hợp (General Ledger).
// Trung tâm kế toán: hệ thống tài khoản (TT200) + bút toán kép.
//
//  POST   /gl/seed                      — seed Chart of Accounts (TT200) + nhật ký mặc định
//  GET    /gl/accounts                  — danh mục tài khoản (?type=&q=&leafOnly=1)
//  POST   /gl/accounts                  — thêm tài khoản chi tiết
//  PUT    /gl/accounts/:id              — sửa tên / khóa tài khoản
//  GET    /gl/journals                  — danh sách nhật ký
//  POST   /gl/journals                  — thêm nhật ký
//  GET    /gl/entries                   — danh sách bút toán (?status=&from=&to=&limit=)
//  GET    /gl/entries/:id               — chi tiết bút toán + dòng
//  POST   /gl/entries                   — tạo bút toán nháp (validate Nợ = Có)
//  PUT    /gl/entries/:id               — sửa bút toán nháp
//  DELETE /gl/entries/:id               — xóa bút toán nháp
//  POST   /gl/entries/:id/submit        — nộp duyệt (draft → pending)
//  POST   /gl/entries/:id/post          — ghi sổ (→ posted, gán kỳ)
//  POST   /gl/entries/:id/reverse       — đảo bút toán
//  GET    /gl/reports/trial-balance     — bảng cân đối số phát sinh (CĐSPS)

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import type { GlAccountType, JournalType } from "@vsme/db";
import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { hasPermission } from "../../lib/rbac.js";
import { ok, created, notFound, badRequest, noContent, forbidden, conflict, wrap } from "../../lib/response.js";
import { qs, qi, param } from "../../lib/query.js";
import { TT200_ACCOUNTS, DEFAULT_JOURNALS, accountTypeFromCode } from "./tt200-accounts.js";

const router = Router();

// ─── Phân quyền (RBAC) ────────────────────────────────────────────────────────
// Mọi route GL yêu cầu quyền trên module 'gl':
//   • GET            → gl:read   (xem sổ, danh mục, báo cáo)
//   • ghi/sửa/xóa    → gl:write  (nhập bút toán, tài khoản, nhật ký, seed)
//   • ghi sổ / đảo   → gl:approve (hành vi duyệt — KTT/CFO)
// company_admin / system_admin được bypass trong hasPermission.
function glGuard(req: Request, res: Response, next: NextFunction): void {
  const last = req.path.split("/").filter(Boolean).pop() ?? "";
  const action =
    last === "post" || last === "reverse" || last === "approve" || last === "rollback" || last === "reject" || last === "close" || last === "reopen"
      ? "approve"
      : req.method === "GET"
        ? "read"
        : "write";
  if (!hasPermission(req.user, "gl", action)) {
    forbidden(res, `Không có quyền ${action} trên module Kế Toán Tổng Hợp`);
    return;
  }
  next();
}

router.use(requireAuth, glGuard);

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Quy tiền về cents (số nguyên) để so sánh chính xác. */
const cents = (n: number) => Math.round(n * 100);

/** Chuyển Decimal (Prisma) → number cho JSON gọn. */
const num = (v: unknown) => (v == null ? 0 : Number(v));

/** Tìm code cha dài nhất là tiền tố của code (trong tập đã biết). */
function parentCodeOf(code: string, all: Set<string>): string | null {
  for (let len = code.length - 1; len >= 3; len--) {
    const prefix = code.slice(0, len);
    if (all.has(prefix)) return prefix;
  }
  return null;
}

/** Lấy (hoặc tạo) năm + kỳ kế toán cho 1 ngày. Trả về period. */
async function getOrCreatePeriod(companyId: string, date: Date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  const fy = await prisma.fiscalYear.upsert({
    where: { companyId_year: { companyId, year } },
    create: {
      companyId,
      year,
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year, 11, 31)),
    },
    update: {},
  });

  return prisma.fiscalPeriod.upsert({
    where: { fiscalYearId_month: { fiscalYearId: fy.id, month } },
    create: {
      companyId,
      fiscalYearId: fy.id,
      month,
      startDate: new Date(Date.UTC(year, month - 1, 1)),
      endDate: new Date(Date.UTC(year, month, 0)),
    },
    update: {},
  });
}

/** Sinh số bút toán kế tiếp: BT{year}-{seq}. Dựa trên MAX số hiện có (không dùng count —
 *  tránh trùng sau khi xóa). Lỗi đua P2002 đã được error-handler trả 409. */
async function nextEntryNumber(companyId: string, year: number): Promise<string> {
  const prefix = `BT${year}-`;
  const rows = await prisma.journalEntry.findMany({
    where: { companyId, number: { startsWith: prefix } }, select: { number: true },
  });
  const maxSeq = rows.reduce((m, r) => Math.max(m, parseInt(r.number.slice(prefix.length), 10) || 0), 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

// ─── Seed Chart of Accounts ──────────────────────────────────────────────────

router.post("/seed", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;

  // Nhật ký mặc định
  for (const j of DEFAULT_JOURNALS) {
    await prisma.journal.upsert({
      where: { companyId_code: { companyId, code: j.code } },
      create: { companyId, code: j.code, name: j.name, type: j.type as JournalType },
      update: {},
    });
  }

  // Tính cấu trúc cây từ danh mục TT200
  const allCodes = new Set(TT200_ACCOUNTS.map(([c]) => c));
  const nonLeaf = new Set<string>();
  for (const [c] of TT200_ACCOUNTS) {
    const parent = parentCodeOf(c, allCodes);
    if (parent) nonLeaf.add(parent);
  }

  // Tạo theo thứ tự code ngắn → dài để parent luôn tồn tại trước
  const sorted = [...TT200_ACCOUNTS].sort((a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0]));
  const codeToId = new Map<string, string>();
  let createdCount = 0;

  // Map sẵn các TK đã có
  const existing = await prisma.glAccount.findMany({
    where: { companyId },
    select: { id: true, code: true },
  });
  for (const a of existing) codeToId.set(a.code, a.id);

  for (const [code, name] of sorted) {
    if (codeToId.has(code)) continue;
    const parentCode = parentCodeOf(code, allCodes);
    const acc = await prisma.glAccount.create({
      data: {
        companyId,
        code,
        name,
        type: accountTypeFromCode(code) as GlAccountType,
        level: code.length - 2,
        parentId: parentCode ? codeToId.get(parentCode) ?? null : null,
        isLeaf: !nonLeaf.has(code),
      },
    });
    codeToId.set(code, acc.id);
    createdCount++;
  }

  return ok(res, { created: createdCount, total: allCodes.size, journals: DEFAULT_JOURNALS.length });
}));

// ─── Accounts ─────────────────────────────────────────────────────────────────

router.get("/accounts", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const type = qs(req.query["type"]);
  const q = qs(req.query["q"])?.trim();
  const leafOnly = qs(req.query["leafOnly"]) === "1";

  const accounts = await prisma.glAccount.findMany({
    where: {
      companyId,
      ...(type ? { type: type as GlAccountType } : {}),
      ...(leafOnly ? { isLeaf: true } : {}),
      ...(q ? { OR: [{ code: { startsWith: q } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { code: "asc" },
  });

  return ok(res, accounts, { total: accounts.length });
}));

const createAccountSchema = z.object({
  code: z.string().trim().regex(/^\d{3,6}$/, "Mã TK phải là 3-6 chữ số"),
  name: z.string().trim().min(1).max(255),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense", "determination", "off_balance"]).optional(),
});

router.post("/accounts", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const parsed = createAccountSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Dữ liệu không hợp lệ", parsed.error.flatten());
  const { code, name } = parsed.data;

  const dup = await prisma.glAccount.findUnique({ where: { companyId_code: { companyId, code } } });
  if (dup) return badRequest(res, `Tài khoản ${code} đã tồn tại`);

  // Tìm cha = TK dài nhất là tiền tố
  const ancestors = await prisma.glAccount.findMany({
    where: { companyId, code: { in: prefixesOf(code) } },
    orderBy: { code: "desc" },
  });
  const parent = ancestors[0] ?? null;

  const account = await prisma.glAccount.create({
    data: {
      companyId,
      code,
      name,
      type: (parsed.data.type ?? accountTypeFromCode(code)) as GlAccountType,
      level: code.length - 2,
      parentId: parent?.id ?? null,
      isLeaf: true,
    },
  });

  // Cha không còn là TK lá (không nhập bút toán trực tiếp)
  if (parent && parent.isLeaf) {
    await prisma.glAccount.update({ where: { id: parent.id }, data: { isLeaf: false } });
  }

  return created(res, account);
}));

/** Các tiền tố hợp lệ (3..len-1) của 1 code. */
function prefixesOf(code: string): string[] {
  const out: string[] = [];
  for (let len = 3; len < code.length; len++) out.push(code.slice(0, len));
  return out;
}

const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
});

router.put("/accounts/:id", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const id = param(req.params["id"]);
  const parsed = updateAccountSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Dữ liệu không hợp lệ", parsed.error.flatten());

  const acc = await prisma.glAccount.findFirst({ where: { id, companyId } });
  if (!acc) return notFound(res, "Tài khoản");

  const updated = await prisma.glAccount.update({ where: { id }, data: parsed.data });
  return ok(res, updated);
}));

// ─── Journals ───────────────────────────────────────────────────────────────

router.get("/journals", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const journals = await prisma.journal.findMany({
    where: { companyId },
    orderBy: { code: "asc" },
  });
  return ok(res, journals);
}));

const createJournalSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(255),
  type: z.enum(["general", "cash_receipt", "cash_payment", "purchase", "sales"]).default("general"),
});

router.post("/journals", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const parsed = createJournalSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Dữ liệu không hợp lệ", parsed.error.flatten());

  const dup = await prisma.journal.findUnique({
    where: { companyId_code: { companyId, code: parsed.data.code } },
  });
  if (dup) return badRequest(res, `Nhật ký ${parsed.data.code} đã tồn tại`);

  const journal = await prisma.journal.create({
    data: { companyId, ...parsed.data, type: parsed.data.type as JournalType },
  });
  return created(res, journal);
}));

// ─── Journal Entries ──────────────────────────────────────────────────────────

const lineSchema = z.object({
  accountId: z.string().uuid(),
  debit: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
  description: z.string().max(500).optional(),
});

const createEntrySchema = z.object({
  journalId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày dạng YYYY-MM-DD"),
  description: z.string().max(1000).optional(),
  lines: z.array(lineSchema).min(2, "Cần ít nhất 2 dòng"),
});

/** Validate + tính tổng cho danh sách dòng. Trả lỗi (string) hoặc null. */
async function validateLines(
  companyId: string,
  lines: z.infer<typeof lineSchema>[],
): Promise<{ error?: string; totalDebit: number; totalCredit: number }> {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const ln of lines) {
    const hasDebit = ln.debit > 0;
    const hasCredit = ln.credit > 0;
    if (hasDebit === hasCredit) {
      return { error: "Mỗi dòng phải có Nợ hoặc Có (không đồng thời, không bằng 0)", totalDebit: 0, totalCredit: 0 };
    }
    totalDebit += ln.debit;
    totalCredit += ln.credit;
  }
  if (cents(totalDebit) !== cents(totalCredit)) {
    return { error: `Tổng Nợ (${totalDebit}) phải bằng tổng Có (${totalCredit})`, totalDebit, totalCredit };
  }
  if (cents(totalDebit) === 0) {
    return { error: "Tổng phát sinh phải lớn hơn 0", totalDebit, totalCredit };
  }

  // Tài khoản phải thuộc công ty, là TK lá và đang hoạt động
  const ids = [...new Set(lines.map((l) => l.accountId))];
  const accounts = await prisma.glAccount.findMany({ where: { id: { in: ids }, companyId } });
  const map = new Map(accounts.map((a) => [a.id, a]));
  for (const id of ids) {
    const a = map.get(id);
    if (!a) return { error: "Tài khoản không tồn tại", totalDebit, totalCredit };
    if (!a.isLeaf) return { error: `TK ${a.code} là TK tổng hợp — không nhập bút toán trực tiếp`, totalDebit, totalCredit };
    if (!a.isActive) return { error: `TK ${a.code} đã bị khóa`, totalDebit, totalCredit };
  }

  return { totalDebit, totalCredit };
}

const entryInclude = {
  journal: { select: { id: true, code: true, name: true } },
  lines: {
    orderBy: { lineNo: "asc" as const },
    include: { account: { select: { id: true, code: true, name: true } } },
  },
};

/** Chuẩn hóa entry cho JSON (Decimal → number). */
function serializeEntry(e: Record<string, unknown> & { lines?: { debit: unknown; credit: unknown }[]; totalDebit: unknown; totalCredit: unknown }) {
  return {
    ...e,
    totalDebit: num(e.totalDebit),
    totalCredit: num(e.totalCredit),
    lines: (e.lines ?? []).map((l) => ({ ...l, debit: num(l.debit), credit: num(l.credit) })),
  };
}

router.get("/entries", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const status = qs(req.query["status"]);
  const from = qs(req.query["from"]);
  const to = qs(req.query["to"]);
  const limit = Math.min(qi(req.query["limit"], 50), 200);

  const entries = await prisma.journalEntry.findMany({
    where: {
      companyId,
      ...(status ? { status: status as never } : {}),
      ...(from || to ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    include: { journal: { select: { code: true, name: true } }, _count: { select: { lines: true } } },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    take: limit,
  });

  return ok(res, entries.map((e) => ({ ...e, totalDebit: num(e.totalDebit), totalCredit: num(e.totalCredit) })));
}));

router.get("/entries/:id", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const id = param(req.params["id"]);
  const entry = await prisma.journalEntry.findFirst({ where: { id, companyId }, include: entryInclude });
  if (!entry) return notFound(res, "Bút toán");
  return ok(res, serializeEntry(entry as never));
}));

router.post("/entries", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const parsed = createEntrySchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Dữ liệu không hợp lệ", parsed.error.flatten());
  const { journalId, date, description, lines } = parsed.data;

  const journal = await prisma.journal.findFirst({ where: { id: journalId, companyId } });
  if (!journal) return badRequest(res, "Nhật ký không tồn tại");

  const v = await validateLines(companyId, lines);
  if (v.error) return badRequest(res, v.error);

  const entryDate = new Date(date);
  const number = await nextEntryNumber(companyId, entryDate.getUTCFullYear());

  const entry = await prisma.journalEntry.create({
    data: {
      companyId,
      journalId,
      number,
      date: entryDate,
      description: description ?? null,
      status: "draft",
      totalDebit: v.totalDebit,
      totalCredit: v.totalCredit,
      createdBy: req.user!.id,
      lines: {
        create: lines.map((l, i) => ({
          accountId: l.accountId,
          lineNo: i + 1,
          debit: l.debit,
          credit: l.credit,
          description: l.description ?? null,
        })),
      },
    },
    include: entryInclude,
  });

  return created(res, serializeEntry(entry as never));
}));

router.put("/entries/:id", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const id = param(req.params["id"]);
  const parsed = createEntrySchema.partial({ journalId: true, date: true }).safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Dữ liệu không hợp lệ", parsed.error.flatten());

  const existing = await prisma.journalEntry.findFirst({ where: { id, companyId } });
  if (!existing) return notFound(res, "Bút toán");
  if (existing.status !== "draft") return badRequest(res, "Chỉ sửa được bút toán ở trạng thái Nháp");

  const lines = parsed.data.lines;
  if (!lines) return badRequest(res, "Thiếu danh sách dòng");
  const v = await validateLines(companyId, lines);
  if (v.error) return badRequest(res, v.error);

  const entry = await prisma.$transaction(async (tx) => {
    await tx.journalLine.deleteMany({ where: { entryId: id } });
    return tx.journalEntry.update({
      where: { id },
      data: {
        ...(parsed.data.journalId ? { journalId: parsed.data.journalId } : {}),
        ...(parsed.data.date ? { date: new Date(parsed.data.date) } : {}),
        description: parsed.data.description ?? existing.description,
        totalDebit: v.totalDebit,
        totalCredit: v.totalCredit,
        lines: {
          create: lines.map((l, i) => ({
            accountId: l.accountId,
            lineNo: i + 1,
            debit: l.debit,
            credit: l.credit,
            description: l.description ?? null,
          })),
        },
      },
      include: entryInclude,
    });
  });

  return ok(res, serializeEntry(entry as never));
}));

router.delete("/entries/:id", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const id = param(req.params["id"]);
  const existing = await prisma.journalEntry.findFirst({ where: { id, companyId } });
  if (!existing) return notFound(res, "Bút toán");
  // Cho xóa bút toán CHƯA ghi sổ (nháp / chờ duyệt / đã hủy). Bút toán đã ghi sổ phải DÙNG đảo.
  if (existing.status === "posted" || existing.status === "reversed") {
    return badRequest(res, "Bút toán đã ghi sổ — dùng chức năng Đảo bút toán, không xóa trực tiếp");
  }
  await prisma.$transaction([
    prisma.journalLine.deleteMany({ where: { entryId: id } }),
    prisma.journalEntry.delete({ where: { id } }),
  ]);
  return noContent(res);
}));

// Từ chối bút toán CHỜ DUYỆT (pending → cancelled). Giữ bản ghi để truy vết; KHÔNG ghi sổ.
router.post("/entries/:id/reject", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const id = param(req.params["id"]);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 500) : "";
  const entry = await prisma.journalEntry.findFirst({ where: { id, companyId } });
  if (!entry) return notFound(res, "Bút toán");
  if (entry.status !== "pending" && entry.status !== "draft") {
    return badRequest(res, "Chỉ từ chối được bút toán Nháp hoặc Chờ duyệt");
  }
  const updated = await prisma.journalEntry.update({
    where: { id },
    data: { status: "cancelled", description: reason ? `${entry.description ?? ""} — [Từ chối] ${reason}`.slice(0, 500) : entry.description },
  });
  // Nếu gắn với công việc agent → ghi chú lên công việc.
  if (entry.sourceRef) {
    await prisma.workItem.updateMany({
      where: { id: entry.sourceRef, companyId, status: "pending_approval" },
      data: { status: "cancelled", completionNote: `Bút toán bị từ chối${reason ? `: ${reason}` : ""}`.slice(0, 2000) },
    }).catch(() => {});
  }
  return ok(res, { id: updated.id, status: updated.status });
}));

router.post("/entries/:id/submit", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const id = param(req.params["id"]);
  const entry = await prisma.journalEntry.findFirst({ where: { id, companyId } });
  if (!entry) return notFound(res, "Bút toán");
  if (entry.status !== "draft") return badRequest(res, "Chỉ nộp duyệt bút toán Nháp");
  const updated = await prisma.journalEntry.update({ where: { id }, data: { status: "pending" } });
  return ok(res, { id: updated.id, status: updated.status });
}));

router.post("/entries/:id/post", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const id = param(req.params["id"]);
  const entry = await prisma.journalEntry.findFirst({ where: { id, companyId } });
  if (!entry) return notFound(res, "Bút toán");
  if (entry.status !== "draft" && entry.status !== "pending") {
    return badRequest(res, "Chỉ ghi sổ bút toán ở trạng thái Nháp hoặc Chờ duyệt");
  }

  const period = await getOrCreatePeriod(companyId, entry.date);
  if (period.status === "closed") return badRequest(res, "Kỳ kế toán đã đóng — không thể ghi sổ");

  const updated = await prisma.journalEntry.update({
    where: { id },
    data: { status: "posted", periodId: period.id, postedBy: req.user!.id, postedAt: new Date() },
  });
  return ok(res, { id: updated.id, status: updated.status, periodId: updated.periodId });
}));

router.post("/entries/:id/reverse", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const id = param(req.params["id"]);
  const entry = await prisma.journalEntry.findFirst({ where: { id, companyId }, include: { lines: true } });
  if (!entry) return notFound(res, "Bút toán");
  if (entry.status !== "posted") return badRequest(res, "Chỉ đảo được bút toán đã ghi sổ");

  const today = new Date();
  const period = await getOrCreatePeriod(companyId, today);
  if (period.status === "closed") return badRequest(res, "Kỳ hiện tại đã đóng — không thể đảo");
  const number = await nextEntryNumber(companyId, today.getUTCFullYear());

  const reversal = await prisma.$transaction(async (tx) => {
    const created = await tx.journalEntry.create({
      data: {
        companyId,
        journalId: entry.journalId,
        number,
        date: today,
        description: `Đảo bút toán ${entry.number}`,
        status: "posted",
        totalDebit: num(entry.totalCredit),
        totalCredit: num(entry.totalDebit),
        reversedEntryId: entry.id,
        periodId: period.id,
        createdBy: req.user!.id,
        postedBy: req.user!.id,
        postedAt: today,
        lines: {
          create: entry.lines.map((l, i) => ({
            accountId: l.accountId,
            lineNo: i + 1,
            debit: num(l.credit),
            credit: num(l.debit),
            description: l.description,
          })),
        },
      },
      include: entryInclude,
    });
    await tx.journalEntry.update({ where: { id: entry.id }, data: { status: "reversed" } });
    return created;
  });

  return created(res, serializeEntry(reversal as never));
}));

// ─── Báo cáo: Bảng cân đối số phát sinh (CĐSPS) ───────────────────────────────

router.get("/reports/trial-balance", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const from = qs(req.query["from"]);
  const to = qs(req.query["to"]);

  const grouped = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: {
      entry: {
        companyId,
        status: "posted",
        ...(from || to ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      },
    },
    _sum: { debit: true, credit: true },
  });

  const accounts = await prisma.glAccount.findMany({
    where: { companyId, id: { in: grouped.map((g) => g.accountId) } },
    select: { id: true, code: true, name: true, type: true },
  });
  const accMap = new Map(accounts.map((a) => [a.id, a]));

  const rows = grouped
    .map((g) => {
      const a = accMap.get(g.accountId);
      const debit = num(g._sum.debit);
      const credit = num(g._sum.credit);
      return {
        accountId: g.accountId,
        code: a?.code ?? "?",
        name: a?.name ?? "",
        type: a?.type ?? null,
        debit,
        credit,
        balance: Math.round((debit - credit) * 100) / 100,
      };
    })
    .sort((x, y) => x.code.localeCompare(y.code));

  const totals = rows.reduce(
    (acc, r) => ({ debit: acc.debit + r.debit, credit: acc.credit + r.credit }),
    { debit: 0, credit: 0 },
  );

  return ok(res, { rows, totals, balanced: cents(totals.debit) === cents(totals.credit) });
}));

// ─── Báo cáo tài chính theo QUÝ / NĂM (TT200) ─────────────────────────────────
//  GET /gl/reports/financial?year=2026&quarter=2   (bỏ quarter → cả năm)
//  GET /gl/reports/financial?period=2026-05        (tháng cụ thể)
//  Tính từ bút toán ĐÃ GHI SỔ (posted). Trả về CĐKT + KQKD + LCTT + CĐPS.
router.get("/reports/financial", wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const periodParam = qs(req.query["period"]);
  let year: number, q: number, start: Date, endExcl: Date, label: string;

  const mPeriodMonth = periodParam ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodParam) : null;
  const mPeriodQ = periodParam ? /^(\d{4})-Q([1-4])$/.exec(periodParam) : null;
  if (mPeriodMonth) {
    year = Number(mPeriodMonth[1]); const mo = Number(mPeriodMonth[2]);
    start = new Date(Date.UTC(year, mo - 1, 1)); endExcl = new Date(Date.UTC(year, mo, 1));
    label = `Tháng ${mo}/${year}`; q = 0;
  } else if (mPeriodQ) {
    year = Number(mPeriodQ[1]); q = Number(mPeriodQ[2]);
    start = new Date(Date.UTC(year, (q - 1) * 3, 1)); endExcl = new Date(Date.UTC(year, q * 3, 1));
    label = `Quý ${q}/${year}`;
  } else {
    year = qi(req.query["year"], new Date().getUTCFullYear());
    const qRaw = qi(req.query["quarter"], 0);
    q = qRaw >= 1 && qRaw <= 4 ? qRaw : 0;
    start = q ? new Date(Date.UTC(year, (q - 1) * 3, 1)) : new Date(Date.UTC(year, 0, 1));
    endExcl = q ? new Date(Date.UTC(year, q * 3, 1)) : new Date(Date.UTC(year + 1, 0, 1));
    label = q ? `Quý ${q}/${year}` : `Năm ${year}`;
  }

  const accounts = await prisma.glAccount.findMany({
    where: { companyId },
    select: { id: true, code: true, name: true, type: true },
  });
  const accMap = new Map(accounts.map((a) => [a.id, a]));

  // 2 lượt tổng hợp: lũy kế đến CUỐI kỳ (CĐKT) + phát sinh TRONG kỳ (KQKD/CĐPS).
  const sumLines = (where: object) =>
    prisma.journalLine.groupBy({ by: ["accountId"], where, _sum: { debit: true, credit: true } });
  const baseWhere = { companyId, status: "posted" as const };
  const [toEnd, within] = await Promise.all([
    sumLines({ entry: { ...baseWhere, date: { lt: endExcl } } }),
    sumLines({ entry: { ...baseWhere, date: { gte: start, lt: endExcl } } }),
  ]);
  const cumMap = new Map(toEnd.map((g) => [g.accountId, { d: num(g._sum.debit), c: num(g._sum.credit) }]));
  const perMap = new Map(within.map((g) => [g.accountId, { d: num(g._sum.debit), c: num(g._sum.credit) }]));

  // ── Bảng cân đối kế toán (CĐKT) — số dư lũy kế đến cuối kỳ ──
  const assets: { code: string; name: string; amount: number }[] = [];
  const liabilities: { code: string; name: string; amount: number }[] = [];
  const equity: { code: string; name: string; amount: number }[] = [];
  let netIncomeCum = 0; // doanh thu - chi phí lũy kế → lợi nhuận chưa phân phối kỳ này
  for (const [id, s] of cumMap) {
    const a = accMap.get(id); if (!a) continue;
    const bal = s.d - s.c; // dương = dư Nợ
    if (a.type === "asset") { if (Math.round(bal) !== 0) assets.push({ code: a.code, name: a.name, amount: bal }); }
    else if (a.type === "liability") { if (Math.round(-bal) !== 0) liabilities.push({ code: a.code, name: a.name, amount: -bal }); }
    else if (a.type === "equity") { if (Math.round(-bal) !== 0) equity.push({ code: a.code, name: a.name, amount: -bal }); }
    else if (a.type === "revenue") netIncomeCum += (s.c - s.d);
    else if (a.type === "expense") netIncomeCum -= (s.d - s.c);
  }
  if (Math.round(netIncomeCum) !== 0) {
    equity.push({ code: "421", name: "Lợi nhuận sau thuế chưa phân phối (kỳ này)", amount: netIncomeCum });
  }
  const sortByCode = <T extends { code: string }>(arr: T[]) => arr.sort((x, y) => x.code.localeCompare(y.code));
  sortByCode(assets); sortByCode(liabilities); sortByCode(equity);
  const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
  const totalLiab = liabilities.reduce((s, r) => s + r.amount, 0);
  const totalEquity = equity.reduce((s, r) => s + r.amount, 0);

  // ── Kết quả kinh doanh (KQKD) — phát sinh trong kỳ ──
  const revenueRows: { code: string; name: string; amount: number }[] = [];
  const expenseRows: { code: string; name: string; amount: number }[] = [];
  for (const [id, s] of perMap) {
    const a = accMap.get(id); if (!a) continue;
    if (a.type === "revenue") { const v = s.c - s.d; if (Math.round(v) !== 0) revenueRows.push({ code: a.code, name: a.name, amount: v }); }
    else if (a.type === "expense") { const v = s.d - s.c; if (Math.round(v) !== 0) expenseRows.push({ code: a.code, name: a.name, amount: v }); }
  }
  sortByCode(revenueRows); sortByCode(expenseRows);
  const totalRevenue = revenueRows.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.amount, 0);

  // ── Lưu chuyển tiền tệ (LCTT) — trực tiếp, đơn giản theo TK tiền 111/112 ──
  const isCash = (code: string) => code.startsWith("111") || code.startsWith("112");
  let cashOpen = 0, cashIn = 0, cashOut = 0;
  for (const [id, s] of cumMap) { const a = accMap.get(id); if (a && isCash(a.code)) cashOpen += (s.d - s.c); }
  for (const [id, s] of perMap) { const a = accMap.get(id); if (a && isCash(a.code)) { cashIn += s.d; cashOut += s.c; cashOpen -= (s.d - s.c); } }
  const cashClose = cashOpen + cashIn - cashOut;

  // ── Cân đối số phát sinh (CĐPS) trong kỳ ──
  const tb = [...perMap].map(([id, s]) => {
    const a = accMap.get(id);
    return { code: a?.code ?? "?", name: a?.name ?? "", debit: s.d, credit: s.c };
  }).filter(r => Math.round(r.debit) !== 0 || Math.round(r.credit) !== 0).sort((x, y) => x.code.localeCompare(y.code));
  const tbTotals = tb.reduce((acc, r) => ({ debit: acc.debit + r.debit, credit: acc.credit + r.credit }), { debit: 0, credit: 0 });

  return ok(res, {
    period: { year, quarter: q || null, label, from: start.toISOString().slice(0, 10), to: new Date(endExcl.getTime() - 86400000).toISOString().slice(0, 10) },
    balanceSheet: {
      assets, liabilities, equity, totalAssets, totalLiabilities: totalLiab, totalEquity,
      totalResources: totalLiab + totalEquity,
      balanced: cents(totalAssets) === cents(totalLiab + totalEquity),
    },
    incomeStatement: {
      revenue: revenueRows, expense: expenseRows, totalRevenue, totalExpense,
      netIncome: totalRevenue - totalExpense,
    },
    cashFlow: { open: cashOpen, in: cashIn, out: cashOut, close: cashClose, note: "Trực tiếp (đơn giản) theo TK 111/112" },
    trialBalance: { rows: tb, totals: tbTotals, balanced: cents(tbTotals.debit) === cents(tbTotals.credit) },
  });
}));

// ─── Khóa / Mở kỳ kế toán (gl:approve) ────────────────────────────────────────
// Kỳ "closed" chặn ghi sổ/đảo bút toán (các guard period.status==="closed").

router.get("/periods", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const year = qi(req.query["year"], new Date().getUTCFullYear());
  const periods = await prisma.fiscalPeriod.findMany({
    where: { companyId, fiscalYear: { year } },
    orderBy: { month: "asc" },
    select: { id: true, month: true, status: true, startDate: true, endDate: true },
  });
  return ok(res, periods);
}));

// POST /gl/periods → tạo thủ công kỳ kế toán (upsert — idempotent)
router.post("/periods", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "gl", "configure")) return forbidden(res);
  const { year, month } = z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) }).parse(req.body);
  const period = await getOrCreatePeriod(user.companyId, new Date(Date.UTC(year, month - 1, 1)));
  return ok(res, period);
}));

router.post("/periods/:id/close", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const period = await prisma.fiscalPeriod.findFirst({ where: { id: param(req.params["id"]), companyId } });
  if (!period) return notFound(res, "Kỳ kế toán");
  // Không cho đóng kỳ khi còn bút toán nháp/chờ duyệt.
  const pending = await prisma.journalEntry.count({ where: { companyId, periodId: period.id, status: { in: ["draft", "pending"] } } });
  if (pending > 0) return conflict(res, `Còn ${pending} bút toán chưa ghi sổ trong kỳ — không thể đóng`);
  const row = await prisma.fiscalPeriod.update({ where: { id: period.id }, data: { status: "closed" } });
  return ok(res, row);
}));

router.post("/periods/:id/reopen", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const period = await prisma.fiscalPeriod.findFirst({ where: { id: param(req.params["id"]), companyId } });
  if (!period) return notFound(res, "Kỳ kế toán");
  const row = await prisma.fiscalPeriod.update({ where: { id: period.id }, data: { status: "open" } });
  return ok(res, row);
}));

// ─── Duyệt / Rollback bút toán theo CÔNG VIỆC (sourceRef = workItemId) ─────────
// Dùng cho luồng agent: nhân viên tạo bút toán pending gắn workItemId → quản lý duyệt/đảo cả cụm.

router.post("/tasks/:workItemId/approve", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const workItemId = param(req.params["workItemId"]);

  const entries = await prisma.journalEntry.findMany({
    where: { companyId, sourceRef: workItemId, status: "pending" },
  });
  if (entries.length === 0) return badRequest(res, "Không có bút toán chờ duyệt cho công việc này");

  const posted: string[] = [];
  const skipped: string[] = [];
  for (const e of entries) {
    const period = await getOrCreatePeriod(companyId, e.date);
    if (period.status === "closed") { skipped.push(e.number); continue; }
    await prisma.journalEntry.update({
      where: { id: e.id },
      data: { status: "posted", periodId: period.id, postedBy: req.user!.id, postedAt: new Date() },
    });
    posted.push(e.number);
  }

  // Chỉ hoàn thành công việc khi MỌI bút toán đã được ghi sổ (tránh lệch số liệu).
  if (skipped.length === 0) {
    await prisma.workItem.updateMany({
      where: { id: workItemId, companyId },
      data: { status: "completed", approvedBy: req.user!.id, approvedAt: new Date() },
    }).catch(() => {});
  }

  return ok(res, { approved: posted.length, numbers: posted, skipped });
}));

router.post("/tasks/:workItemId/rollback", requireAuth, wrap(async (req, res) => {
  const companyId = req.user!.companyId;
  const workItemId = param(req.params["workItemId"]);

  const entries = await prisma.journalEntry.findMany({
    where: { companyId, sourceRef: workItemId, status: { in: ["pending", "posted", "draft"] } },
    include: { lines: true },
  });
  if (entries.length === 0) return badRequest(res, "Không có bút toán để rollback cho công việc này");

  let reversed = 0;
  let deleted = 0;
  for (const e of entries) {
    if (e.status === "posted") {
      // Đã ghi sổ → tạo bút toán đảo (không xóa, giữ dấu vết)
      const today = new Date();
      const period = await getOrCreatePeriod(companyId, today);
      const number = await nextEntryNumber(companyId, today.getUTCFullYear());
      await prisma.$transaction(async (tx) => {
        await tx.journalEntry.create({
          data: {
            companyId, journalId: e.journalId, number, date: today,
            description: `Đảo (rollback) bút toán ${e.number}`,
            status: "posted", totalDebit: num(e.totalCredit), totalCredit: num(e.totalDebit),
            reversedEntryId: e.id, periodId: period.id,
            sourceModule: "ai-agent-rollback", sourceRef: workItemId,
            createdBy: req.user!.id, postedBy: req.user!.id, postedAt: today,
            lines: { create: e.lines.map((l, i) => ({
              accountId: l.accountId, lineNo: i + 1, debit: num(l.credit), credit: num(l.debit), description: l.description,
            })) },
          },
        });
        await tx.journalEntry.update({ where: { id: e.id }, data: { status: "reversed" } });
      });
      reversed++;
    } else {
      // Nháp/chờ duyệt → xóa hẳn
      await prisma.journalEntry.delete({ where: { id: e.id } });
      deleted++;
    }
  }

  await prisma.workItem.updateMany({
    where: { id: workItemId, companyId },
    data: { status: "cancelled" },
  }).catch(() => {});

  return ok(res, { reversed, deleted });
}));

export default router;
