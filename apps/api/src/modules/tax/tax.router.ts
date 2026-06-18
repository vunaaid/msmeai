// src/modules/tax/tax.router.ts
// Module Thuế — kê khai & TỰ TÍNH GTGT / TNDN / TNCN + lịch nộp + cảnh báo hạn.
// Tính theo cấu hình công ty (loại hình, ngành nghề, PP & thuế suất, ưu đãi) và kế thừa
// dữ liệu: hợp đồng (thuế suất theo HĐ, đầu vào/đầu ra), chi phí (GTGT vào), lương (TNCN).
// Gate quyền "tax".
//
//  GET    /tax/settings              — cấu hình thuế
//  PUT    /tax/settings              — cập nhật cấu hình
//  GET    /tax/returns?type=         — danh sách tờ khai
//  POST   /tax/returns/compute       — tự tính 1 kỳ {type, period} → lưu tờ khai (draft)
//  PATCH  /tax/returns/:id           — cập nhật trạng thái (đã nộp / đã nộp tiền) + ghi chú
//  DELETE /tax/returns/:id           — xóa tờ khai
//  GET    /tax/stats                 — tổng phải nộp + cảnh báo hạn sắp tới

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import type { TaxType, TaxReturnStatus, Prisma } from "@vsme/db";
import { requireAuth } from "../../middleware/auth.js";
import { ok, created, notFound, badRequest, forbidden, noContent, wrap } from "../../lib/response.js";
import { hasPermission } from "../../lib/rbac.js";
import { qs, param } from "../../lib/query.js";

const router = Router();
const num = (v: unknown): number => (v == null ? 0 : Number(v));

// ─── Kỳ thuế: YYYY-MM hoặc YYYY-Qn → khoảng [from, to) + danh sách tháng ──────────
function periodInfo(period: string): { from: Date; to: Date; months: string[]; quarterly: boolean } | null {
  const mQ = /^(\d{4})-Q([1-4])$/.exec(period);
  if (mQ) {
    const y = Number(mQ[1]); const q = Number(mQ[2]);
    const startM = (q - 1) * 3;
    const from = new Date(Date.UTC(y, startM, 1));
    const to = new Date(Date.UTC(y, startM + 3, 1));
    const months = [0, 1, 2].map((i) => `${y}-${String(startM + i + 1).padStart(2, "0")}`);
    return { from, to, months, quarterly: true };
  }
  const mM = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (mM) {
    const y = Number(mM[1]); const mo = Number(mM[2]);
    const from = new Date(Date.UTC(y, mo - 1, 1));
    const to = new Date(Date.UTC(y, mo, 1));
    return { from, to, months: [period], quarterly: false };
  }
  return null;
}

// Hạn nộp: GTGT/TNCN tháng → 20 tháng sau; quý & TNDN → ngày cuối tháng kế tiếp.
function dueDateFor(type: TaxType, info: { to: Date; quarterly: boolean }): Date {
  const end = info.to; // = ngày đầu kỳ kế tiếp (sau kỳ)
  if (!info.quarterly && (type === "vat" || type === "pit")) {
    return new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 20));
  }
  // ngày cuối của tháng kế tiếp (= ngày 0 của tháng sau nữa)
  return new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0));
}

// ─── Cấu hình thuế ────────────────────────────────────────────────────────────────

const DEFAULT_SETTING = { businessType: null, industry: null, vatMethod: "deduction", vatDirectRate: 0, citRate: 20, citIncentiveRate: null, incentiveNote: null, incentiveStartDate: null, incentiveYearsExempt: 0, incentiveYearsReduced: 0, lossCarryforward: 0 };

// Thuế suất TNDN tiêu chuẩn VN (không ràng buộc cứng vì có nhiều mức theo ngành/khu vực):
// 10% — ưu đãi dài hạn (CNTT, giáo dục, y tế, nhà ở XH, KKT...)
// 17% — SME DT < 3 tỷ (đề xuất, chưa chính thức 2026)
// 20% — chuẩn (đại đa số DN)
// 25–50% — khai thác khoáng sản, dầu khí

