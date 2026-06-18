// src/modules/contracts/contracts.router.ts
// Module Hợp Đồng — quản lý hợp đồng đầu vào / đầu ra, mẫu biểu, lịch thanh toán.
// Thiết kế theo docs/contracts-module-analysis.md.
//
//  GET    /contracts                       — danh sách (lọc direction/type/status/q + phân trang)
//  GET    /contracts/stats                 — KPI theo chiều (đầu vào/đầu ra), sắp hết hạn, quá hạn TT
//  GET    /contracts/role-options          — role công ty (chọn quyền xem)
//  GET    /contracts/templates             — mẫu biểu hợp đồng (DocumentTemplate category=contract)
//  POST   /contracts                       — tạo hợp đồng (tự sinh số)
//  GET    /contracts/:id                   — chi tiết (versions + schedules + signatories)
//  PUT    /contracts/:id                   — cập nhật (khi draft/review)
//  DELETE /contracts/:id                   — xóa mềm
//  POST   /contracts/ai-extract            — AI bóc tách bản thảo → trường HĐ (điền sẵn form)
//  POST   /contracts/:id/submit            — trình duyệt (→ pending_approval + ApprovalRequest)
//  POST   /contracts/:id/legal-review       — AI Pháp chế rà soát + đối chiếu luật (→ review)
//  POST   /contracts/:id/approve           — TGĐ phê duyệt (→ active "đã duyệt")
//  POST   /contracts/:id/reject            — từ chối (→ review)
//  POST   /contracts/:id/sign              — ghi nhận ký; đủ bên → active
//  POST   /contracts/:id/terminate         — chấm dứt sớm
//  GET    /contracts/:id/export-pdf         — kết xuất PDF để in/ký/đóng dấu
//  PUT    /contracts/:id/schedules         — thay toàn bộ lịch thanh toán
//  POST   /contracts/schedules/:sid/pay    — ghi nhận thu/chi một đợt
//  GET    /contracts/cash-flow-plan         — kế hoạch dòng tiền (thu/chi) từ HĐ đã duyệt

import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { prisma, Prisma } from "@vsme/db/client";
import { AuditAction } from "@vsme/db";
import type { SessionUser } from "../../lib/rbac.js";
import { writeAuditLog } from "@vsme/audit/audit-log";
import { requireAuth } from "../../middleware/auth.js";
import { ok, created, notFound, badRequest, forbidden, noContent, conflict, wrap } from "../../lib/response.js";
import { hasPermission, isCompanyAdmin } from "../../lib/rbac.js";
import { qs, qi, param } from "../../lib/query.js";
import { runClaude } from "../../lib/claude.js";
import { generateDocx, convertToPdf } from "@vsme/storage";

const router = Router();

const DIRECTIONS = ["inbound", "outbound", "internal"] as const;
const TYPES = ["sales", "service", "lease", "labor", "nda", "principle", "construction", "other"] as const;
const STATUSES = ["draft", "review", "pending_approval", "pending_signature", "active", "completed", "expired", "terminated", "cancelled"] as const;
const PAYMENT_METHODS = ["cash", "bank_transfer", "offset", "installment", "letter_of_credit", "e_wallet", "other"] as const;
const PAYMENT_TERMS = ["prepaid", "on_delivery", "net_days", "milestone", "recurring", "retention"] as const;
const PARTY_TYPES = ["customer", "vendor", "employee", "other"] as const;

// ─── Helpers quyền & truy cập ──────────────────────────────────────────────────
function hasPerm(req: Request, action: string): boolean {
  return hasPermission(req.user, "contracts", action);
}
function isContractAdmin(user: SessionUser): boolean {
  return user.accountType === "company_admin" || user.accountType === "system_admin" || user.isSuperAdmin;
}
// Where fragment: chỉ hợp đồng user được phép xem (allowedRoleIds null = toàn công ty,
// chứa roleId của user, hoặc do chính user tạo/phụ trách). Admin xem tất cả.
function contractAccessWhere(user: SessionUser): Prisma.ContractWhereInput {
  if (isContractAdmin(user)) return {};
  const or: Prisma.ContractWhereInput[] = [
    { allowedRoleIds: { equals: Prisma.DbNull } },
    { createdBy: user.id },
    { ownerId: user.id },
  ];
  for (const rid of [user.roleId, ...(user.extraRoleIds ?? [])]) {
    if (rid) or.push({ allowedRoleIds: { array_contains: rid } });
  }
  return { OR: or };
}
function normalizeAllowedRoles(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const ids = input.filter((x): x is string => typeof x === "string" && x.length > 0);
  return ids.length > 0 ? [...new Set(ids)] : null;
}

