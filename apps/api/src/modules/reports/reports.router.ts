// src/modules/reports/reports.router.ts
// GĐ4 — Hợp nhất xuyên module & báo cáo tài chính định kỳ.
// Gom số liệu thật từ mọi phân hệ (bán hàng, hợp đồng, chi phí, lương, ngân quỹ,
// công nợ, thuế) theo kỳ → bức tranh tài chính hợp nhất + ĐỐI CHIẾU với Sổ cái (GL).
// Read-only, không ghi bút toán; chênh lệch module↔GL = phần chưa hạch toán.
// Gate quyền "reports".
//
//  GET  /reports/consolidated?period=YYYY-MM|YYYY-Qn|YYYY   — hợp nhất 1 kỳ + đối chiếu GL
//  GET  /reports/trend?year=YYYY                             — xu hướng 12 tháng (DT/CP/LN/quỹ)

import { Router } from "express";
import { prisma } from "@vsme/db/client";
import { requireAuth } from "../../middleware/auth.js";
import { ok, badRequest, forbidden, wrap } from "../../lib/response.js";
import { hasPermission } from "../../lib/rbac.js";
import { qs } from "../../lib/query.js";

const router = Router();
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const r2 = (n: number): number => Math.round(n * 100) / 100;

// ─── Kỳ: YYYY | YYYY-MM | YYYY-Qn → [from, to) + danh sách tháng ───────────────────
function periodInfo(period: string): { from: Date; to: Date; months: string[]; label: string } | null {
  const mQ = /^(\d{4})-Q([1-4])$/.exec(period);
  if (mQ) {
    const y = Number(mQ[1]); const q = Number(mQ[2]); const s = (q - 1) * 3;
    return {
      from: new Date(Date.UTC(y, s, 1)),
      to: new Date(Date.UTC(y, s + 3, 1)),
      months: [0, 1, 2].map((i) => `${y}-${String(s + i + 1).padStart(2, "0")}`),
      label: `Quý ${q}/${y}`,
    };
  }
  const mM = /^(\d{4})-(\d{2})$/.exec(period);
  if (mM) {
    const y = Number(mM[1]); const mo = Number(mM[2]);
    return { from: new Date(Date.UTC(y, mo - 1, 1)), to: new Date(Date.UTC(y, mo, 1)), months: [period], label: `Tháng ${mo}/${y}` };
  }
  const mY = /^(\d{4})$/.exec(period);
  if (mY) {
    const y = Number(mY[1]);
    return {
      from: new Date(Date.UTC(y, 0, 1)),
      to: new Date(Date.UTC(y + 1, 0, 1)),
      months: Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`),
      label: `Năm ${y}`,
    };
  }
  return null;
}

// Doanh thu/chi phí trên Sổ cái (chỉ bút toán đã ghi sổ) trong khoảng [from,to).
// DT = phát sinh Có − Nợ ở TK loại 5/7; CP = phát sinh Nợ − Có ở TK loại 6/8.
async function glRevExp(companyId: string, from: Date, to: Date): Promise<{ revenue: number; expense: number }> {
  const entries = await prisma.journalEntry.findMany({
    where: { companyId, status: "posted", date: { gte: from, lt: to } },
    select: { lines: { select: { debit: true, credit: true, account: { select: { code: true } } } } },
  });
  let revenue = 0, expense = 0;
  for (const e of entries) {
    for (const l of e.lines) {
      const c = (l.account?.code ?? "").charAt(0);
      const debit = num(l.debit), credit = num(l.credit);
      if (c === "5" || c === "7") revenue += credit - debit;
      else if (c === "6" || c === "8") expense += debit - credit;
    }
  }
  return { revenue: r2(revenue), expense: r2(expense) };
}

// ─── GET /reports/consolidated?period= ──────────────────────────────────────────────
router.get("/consolidated", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "reports", "read")) return forbidden(res);
  const companyId = user.companyId;
  const period = qs(req.query.period) ?? "";
  const info = periodInfo(period);
  if (!info) return badRequest(res, "Kỳ không hợp lệ (YYYY | YYYY-MM | YYYY-Qn)");
  const { from, to, months } = info;

  const [sales, contracts, expenses, payroll, cashTx, recv, pay, taxReturns, gl] = await Promise.all([
    // Doanh thu bán hàng (đơn không hủy)
    prisma.salesOrder.aggregate({
      _sum: { total: true },
      where: { companyId, status: { not: "cancelled" }, orderDate: { gte: from, lt: to } },
    }),
    // Doanh thu theo hợp đồng đầu ra đã ký (giá trị chưa thuế)
    prisma.contract.aggregate({
      _sum: { valueBeforeTax: true },
      where: { companyId, direction: "outbound", status: { in: ["active", "completed"] }, signDate: { gte: from, lt: to } },
    }),
    // Chi phí ghi nhận (chưa thuế)
    prisma.expense.aggregate({ _sum: { amount: true }, where: { companyId, date: { gte: from, lt: to } } }),
    // Chi phí lương (companyCost = gross + BH DN) — theo tháng trong kỳ
    prisma.payrollItem.aggregate({
      _sum: { companyCost: true, netSalary: true, pit: true, insuranceEmployee: true, insuranceEmployer: true },
      where: { period: { companyId, month: { in: months } } },
    }),
    // Dòng tiền thực
    prisma.cashTransaction.groupBy({
      by: ["kind"], _sum: { amount: true },
      where: { companyId, date: { gte: from, lt: to } },
    }),
    // Phải thu còn lại (số dư cuối kỳ)
    prisma.debt.findMany({
      where: { companyId, kind: "receivable", status: { not: "paid" }, OR: [{ issueDate: null }, { issueDate: { lt: to } }] },
      select: { amount: true, paidAmount: true },
    }),
    // Phải trả còn lại
    prisma.debt.findMany({
      where: { companyId, kind: "payable", status: { not: "paid" }, OR: [{ issueDate: null }, { issueDate: { lt: to } }] },
      select: { amount: true, paidAmount: true },
    }),
    // Thuế phải nộp phát sinh trong kỳ
    prisma.taxReturn.findMany({ where: { companyId, period: { in: months } }, select: { type: true, payable: true } }),
    glRevExp(companyId, from, to),
  ]);

  const revSales = num(sales._sum.total);
  const revContracts = num(contracts._sum.valueBeforeTax);
  const revTotal = r2(revSales + revContracts);

  const expRecorded = num(expenses._sum.amount);
  const expPayroll = num(payroll._sum.companyCost);
  const expTotal = r2(expRecorded + expPayroll);

  const cashIn = num(cashTx.find((c) => c.kind === "receipt")?._sum.amount);
  const cashOut = num(cashTx.find((c) => c.kind === "payment")?._sum.amount);

  const receivable = r2(recv.reduce((s, d) => s + (num(d.amount) - num(d.paidAmount)), 0));
  const payable = r2(pay.reduce((s, d) => s + (num(d.amount) - num(d.paidAmount)), 0));

  const taxPayable = r2(taxReturns.reduce((s, t) => s + num(t.payable), 0));
  const taxByType = taxReturns.reduce<Record<string, number>>((m, t) => {
    m[t.type] = r2((m[t.type] ?? 0) + num(t.payable)); return m;
  }, {});

  return ok(res, {
    period, label: info.label,
    revenue: { sales: r2(revSales), contracts: r2(revContracts), total: revTotal },
    expense: { recorded: r2(expRecorded), payroll: r2(expPayroll), total: expTotal },
    profit: r2(revTotal - expTotal),
    cash: { in: r2(cashIn), out: r2(cashOut), net: r2(cashIn - cashOut) },
    receivable, payable,
    payroll: {
      net: r2(num(payroll._sum.netSalary)),
      pit: r2(num(payroll._sum.pit)),
      insuranceEmployee: r2(num(payroll._sum.insuranceEmployee)),
      insuranceEmployer: r2(num(payroll._sum.insuranceEmployer)),
    },
    tax: { payable: taxPayable, byType: taxByType },
    gl,
    // Đối chiếu: chênh lệch số liệu phân hệ so với Sổ cái (≠0 ⇒ phần chưa hạch toán)
    reconciliation: {
      revenueDiff: r2(revTotal - gl.revenue),
      expenseDiff: r2(expTotal - gl.expense),
      note: "Chênh lệch ≠ 0: số liệu phân hệ chưa được hạch toán vào Sổ cái (auto-journal là bước tiếp theo).",
    },
  });
}));

// ─── GET /reports/trend?year= ──────────────────────────────────────────────────────
router.get("/trend", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "reports", "read")) return forbidden(res);
  const companyId = user.companyId;
  const year = Number(qs(req.query.year));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return badRequest(res, "Năm không hợp lệ");
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

  const empty = () => Array.from({ length: 12 }, () => 0);
  const revSales = empty(), revContracts = empty(), expRecorded = empty(), expPayroll = empty(), cashIn = empty(), cashOut = empty();

  const [orders, ctrs, exps, payItems, txs] = await Promise.all([
    prisma.salesOrder.findMany({ where: { companyId, status: { not: "cancelled" }, orderDate: { gte: from, lt: to } }, select: { orderDate: true, total: true } }),
    prisma.contract.findMany({ where: { companyId, direction: "outbound", status: { in: ["active", "completed"] }, signDate: { gte: from, lt: to } }, select: { signDate: true, valueBeforeTax: true } }),
    prisma.expense.findMany({ where: { companyId, date: { gte: from, lt: to } }, select: { date: true, amount: true } }),
    prisma.payrollItem.findMany({ where: { period: { companyId, month: { in: months } } }, select: { companyCost: true, period: { select: { month: true } } } }),
    prisma.cashTransaction.findMany({ where: { companyId, date: { gte: from, lt: to } }, select: { date: true, kind: true, amount: true } }),
  ]);

  const mi = (d: Date | null): number => (d ? new Date(d).getUTCMonth() : -1);
  for (const o of orders) { const i = mi(o.orderDate); if (i >= 0) revSales[i] += num(o.total); }
  for (const c of ctrs) { const i = mi(c.signDate); if (i >= 0) revContracts[i] += num(c.valueBeforeTax); }
  for (const e of exps) { const i = mi(e.date); if (i >= 0) expRecorded[i] += num(e.amount); }
  for (const p of payItems) { const i = months.indexOf(p.period.month); if (i >= 0) expPayroll[i] += num(p.companyCost); }
  for (const t of txs) { const i = mi(t.date); if (i >= 0) { if (t.kind === "receipt") cashIn[i] += num(t.amount); else cashOut[i] += num(t.amount); } }

  const series = months.map((m, i) => {
    const revenue = r2(revSales[i] + revContracts[i]);
    const expense = r2(expRecorded[i] + expPayroll[i]);
    return { month: m, revenue, expense, profit: r2(revenue - expense), cashIn: r2(cashIn[i]), cashOut: r2(cashOut[i]), cashNet: r2(cashIn[i] - cashOut[i]) };
  });
  const totals = series.reduce(
    (s, r) => ({ revenue: r2(s.revenue + r.revenue), expense: r2(s.expense + r.expense), profit: r2(s.profit + r.profit), cashIn: r2(s.cashIn + r.cashIn), cashOut: r2(s.cashOut + r.cashOut), cashNet: r2(s.cashNet + r.cashNet) }),
    { revenue: 0, expense: 0, profit: 0, cashIn: 0, cashOut: 0, cashNet: 0 },
  );

  return ok(res, { year, series, totals });
}));

export default router;