// Xác định thuế suất thực tế áp dụng theo kỳ ưu đãi.
function resolveEffectiveCitRate(setting: { citRate: number; citIncentiveRate: number | null; incentiveStartDate: Date | null; incentiveYearsExempt: number; incentiveYearsReduced: number } | null, periodStart: Date): { rate: number; note: string } {
  const base = setting?.citRate ?? 20;
  const incentive = setting?.citIncentiveRate ?? null;
  const start = setting?.incentiveStartDate;
  const yExempt = setting?.incentiveYearsExempt ?? 0;
  const yReduced = setting?.incentiveYearsReduced ?? 0;

  if (!start || !incentive) return { rate: incentive ?? base, note: incentive != null ? "Ưu đãi (không có kỳ hạn)" : "Chuẩn" };

  const monthsSinceStart = (periodStart.getUTCFullYear() - start.getUTCFullYear()) * 12 + (periodStart.getUTCMonth() - start.getUTCMonth());
  const yearsSinceStart = monthsSinceStart / 12;

  if (yearsSinceStart < yExempt) return { rate: 0, note: `Miễn thuế năm ${Math.floor(yearsSinceStart) + 1}/${yExempt}` };
  if (yearsSinceStart < yExempt + yReduced) return { rate: Math.round(incentive * 0.5 * 100) / 100, note: `Giảm 50% năm ${Math.floor(yearsSinceStart - yExempt) + 1}/${yReduced} → ${incentive}%×50%` };
  return { rate: incentive, note: "Ưu đãi dài hạn" };
}

router.get("/settings", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "tax", "read")) return forbidden(res);
  const s = await prisma.taxSetting.findUnique({ where: { companyId: user.companyId } });
  return ok(res, s ?? DEFAULT_SETTING);
}));

const settingSchema = z.object({
  businessType:          z.string().max(100).nullable().optional(),
  industry:              z.string().max(200).nullable().optional(),
  vatMethod:             z.enum(["deduction", "direct"]).optional(),
  vatDirectRate:         z.number().min(0).max(100).optional(),
  citRate:               z.number().min(0).max(100).optional(),
  citIncentiveRate:      z.number().min(0).max(100).nullable().optional(),
  incentiveNote:         z.string().max(1000).nullable().optional(),
  incentiveStartDate:    z.string().nullable().optional(), // ISO date
  incentiveYearsExempt:  z.number().int().min(0).max(30).optional(),
  incentiveYearsReduced: z.number().int().min(0).max(30).optional(),
  lossCarryforward:      z.number().min(0).optional(), // lỗ kết chuyển VNĐ
});

router.put("/settings", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "tax", "configure") && !hasPermission(user, "tax", "write")) return forbidden(res);
  const d = settingSchema.parse(req.body);
  const data = {
    ...d,
    incentiveStartDate: d.incentiveStartDate ? new Date(d.incentiveStartDate) : undefined,
    lossCarryforward: d.lossCarryforward !== undefined ? d.lossCarryforward : undefined,
  };
  const s = await prisma.taxSetting.upsert({
    where: { companyId: user.companyId },
    create: { companyId: user.companyId, ...data },
    update: data,
  });
  return ok(res, s);
}));

// ─── Tự tính 1 kỳ ─────────────────────────────────────────────────────────────────

const computeSchema = z.object({
  type:   z.enum(["vat", "cit", "pit"]),
  period: z.string().regex(/^\d{4}-(Q[1-4]|(0[1-9]|1[0-2]))$/),
});