// Sinh số hợp đồng: HĐ-IN-2026-001 (đầu vào) / HĐ-OUT-2026-001 (đầu ra) / HĐ-INT-2026-001
const DIR_CODE: Record<(typeof DIRECTIONS)[number], string> = { inbound: "IN", outbound: "OUT", internal: "INT" };
async function nextContractNumber(companyId: string, direction: (typeof DIRECTIONS)[number]): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `HĐ-${DIR_CODE[direction]}-${year}-`;
  // Lấy MAX theo số (không sort chuỗi — tránh lỗi khi qua mốc 999).
  const rows = await prisma.contract.findMany({
    where: { companyId, number: { startsWith: prefix } },
    select: { number: true },
  });
  const maxSeq = rows.reduce((m, r) => Math.max(m, parseInt(r.number.slice(prefix.length), 10) || 0), 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

// Khung pháp lý VN dùng cho AI Pháp chế rà soát (đối chiếu điều/khoản).
const LEGAL_FRAMEWORK =
  "Đối chiếu với pháp luật Việt Nam, TRÍCH DẪN Điều/Khoản cụ thể: " +
  "Bộ luật Dân sự 2015 (91/2015/QH13: Đ.117 điều kiện hiệu lực, vô hiệu, Đ.357/468 lãi); " +
  "Luật Thương mại 2005 (36/2005/QH11: Đ.301 phạt vi phạm ≤8%, Đ.302 bồi thường, Đ.306 lãi chậm trả, Đ.307 quan hệ phạt–bồi thường, Đ.294 miễn trách/bất khả kháng); " +
  "Luật Doanh nghiệp 2020, Luật Đầu tư 2020 (tư cách chủ thể, người đại diện); " +
  "Bộ luật Lao động 2019 (HĐ lao động); Luật Xây dựng (HĐ thi công); Luật SHTT; Luật BVQL người tiêu dùng; " +
  "Nghị định 123/2020/NĐ-CP về hóa đơn; thanh toán ≥20tr phải chuyển khoản để khấu trừ thuế GTGT.";

// Tính thuế/giá trị từ giá trị trước thuế + thuế suất (nếu client không gửi value trực tiếp).
function computeValues(input: { valueBeforeTax?: number; taxRate?: number; value?: number }) {
  const before = input.valueBeforeTax ?? 0;
  const rate = input.taxRate ?? 0;
  const taxAmount = Math.round(before * rate) / 100;
  const value = input.value ?? before + taxAmount;
  return { valueBeforeTax: before, taxRate: rate, taxAmount, value };
}

// ═══════════════════════════════════════════════════════════════════════════
// COLLECTION-LEVEL (đặt trước /:id để không bị param nuốt)
// ═══════════════════════════════════════════════════════════════════════════

// GET /contracts/stats — KPI cho dashboard
router.get("/stats", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const base: Prisma.ContractWhereInput = { companyId: user.companyId, deletedAt: null, ...contractAccessWhere(user) };
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

  const [outActive, inActive, expiringSoon, overduePay] = await Promise.all([
    prisma.contract.aggregate({ where: { ...base, direction: "outbound", status: "active" }, _sum: { value: true }, _count: true }),
    prisma.contract.aggregate({ where: { ...base, direction: "inbound", status: "active" }, _sum: { value: true }, _count: true }),
    prisma.contract.count({ where: { ...base, status: "active", endDate: { gte: now, lte: in30 } } }),
    prisma.contractPaymentSchedule.count({
      where: { contract: base, status: { in: ["pending", "invoiced", "partially_paid"] }, dueDate: { lt: now } },
    }),
  ]);

  return ok(res, {
    outbound: { count: outActive._count, totalValue: outActive._sum.value ?? 0 },
    inbound: { count: inActive._count, totalValue: inActive._sum.value ?? 0 },
    expiringSoon,
    overduePayments: overduePay,
  });
}));

// GET /contracts/role-options — role công ty (để chọn quyền xem)
router.get("/role-options", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const roles = await prisma.role.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true, level: true },
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });
  return ok(res, roles);
}));

// GET /contracts/templates — mẫu biểu hợp đồng (hệ thống + công ty), category=contract
router.get("/templates", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const templates = await prisma.documentTemplate.findMany({
    where: { deletedAt: null, category: "contract", OR: [{ companyId: null }, { companyId: user.companyId }] },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  return ok(res, templates);
}));

// POST /contracts/ai-extract — bóc tách bản thảo AI → các trường hợp đồng (điền sẵn form)
const extractSchema = z.object({ draft: z.string().min(10).max(40_000) });
router.post("/ai-extract", requireAuth, wrap(async (req, res) => {
  if (!hasPerm(req, "write")) return forbidden(res, "Không có quyền tạo hợp đồng");
  const { draft } = extractSchema.parse(req.body);
  const prompt =
    `Từ bản thảo hợp đồng dưới đây, trích xuất thông tin và CHỈ trả về một JSON object (không markdown, không giải thích) dạng:\n` +
    `{"title":string,"direction":"inbound"|"outbound"|"internal","type":"sales"|"service"|"lease"|"labor"|"nda"|"principle"|"construction"|"other",` +
    `"partyType":"customer"|"vendor"|"employee"|"other","partyName":string,"partyTaxCode":string|null,` +
    `"valueBeforeTax":number,"taxRate":number,"paymentMethod":"cash"|"bank_transfer"|"offset"|"installment"|"letter_of_credit"|"e_wallet"|"other"|null,` +
    `"paymentTerm":"prepaid"|"on_delivery"|"net_days"|"milestone"|"recurring"|"retention"|null,"netDays":number|null,` +
    `"startDate":string|null (YYYY-MM-DD),"endDate":string|null (YYYY-MM-DD)}.\n` +
    `Quy ước: direction=outbound nếu công ty TA là bên bán/cung cấp/cho thuê (đối tác=khách hàng); inbound nếu TA là bên mua/thuê/sử dụng (đối tác=nhà cung cấp). ` +
    `valueBeforeTax là số tiền chưa thuế (VND, không dấu phân cách). Nếu không rõ trường nào, để null hoặc 0.\n\n` +
    `--- BẢN THẢO ---\n${draft}`;
  let parsed: Record<string, unknown> = {};
  try {
    const r = await runClaude({
      prompt, model: "sonnet", noTools: true, timeout: 90_000,
      systemPrompt: "Bạn là trợ lý pháp chế bóc tách dữ liệu hợp đồng cho doanh nghiệp Việt Nam. Luôn trả về JSON object hợp lệ, không markdown.",
    });
    const t = r.result.trim();
    const s = t.indexOf("{"), e = t.lastIndexOf("}");
    if (s >= 0 && e > s) parsed = JSON.parse(t.slice(s, e + 1));
  } catch { parsed = {}; }

  const pick = <T extends readonly string[]>(v: unknown, allow: T, fb: T[number] | null): T[number] | null =>
    typeof v === "string" && (allow as readonly string[]).includes(v) ? (v as T[number]) : fb;
  const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const dir = pick(parsed["direction"], DIRECTIONS, "outbound")!;
  const prefill = {
    title: typeof parsed["title"] === "string" ? String(parsed["title"]).slice(0, 300) : "",
    direction: dir,
    type: pick(parsed["type"], TYPES, "service")!,
    partyType: pick(parsed["partyType"], PARTY_TYPES, dir === "inbound" ? "vendor" : "customer")!,
    partyName: typeof parsed["partyName"] === "string" ? String(parsed["partyName"]).slice(0, 300) : "",
    partyTaxCode: typeof parsed["partyTaxCode"] === "string" ? parsed["partyTaxCode"] : "",
    valueBeforeTax: num(parsed["valueBeforeTax"]),
    taxRate: num(parsed["taxRate"] ?? 10),
    paymentMethod: pick(parsed["paymentMethod"], PAYMENT_METHODS, null),
    paymentTerm: pick(parsed["paymentTerm"], PAYMENT_TERMS, null),
    netDays: parsed["netDays"] == null ? null : num(parsed["netDays"]),
    startDate: typeof parsed["startDate"] === "string" ? parsed["startDate"] : null,
    endDate: typeof parsed["endDate"] === "string" ? parsed["endDate"] : null,
    description: draft,
  };
  return ok(res, prefill);
}));