async function computeReturn(companyId: string, type: TaxType, info: { from: Date; to: Date; months: string[] }) {
  const range = { gte: info.from, lt: info.to };

  if (type === "pit") {
    const items = await prisma.payrollItem.findMany({
      where: { period: { companyId, month: { in: info.months } } }, select: { pit: true },
    });
    const payable = items.reduce((s, i) => s + num(i.pit), 0);
    return { revenue: 0, deductible: 0, outputTax: 0, inputTax: 0, taxableIncome: 0, rate: 0, payable, detail: { source: "payroll", count: items.length } };
  }

  // Doanh thu = HĐ đầu ra (chưa thuế, ký trong kỳ) + đơn bán hàng trong kỳ (≠ hủy).
  const [outContracts, inContracts, orders, expenses] = await Promise.all([
    prisma.contract.findMany({ where: { companyId, direction: "outbound", signDate: range }, select: { valueBeforeTax: true, taxAmount: true } }),
    prisma.contract.findMany({ where: { companyId, direction: "inbound", signDate: range }, select: { valueBeforeTax: true, taxAmount: true } }),
    prisma.salesOrder.findMany({ where: { companyId, status: { not: "cancelled" }, orderDate: range }, select: { total: true } }),
    prisma.expense.findMany({ where: { companyId, date: range }, select: { amount: true, vatAmount: true, hasInvoice: true } }),
  ]);

  const contractRevenue = outContracts.reduce((s, c) => s + num(c.valueBeforeTax), 0);
  const orderRevenue = orders.reduce((s, o) => s + num(o.total), 0);
  const revenue = contractRevenue + orderRevenue;

  const setting = await prisma.taxSetting.findUnique({ where: { companyId } });
  const vatMethod = setting?.vatMethod ?? "deduction";

  if (type === "vat") {
    if (vatMethod === "direct") {
      const rate = setting?.vatDirectRate ?? 0;
      const payable = Math.round(revenue * rate / 100);
      return { revenue, deductible: 0, outputTax: payable, inputTax: 0, taxableIncome: 0, rate, payable, detail: { method: "direct", rate } };
    }
    // Khấu trừ: GTGT đầu ra (HĐ đầu ra) − GTGT đầu vào (HĐ đầu vào + chi phí có hóa đơn).
    const outputTax = outContracts.reduce((s, c) => s + num(c.taxAmount), 0);
    const inputTax =
      inContracts.reduce((s, c) => s + num(c.taxAmount), 0) +
      expenses.filter((e) => e.hasInvoice).reduce((s, e) => s + num(e.vatAmount), 0);
    const payable = Math.max(0, Math.round(outputTax - inputTax));
    return { revenue, deductible: 0, outputTax: Math.round(outputTax), inputTax: Math.round(inputTax), taxableIncome: 0, rate: 0, payable, detail: { method: "deduction" } };
  }

  // ── CIT: Tính thu nhập chịu thuế TNDN đúng luật VN ──────────────────────────────
  const [payroll, assets] = await Promise.all([
    prisma.payrollItem.findMany({ where: { period: { companyId, month: { in: info.months } } }, select: { companyCost: true } }),
    // Khấu hao TSCĐ: (nguyên giá − thanh lý) / thời gian (tháng) × số tháng trong kỳ
    prisma.asset.findMany({
      where: { companyId, status: "active", acquisitionDate: { lt: info.to }, usefulLifeMonths: { gt: 0 } },
      select: { cost: true, salvageValue: true, usefulLifeMonths: true, acquisitionDate: true },
    }),
  ]);

  const payrollCost = payroll.reduce((s, p) => s + num(p.companyCost), 0);

  // Chi phí có hóa đơn hợp lệ được trừ toàn bộ (điều 9 TT78/2014 + sửa đổi).
  // Chi phí KHÔNG có hóa đơn: chỉ được trừ ≤ 15% tổng chi phí có HĐ (điều 9.2.g).
  const expWithInvoice = expenses.filter((e) => e.hasInvoice).reduce((s, e) => s + num(e.amount), 0);
  const expNoInvoice   = expenses.filter((e) => !e.hasInvoice).reduce((s, e) => s + num(e.amount), 0);
  const expNoInvoiceCap = Math.min(expNoInvoice, expWithInvoice * 0.15); // phần được trừ tối đa
  const expenseDeductibleCIT = expWithInvoice + expNoInvoiceCap;

  // Khấu hao TSCĐ đường thẳng cho các tháng trong kỳ.
  let depreciationCIT = 0;
  for (const a of assets) {
    const months = num(a.usefulLifeMonths);
    if (!months) continue;
    const monthlyDep = (num(a.cost) - num(a.salvageValue)) / months;
    // Số tháng của tài sản có trong kỳ này (có thể < số tháng kỳ nếu mua giữa kỳ).
    const acqDate = a.acquisitionDate!;
    const periodMonths = info.months.filter((m) => {
      const mDate = new Date(m + "-01");
      return mDate >= new Date(Date.UTC(acqDate.getUTCFullYear(), acqDate.getUTCMonth(), 1));
    }).length;
    depreciationCIT += monthlyDep * periodMonths;
  }
  depreciationCIT = Math.round(depreciationCIT);

  const deductible = expenseDeductibleCIT + payrollCost + depreciationCIT;

  // Lỗ kết chuyển từ kỳ trước (tối đa 5 năm liên tiếp theo luật).
  const lossCarryforward = Math.round(num(setting?.lossCarryforward ?? 0));
  const taxableIncomeBeforeLoss = Math.max(0, revenue - deductible);
  const lossUsed = Math.min(lossCarryforward, taxableIncomeBeforeLoss);
  const taxableIncome = taxableIncomeBeforeLoss - lossUsed;

  // Thuế suất: xét kỳ ưu đãi (miễn/giảm) nếu cấu hình.
  const { rate, note: rateNote } = resolveEffectiveCitRate(
    setting ? { citRate: setting.citRate, citIncentiveRate: setting.citIncentiveRate, incentiveStartDate: setting.incentiveStartDate, incentiveYearsExempt: setting.incentiveYearsExempt, incentiveYearsReduced: setting.incentiveYearsReduced } : null,
    info.from,
  );
  const payable = Math.round(taxableIncome * rate / 100);

  return {
    revenue, deductible, outputTax: 0, inputTax: 0, taxableIncome, rate, payable,
    detail: {
      contractRevenue, orderRevenue,
      expenses: { withInvoice: expWithInvoice, noInvoice: expNoInvoice, noInvoiceDeductible: expNoInvoiceCap },
      payrollCost, depreciationCIT,
      lossCarryforward, lossUsed,
      rateNote,
    },
  };
}