// GET /contracts/cash-flow-plan — kế hoạch dòng tiền từ lịch TT của HĐ đã duyệt (active)
// Đầu ra = THU (inflow), đầu vào = CHI (outflow). Nhóm theo tháng.
router.get("/cash-flow-plan", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const schedules = await prisma.contractPaymentSchedule.findMany({
    where: {
      dueDate: { not: null },
      contract: { companyId: user.companyId, deletedAt: null, status: "active", ...contractAccessWhere(user) },
    },
    select: {
      id: true, dueDate: true, amount: true, paidAmount: true, status: true, description: true, installmentNo: true,
      contract: { select: { id: true, number: true, title: true, direction: true, partyName: true, currency: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  const months = new Map<string, { month: string; inflow: number; outflow: number }>();
  let totalIn = 0, totalOut = 0;
  const items = schedules.map((s) => {
    const flow: "in" | "out" = s.contract.direction === "outbound" ? "in" : "out";
    const amt = Number(s.amount);
    const remaining = amt - Number(s.paidAmount);
    const d = s.dueDate as Date;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const m = months.get(key) ?? { month: key, inflow: 0, outflow: 0 };
    if (flow === "in") { m.inflow += remaining; totalIn += remaining; } else { m.outflow += remaining; totalOut += remaining; }
    months.set(key, m);
    return {
      id: s.id, flow, dueDate: s.dueDate, amount: amt, remaining, status: s.status,
      description: s.description, installmentNo: s.installmentNo, contract: s.contract,
    };
  });
  const byMonth = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  return ok(res, { items, byMonth, totals: { inflow: totalIn, outflow: totalOut, net: totalIn - totalOut } });
}));

// GET /contracts — danh sách
router.get("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const page = qi(req.query["page"], 1);
  const limit = Math.min(qi(req.query["limit"], 50), 100);
  const direction = qs(req.query["direction"]);
  const type = qs(req.query["type"]);
  const status = qs(req.query["status"]);
  const q = qs(req.query["q"])?.trim();

  const where: Prisma.ContractWhereInput = {
    companyId: user.companyId,
    deletedAt: null,
    ...contractAccessWhere(user),
    ...(direction && (DIRECTIONS as readonly string[]).includes(direction) ? { direction: direction as (typeof DIRECTIONS)[number] } : {}),
    ...(type && (TYPES as readonly string[]).includes(type) ? { type: type as (typeof TYPES)[number] } : {}),
    ...(status && (STATUSES as readonly string[]).includes(status) ? { status: status as (typeof STATUSES)[number] } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { number: { contains: q, mode: "insensitive" } }, { partyName: { contains: q, mode: "insensitive" } }] } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { schedules: true, signatories: true } } },
    }),
    prisma.contract.count({ where }),
  ]);
  return ok(res, items, { total, page, limit });
}));

// POST /contracts — tạo hợp đồng
const createSchema = z.object({
  title: z.string().min(1).max(300),
  direction: z.enum(DIRECTIONS),
  type: z.enum(TYPES),
  partyType: z.enum(PARTY_TYPES),
  partyId: z.string().optional(),
  employeeId: z.string().uuid().nullable().optional(), // HĐ lao động → link Employee (HR)
  partyName: z.string().min(1).max(300),
  partyTaxCode: z.string().optional(),
  partyAddress: z.string().optional(),
  partyRepresentative: z.string().optional(),
  currency: z.string().max(8).optional(),
  exchangeRate: z.number().positive().optional(),
  taxInclusive: z.boolean().optional(),
  valueBeforeTax: z.number().nonnegative().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  value: z.number().nonnegative().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  paymentTerm: z.enum(PAYMENT_TERMS).optional(),
  netDays: z.number().int().nonnegative().optional(),
  signDate: z.string().datetime().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  autoRenew: z.boolean().optional(),
  templateId: z.string().uuid().optional(),
  ownerId: z.string().optional(),
  allowedRoleIds: z.array(z.string()).optional(),
  description: z.string().optional(),
});

router.post("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPerm(req, "write")) return forbidden(res, "Không có quyền tạo hợp đồng");
  const body = createSchema.parse(req.body);
  // HĐ lao động: nếu gắn nhân viên, nhân viên phải thuộc công ty (chống rò chéo tenant).
  if (body.employeeId) {
    const emp = await prisma.employee.findFirst({ where: { id: body.employeeId, companyId: user.companyId }, select: { id: true } });
    if (!emp) return badRequest(res, "Nhân viên không hợp lệ");
  }
  // Đối tác (KH/NCC): nếu gắn partyId thì phải thuộc công ty.
  if (body.partyId && (body.partyType === "customer" || body.partyType === "vendor")) {
    const p = await prisma.partner.findFirst({ where: { id: body.partyId, companyId: user.companyId }, select: { id: true } });
    if (!p) return badRequest(res, "Đối tác không hợp lệ");
  }
  const v = computeValues(body);
  const number = await nextContractNumber(user.companyId, body.direction);

  const contract = await prisma.contract.create({
    data: {
      companyId: user.companyId,
      number,
      title: body.title,
      direction: body.direction,
      type: body.type,
      status: "draft",
      partyType: body.partyType,
      partyId: body.partyId ?? null,
      employeeId: body.employeeId ?? null,
      partyName: body.partyName,
      partyTaxCode: body.partyTaxCode ?? null,
      partyAddress: body.partyAddress ?? null,
      partyRepresentative: body.partyRepresentative ?? null,
      currency: body.currency ?? "VND",
      exchangeRate: body.exchangeRate ?? 1,
      taxInclusive: body.taxInclusive ?? true,
      valueBeforeTax: v.valueBeforeTax,
      taxRate: v.taxRate,
      taxAmount: v.taxAmount,
      value: v.value,
      paymentMethod: body.paymentMethod ?? null,
      paymentTerm: body.paymentTerm ?? null,
      netDays: body.netDays ?? null,
      signDate: body.signDate ? new Date(body.signDate) : null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      autoRenew: body.autoRenew ?? false,
      templateId: body.templateId ?? null,
      ownerId: body.ownerId ?? user.id,
      createdBy: user.id,
      allowedRoleIds: normalizeAllowedRoles(body.allowedRoleIds) ?? Prisma.DbNull,
      description: body.description ?? null,
    },
  });
  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "contracts" },
    action: AuditAction.create, entityType: "Contract", entityId: contract.id,
  });
  return created(res, contract);
}));

// ═══════════════════════════════════════════════════════════════════════════
// ITEM-LEVEL
// ═══════════════════════════════════════════════════════════════════════════

async function findContract(user: SessionUser, id: string) {
  return prisma.contract.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null, ...contractAccessWhere(user) },
  });
}

// GET /contracts/:id — chi tiết
router.get("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const contract = await prisma.contract.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId, deletedAt: null, ...contractAccessWhere(user) },
    include: {
      versions: { orderBy: { versionNo: "desc" } },
      signatories: { orderBy: { createdAt: "asc" } },
      schedules: { orderBy: { installmentNo: "asc" } },
    },
  });
  if (!contract) return notFound(res, "Hợp đồng");
  return ok(res, contract);
}));

// PUT /contracts/:id — cập nhật (chỉ khi draft/review)
const updateSchema = createSchema.partial().omit({ direction: true });
router.put("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPerm(req, "write")) return forbidden(res, "Không có quyền sửa hợp đồng");
  const existing = await findContract(user, param(req.params["id"]));
  if (!existing) return notFound(res, "Hợp đồng");
  if (!["draft", "review"].includes(existing.status)) {
    return conflict(res, "Chỉ sửa được hợp đồng ở trạng thái nháp hoặc đang review");
  }
  const body = updateSchema.parse(req.body);
  if (body.employeeId) {
    const emp = await prisma.employee.findFirst({ where: { id: body.employeeId, companyId: user.companyId }, select: { id: true } });
    if (!emp) return badRequest(res, "Nhân viên không hợp lệ");
  }
  const v = computeValues({
    valueBeforeTax: body.valueBeforeTax ?? Number(existing.valueBeforeTax),
    taxRate: body.taxRate ?? existing.taxRate,
    value: body.value,
  });

  const updated = await prisma.contract.update({
    where: { id: existing.id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.partyType !== undefined ? { partyType: body.partyType } : {}),
      ...(body.partyId !== undefined ? { partyId: body.partyId } : {}),
      ...(body.employeeId !== undefined ? { employeeId: body.employeeId } : {}),
      ...(body.partyName !== undefined ? { partyName: body.partyName } : {}),
      ...(body.partyTaxCode !== undefined ? { partyTaxCode: body.partyTaxCode } : {}),
      ...(body.partyAddress !== undefined ? { partyAddress: body.partyAddress } : {}),
      ...(body.partyRepresentative !== undefined ? { partyRepresentative: body.partyRepresentative } : {}),
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
      ...(body.exchangeRate !== undefined ? { exchangeRate: body.exchangeRate } : {}),
      ...(body.taxInclusive !== undefined ? { taxInclusive: body.taxInclusive } : {}),
      valueBeforeTax: v.valueBeforeTax, taxRate: v.taxRate, taxAmount: v.taxAmount, value: v.value,
      ...(body.paymentMethod !== undefined ? { paymentMethod: body.paymentMethod } : {}),
      ...(body.paymentTerm !== undefined ? { paymentTerm: body.paymentTerm } : {}),
      ...(body.netDays !== undefined ? { netDays: body.netDays } : {}),
      ...(body.signDate !== undefined ? { signDate: body.signDate ? new Date(body.signDate) : null } : {}),
      ...(body.startDate !== undefined ? { startDate: body.startDate ? new Date(body.startDate) : null } : {}),
      ...(body.endDate !== undefined ? { endDate: body.endDate ? new Date(body.endDate) : null } : {}),
      ...(body.autoRenew !== undefined ? { autoRenew: body.autoRenew } : {}),
      ...(body.ownerId !== undefined ? { ownerId: body.ownerId } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.allowedRoleIds !== undefined ? { allowedRoleIds: normalizeAllowedRoles(body.allowedRoleIds) ?? Prisma.DbNull } : {}),
    },
  });
  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "contracts" },
    action: AuditAction.update, entityType: "Contract", entityId: updated.id,
  });
  return ok(res, updated);
}));

// DELETE /contracts/:id — xóa mềm
router.delete("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPerm(req, "delete")) return forbidden(res, "Không có quyền xóa hợp đồng");
  const existing = await findContract(user, param(req.params["id"]));
  if (!existing) return notFound(res, "Hợp đồng");
  await prisma.contract.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "contracts" },
    action: AuditAction.delete, entityType: "Contract", entityId: existing.id,
  });
  return noContent(res);
}));