router.post("/returns/compute", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "tax", "write")) return forbidden(res);
  const { type, period } = computeSchema.parse(req.body);
  const info = periodInfo(period);
  if (!info) return badRequest(res, "Kỳ không hợp lệ (YYYY-MM hoặc YYYY-Qn)");

  // Đã nộp tờ khai/tiền thì không tính lại (giữ số liệu đã chốt).
  const existing = await prisma.taxReturn.findUnique({
    where: { companyId_type_period: { companyId: user.companyId, type: type as TaxType, period } },
    select: { status: true },
  });
  if (existing && existing.status !== "draft") {
    return badRequest(res, "Tờ khai kỳ này đã nộp — không thể tính lại. Hãy chuyển về nháp nếu cần.");
  }

  const c = await computeReturn(user.companyId, type as TaxType, info);
  const dueDate = dueDateFor(type as TaxType, info);
  const data = {
    revenue: c.revenue, deductible: c.deductible, outputTax: c.outputTax, inputTax: c.inputTax,
    taxableIncome: c.taxableIncome, rate: c.rate, payable: c.payable, dueDate,
    detail: c.detail as Prisma.InputJsonValue,
  };
  const row = await prisma.taxReturn.upsert({
    where: { companyId_type_period: { companyId: user.companyId, type: type as TaxType, period } },
    create: { companyId: user.companyId, type: type as TaxType, period, ...data, createdBy: user.id },
    // Chỉ tính lại khi còn nháp — đã nộp thì giữ nguyên.
    update: { ...data },
  });
  return created(res, row);
}));

router.get("/returns", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "tax", "read")) return forbidden(res);
  const type = qs(req.query["type"]);
  const rows = await prisma.taxReturn.findMany({
    where: { companyId: user.companyId, ...(type && ["vat", "cit", "pit"].includes(type) ? { type: type as TaxType } : {}) },
    orderBy: [{ period: "desc" }, { type: "asc" }],
  });
  return ok(res, rows);
}));

const updateSchema = z.object({
  status:    z.enum(["draft", "filed", "paid"]).optional(),
  note:      z.string().max(1000).nullable().optional(),
});

router.patch("/returns/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "tax", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.taxReturn.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Tờ khai");
  const d = updateSchema.parse(req.body);
  const row = await prisma.taxReturn.update({
    where: { id },
    data: {
      ...(d.status !== undefined ? { status: d.status as TaxReturnStatus, filedDate: d.status === "filed" && !found.filedDate ? new Date() : found.filedDate } : {}),
      ...(d.note !== undefined ? { note: d.note } : {}),
    },
  });
  return ok(res, row);
}));

router.delete("/returns/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "tax", "delete")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.taxReturn.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Tờ khai");
  await prisma.taxReturn.delete({ where: { id } });
  return noContent(res);
}));

router.get("/stats", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "tax", "read")) return forbidden(res);
  const rows = await prisma.taxReturn.findMany({ where: { companyId: user.companyId }, orderBy: { dueDate: "asc" } });
  const now = Date.now();
  let unpaidTotal = 0, overdueTotal = 0;
  const upcoming: typeof rows = [];
  for (const r of rows) {
    if (r.status === "paid") continue;
    unpaidTotal += num(r.payable);
    if (r.dueDate && new Date(r.dueDate).getTime() < now) overdueTotal += num(r.payable);
    else upcoming.push(r);
  }
  return ok(res, { unpaidTotal, overdueTotal, upcoming: upcoming.slice(0, 8) });
}));

export default router;