// ─── Vòng đời ─────────────────────────────────────────────────────────────────

async function transition(req: Request, res: Parameters<typeof ok>[0], from: string[], to: string, action: AuditAction, opts?: { reason?: boolean; perm?: string; noSelf?: boolean }) {
  const user = req.user!;
  if (!hasPerm(req, opts?.perm ?? "write")) return forbidden(res, "Không có quyền thao tác hợp đồng");
  const existing = await findContract(user, param(req.params["id"]));
  if (!existing) return notFound(res, "Hợp đồng");
  if (!from.includes(existing.status)) {
    return conflict(res, `Không thể chuyển từ trạng thái "${existing.status}"`);
  }
  // Tách trách nhiệm: người tạo không tự duyệt (trừ chủ DN/super admin).
  if (opts?.noSelf && existing.createdBy === user.id && !isCompanyAdmin(user) && !user.isSuperAdmin) {
    return forbidden(res, "Người tạo hợp đồng không thể tự phê duyệt — cần người khác duyệt");
  }
  const reason = opts?.reason ? qs(req.body?.reason) ?? qs(req.body?.decision) : undefined;
  const updated = await prisma.contract.update({
    where: { id: existing.id },
    data: {
      status: to as (typeof STATUSES)[number],
      ...(to === "active" ? { signDate: existing.signDate ?? new Date() } : {}),
      ...(reason ? { metadata: { ...(existing.metadata as object ?? {}), lastReason: reason } } : {}),
    },
  });
  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "contracts" },
    action, entityType: "Contract", entityId: existing.id, dataAfter: { status: to, reason },
  });
  return ok(res, updated);
}

// POST /contracts/:id/submit — gửi duyệt + tạo ApprovalRequest
router.post("/:id/submit", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPerm(req, "write")) return forbidden(res, "Không có quyền gửi duyệt");
  const existing = await findContract(user, param(req.params["id"]));
  if (!existing) return notFound(res, "Hợp đồng");
  if (!["draft", "review"].includes(existing.status)) return conflict(res, `Không thể gửi duyệt từ "${existing.status}"`);

  const updated = await prisma.contract.update({ where: { id: existing.id }, data: { status: "pending_approval" } });
  await prisma.approvalRequest.create({
    data: {
      companyId: user.companyId, moduleKey: "contracts", entityType: "Contract", entityId: existing.id,
      requestedBy: user.id, status: "pending",
      title: `Duyệt hợp đồng ${existing.number} — ${existing.title}`,
      amount: Number(existing.value),
    },
  });
  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "contracts" },
    action: AuditAction.update, entityType: "Contract", entityId: existing.id, dataAfter: { status: "pending_approval" },
  });
  return ok(res, updated);
}));

// TGĐ phê duyệt → đã duyệt (active). Lịch thanh toán của HĐ active tự vào kế hoạch dòng tiền.
router.post("/:id/approve", requireAuth, wrap((req, res) => transition(req, res, ["pending_approval"], "active", AuditAction.approve, { reason: true, perm: "approve", noSelf: true })));
router.post("/:id/reject", requireAuth, wrap((req, res) => transition(req, res, ["pending_approval"], "review", AuditAction.reject, { reason: true })));
router.post("/:id/terminate", requireAuth, wrap((req, res) => transition(req, res, ["active"], "terminated", AuditAction.update, { reason: true })));

// POST /contracts/:id/legal-review — AI Pháp chế rà soát + đối chiếu luật → lưu nhận xét, set review
router.post("/:id/legal-review", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPerm(req, "write")) return forbidden(res, "Không có quyền yêu cầu rà soát");
  const existing = await prisma.contract.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId, deletedAt: null, ...contractAccessWhere(user) },
  });
  if (!existing) return notFound(res, "Hợp đồng");

  // Nội dung dùng để rà soát: mô tả/nội dung bản thảo + thuộc tính tóm tắt.
  const body = existing.description ?? "";
  const head = `Hợp đồng ${existing.number} — ${existing.title}\nLoại: ${existing.type}; Chiều: ${existing.direction}; Đối tác: ${existing.partyName}; Giá trị: ${Number(existing.value).toLocaleString("vi-VN")} ${existing.currency}.`;
  const prompt =
    `Bạn là Trưởng phòng/Giám đốc Pháp chế. Rà soát hợp đồng sau và ${LEGAL_FRAMEWORK}\n\n` +
    `Trả về bằng tiếng Việt, markdown, gồm: (1) Điều khoản trái luật/nguy cơ vô hiệu (kèm căn cứ điều luật); ` +
    `(2) Điều khoản bắt buộc còn thiếu; (3) Điều khoản bất lợi cho bên ta + đề xuất sửa; (4) Kết luận mức rủi ro pháp lý: Cao/Trung bình/Thấp.\n\n` +
    `${head}\n\n--- NỘI DUNG ---\n${body || "(Hợp đồng chưa có nội dung chi tiết — đánh giá dựa trên thông tin tóm tắt trên)"}`;

  let review = "";
  try {
    const r = await runClaude({
      prompt, model: "sonnet", noTools: true, timeout: 120_000,
      systemPrompt: "Bạn là chuyên gia pháp chế hợp đồng Việt Nam. Trả lời chính xác, trích dẫn điều/khoản luật, súc tích.",
    });
    review = r.result.trim();
  } catch {
    return badRequest(res, "Không thực hiện được rà soát (AI). Vui lòng thử lại.");
  }

  const updated = await prisma.contract.update({
    where: { id: existing.id },
    data: {
      status: existing.status === "draft" ? "review" : existing.status,
      metadata: { ...((existing.metadata as object) ?? {}), legalReview: { text: review, at: new Date().toISOString(), by: user.id } },
    },
  });
  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "contracts" },
    action: AuditAction.update, entityType: "Contract", entityId: existing.id, dataAfter: { legalReview: true },
  });
  return ok(res, { review, status: updated.status });
}));

// GET /contracts/:id/export-pdf — kết xuất hợp đồng ra PDF (để in, ký, đóng dấu)
router.get("/:id/export-pdf", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const c = await prisma.contract.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId, deletedAt: null, ...contractAccessWhere(user) },
    include: { schedules: { orderBy: { installmentNo: "asc" } }, signatories: true },
  });
  if (!c) return notFound(res, "Hợp đồng");

  const vnd = (v: unknown) => `${Number(v).toLocaleString("vi-VN")} ${c.currency}`;
  const fmt = (d: Date | null) => (d ? new Date(d).toLocaleDateString("vi-VN") : "…………");
  const paras: string[] = [
    `Số: ${c.number}`,
    `Loại hợp đồng: ${c.type} — ${c.direction === "outbound" ? "Đầu ra" : c.direction === "inbound" ? "Đầu vào" : "Nội bộ"}`,
    "",
    `BÊN ${c.direction === "outbound" ? "B (Khách hàng)" : "A (Nhà cung cấp)"}: ${c.partyName}`,
    c.partyTaxCode ? `Mã số thuế: ${c.partyTaxCode}` : "",
    c.partyAddress ? `Địa chỉ: ${c.partyAddress}` : "",
    "",
    `Giá trị trước thuế: ${vnd(c.valueBeforeTax)}`,
    `Thuế (${c.taxRate}%): ${vnd(c.taxAmount)}`,
    `TỔNG GIÁ TRỊ: ${vnd(c.value)}`,
    `Phương thức thanh toán: ${c.paymentMethod ?? "…"}; Điều khoản: ${c.paymentTerm ?? "…"}`,
    `Hiệu lực: ${fmt(c.startDate)} — ${fmt(c.endDate)}`,
    "",
  ];
  if (c.schedules.length) {
    paras.push("LỊCH THANH TOÁN:");
    for (const s of c.schedules) paras.push(`  Đợt ${s.installmentNo}: ${s.description ?? ""} — ${vnd(s.amount)} — đến hạn ${fmt(s.dueDate)}`);
    paras.push("");
  }
  // Nội dung chi tiết (bản thảo lưu ở description).
  const detail = c.description ?? "";
  if (detail) { paras.push("NỘI DUNG:"); for (const line of detail.split("\n")) paras.push(line); paras.push(""); }
  paras.push("", "ĐẠI DIỆN BÊN A                              ĐẠI DIỆN BÊN B", "(Ký, ghi rõ họ tên, đóng dấu)              (Ký, ghi rõ họ tên, đóng dấu)");

  const docx = await generateDocx({ title: `HỢP ĐỒNG: ${c.title}`, paragraphs: paras });
  const pdf = await convertToPdf(docx, "docx");
  const filename = `${c.number}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader("Content-Length", String(pdf.length));
  res.setHeader("Cache-Control", "no-store");
  res.end(pdf);
}));

// POST /contracts/:id/sign — ghi nhận một bên ký; khi mọi bên đã ký → active
const signSchema = z.object({
  signatoryId: z.string().uuid().optional(),
  name: z.string().optional(),
  party: z.enum(["internal", "external"]).optional(),
  signMethod: z.enum(["usb_token", "soft_cert", "otp"]).optional(),
});
router.post("/:id/sign", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPerm(req, "write")) return forbidden(res, "Không có quyền ký hợp đồng");
  const existing = await findContract(user, param(req.params["id"]));
  if (!existing) return notFound(res, "Hợp đồng");
  if (!["pending_signature", "active"].includes(existing.status)) {
    return conflict(res, `Không thể ký từ trạng thái "${existing.status}"`);
  }
  const body = signSchema.parse(req.body ?? {});

  // Ghi nhận chữ ký: cập nhật signatory đã có, hoặc tạo mới.
  if (body.signatoryId) {
    await prisma.contractSignatory.updateMany({
      where: { id: body.signatoryId, contractId: existing.id },
      data: { status: "signed", signedAt: new Date(), signMethod: body.signMethod ?? null, signedIp: req.ip ?? null },
    });
  } else {
    await prisma.contractSignatory.create({
      data: {
        contractId: existing.id, party: body.party ?? "internal", name: body.name ?? user.name,
        status: "signed", signedAt: new Date(), signMethod: body.signMethod ?? null, signedIp: req.ip ?? null,
      },
    });
  }

  // Đủ bên ký (không còn signatory pending) → active.
  const pendingLeft = await prisma.contractSignatory.count({ where: { contractId: existing.id, status: "pending" } });
  const newStatus = pendingLeft === 0 ? "active" : existing.status;
  const updated = await prisma.contract.update({
    where: { id: existing.id },
    data: { status: newStatus, ...(newStatus === "active" ? { signDate: existing.signDate ?? new Date() } : {}) },
    include: { signatories: { orderBy: { createdAt: "asc" } } },
  });
  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "contracts" },
    action: AuditAction.approve, entityType: "Contract", entityId: existing.id, dataAfter: { status: newStatus, signed: true },
  });
  return ok(res, updated);
}));

// ─── Lịch thanh toán ───────────────────────────────────────────────────────────

// PUT /contracts/:id/schedules — thay toàn bộ lịch (validate tổng = giá trị HĐ)
const scheduleItemSchema = z.object({
  description: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  percent: z.number().min(0).max(100).optional(),
  amount: z.number().nonnegative(),
});
const schedulesSchema = z.object({ items: z.array(scheduleItemSchema) });
router.put("/:id/schedules", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPerm(req, "write")) return forbidden(res, "Không có quyền sửa lịch thanh toán");
  const existing = await findContract(user, param(req.params["id"]));
  if (!existing) return notFound(res, "Hợp đồng");
  const { items } = schedulesSchema.parse(req.body);

  const total = items.reduce((s, x) => s + x.amount, 0);
  const contractValue = Number(existing.value);
  // Cho phép sai số nhỏ do làm tròn; cảnh báo nếu lệch > 1đ.
  if (contractValue > 0 && Math.abs(total - contractValue) > 1) {
    return badRequest(res, `Tổng các đợt (${total.toLocaleString("vi-VN")}) phải bằng giá trị hợp đồng (${contractValue.toLocaleString("vi-VN")})`);
  }

  await prisma.$transaction([
    prisma.contractPaymentSchedule.deleteMany({ where: { contractId: existing.id } }),
    prisma.contractPaymentSchedule.createMany({
      data: items.map((x, i) => ({
        contractId: existing.id,
        installmentNo: i + 1,
        description: x.description ?? null,
        dueDate: x.dueDate ? new Date(x.dueDate) : null,
        percent: x.percent ?? null,
        amount: x.amount,
      })),
    }),
  ]);
  const schedules = await prisma.contractPaymentSchedule.findMany({ where: { contractId: existing.id }, orderBy: { installmentNo: "asc" } });
  return ok(res, schedules);
}));

// POST /contracts/schedules/:sid/pay — ghi nhận thu/chi một đợt
const paySchema = z.object({ amount: z.number().positive(), paidDate: z.string().datetime().optional() });
router.post("/schedules/:sid/pay", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPerm(req, "write")) return forbidden(res, "Không có quyền ghi nhận thanh toán");
  const sid = param(req.params["sid"]);
  const sched = await prisma.contractPaymentSchedule.findUnique({ where: { id: sid }, include: { contract: true } });
  if (!sched || sched.contract.companyId !== user.companyId || sched.contract.deletedAt) return notFound(res, "Đợt thanh toán");
  const body = paySchema.parse(req.body);

  const paidAmount = Number(sched.paidAmount) + body.amount;
  const status = paidAmount >= Number(sched.amount) ? "paid" : "partially_paid";
  const updated = await prisma.contractPaymentSchedule.update({
    where: { id: sid },
    data: { paidAmount, status, paidDate: body.paidDate ? new Date(body.paidDate) : new Date() },
  });
  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "contracts" },
    action: AuditAction.update, entityType: "ContractPaymentSchedule", entityId: sid, dataAfter: { paidAmount, status },
  });
  return ok(res, updated);
}));

export default router;
