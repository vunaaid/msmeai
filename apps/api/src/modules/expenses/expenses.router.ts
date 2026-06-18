// src/modules/expenses/expenses.router.ts
// Module Chi phí — theo dõi chi phí, hóa đơn (có/chưa) & kê khai thuế (đã/chưa).
// Phục vụ todo02 mục 1.2: cảnh báo chi phí chưa có hóa đơn / chưa kê khai thuế.
// Gate quyền "gl" (thuộc kế toán).
//
//  GET    /expenses?category=&hasInvoice=&taxDeclared=&q=  — danh sách
//  GET    /expenses/stats                                  — tổng + cảnh báo (chưa HĐ / chưa kê khai)
//  POST   /expenses                                        — tạo (tự tính VAT + tổng)
//  PATCH  /expenses/:id                                    — sửa
//  POST   /expenses/:id/declare                            — đánh dấu đã kê khai (kỳ)
//  DELETE /expenses/:id                                    — xóa

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import { requireAuth } from "../../middleware/auth.js";
import { ok, created, notFound, badRequest, forbidden, noContent, wrap } from "../../lib/response.js";
import { hasPermission } from "../../lib/rbac.js";
import { qs, param } from "../../lib/query.js";

const router = Router();
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);
const round = (n: number) => Math.round(n);

const expenseSchema = z.object({
  date:        z.string().nullable().optional(),
  category:    z.string().max(100).nullable().optional(),
  description: z.string().min(1).max(500),
  amount:      z.number().nonnegative(),
  vatRate:     z.number().refine((v) => [0, 5, 8, 10].includes(v), {
    message: "Thuế suất GTGT không hợp lệ — chỉ chấp nhận 0%, 5%, 8%, 10%",
  }).optional(),
  hasInvoice:  z.boolean().optional(),
  invoiceNo:   z.string().max(50).nullable().optional(),
  invoiceDate: z.string().nullable().optional(),
  taxDeclared: z.boolean().optional(),
  taxPeriod:   z.string().max(20).nullable().optional(),
  partnerId:   z.string().uuid().nullable().optional(),
  note:        z.string().max(2000).nullable().optional(),
});

router.get("/stats", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "gl", "read")) return forbidden(res);
  const where = { companyId: user.companyId };
  const [all, noInv, notDecl] = await Promise.all([
    prisma.expense.aggregate({ where, _sum: { total: true }, _count: { _all: true } }),
    prisma.expense.aggregate({ where: { ...where, hasInvoice: false }, _sum: { total: true }, _count: { _all: true } }),
    prisma.expense.aggregate({ where: { ...where, taxDeclared: false }, _sum: { total: true }, _count: { _all: true } }),
  ]);
  return ok(res, {
    total: { count: all._count._all, amount: num(all._sum.total) },
    noInvoice: { count: noInv._count._all, amount: num(noInv._sum.total) },
    notDeclared: { count: notDecl._count._all, amount: num(notDecl._sum.total) }, // cảnh báo chính
  });
}));

router.get("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "gl", "read")) return forbidden(res);
  const category = qs(req.query["category"]);
  const hasInvoice = qs(req.query["hasInvoice"]);
  const taxDeclared = qs(req.query["taxDeclared"]);
  const q = qs(req.query["q"]);
  const rows = await prisma.expense.findMany({
    where: {
      companyId: user.companyId,
      ...(category ? { category } : {}),
      ...(hasInvoice === "true" ? { hasInvoice: true } : hasInvoice === "false" ? { hasInvoice: false } : {}),
      ...(taxDeclared === "true" ? { taxDeclared: true } : taxDeclared === "false" ? { taxDeclared: false } : {}),
      ...(q ? { description: { contains: q, mode: "insensitive" as const } } : {}),
    },
    include: { partner: { select: { id: true, name: true } } },
    orderBy: { date: "desc" },
    take: 300,
  });
  return ok(res, rows);
}));

function computeVat(amount: number, vatRate: number) {
  const vatAmount = round(amount * vatRate / 100);
  return { vatAmount, total: round(amount) + vatAmount };
}

router.post("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "gl", "write")) return forbidden(res);
  const d = expenseSchema.parse(req.body);
  if (d.partnerId) {
    const p = await prisma.partner.findFirst({ where: { id: d.partnerId, companyId: user.companyId }, select: { id: true } });
    if (!p) return badRequest(res, "Đối tác không hợp lệ");
  }
  const { vatAmount, total } = computeVat(d.amount, d.vatRate ?? 0);
  const row = await prisma.expense.create({
    data: {
      companyId: user.companyId, date: toDate(d.date) ?? new Date(), category: d.category ?? null,
      description: d.description, amount: d.amount, vatRate: d.vatRate ?? 0, vatAmount, total,
      hasInvoice: d.hasInvoice ?? false, invoiceNo: d.invoiceNo ?? null, invoiceDate: toDate(d.invoiceDate),
      taxDeclared: d.taxDeclared ?? false, taxPeriod: d.taxPeriod ?? null,
      partnerId: d.partnerId ?? null, note: d.note ?? null, createdBy: user.id,
    },
  });
  return created(res, row);
}));

router.patch("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "gl", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.expense.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Chi phí");
  const d = expenseSchema.partial().parse(req.body);
  if (d.partnerId) {
    const p = await prisma.partner.findFirst({ where: { id: d.partnerId, companyId: user.companyId }, select: { id: true } });
    if (!p) return badRequest(res, "Đối tác không hợp lệ");
  }
  const amount = d.amount ?? num(found.amount);
  const vatRate = d.vatRate ?? found.vatRate;
  const recompute = d.amount !== undefined || d.vatRate !== undefined;
  const { vatAmount, total } = computeVat(amount, vatRate);
  const row = await prisma.expense.update({
    where: { id },
    data: {
      ...(d.date !== undefined ? { date: toDate(d.date) ?? new Date() } : {}),
      ...(d.category !== undefined ? { category: d.category } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.amount !== undefined ? { amount: d.amount } : {}),
      ...(d.vatRate !== undefined ? { vatRate: d.vatRate } : {}),
      ...(recompute ? { vatAmount, total } : {}),
      ...(d.hasInvoice !== undefined ? { hasInvoice: d.hasInvoice } : {}),
      ...(d.invoiceNo !== undefined ? { invoiceNo: d.invoiceNo } : {}),
      ...(d.invoiceDate !== undefined ? { invoiceDate: toDate(d.invoiceDate) } : {}),
      ...(d.taxDeclared !== undefined ? { taxDeclared: d.taxDeclared } : {}),
      ...(d.taxPeriod !== undefined ? { taxPeriod: d.taxPeriod } : {}),
      ...(d.partnerId !== undefined ? { partnerId: d.partnerId } : {}),
      ...(d.note !== undefined ? { note: d.note } : {}),
    },
  });
  return ok(res, row);
}));

router.post("/:id/declare", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "gl", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.expense.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Chi phí");
  const period = qs(req.body?.["taxPeriod"]) ?? found.taxPeriod;
  const row = await prisma.expense.update({ where: { id }, data: { taxDeclared: true, taxPeriod: period } });
  return ok(res, row);
}));

router.delete("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "gl", "delete")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.expense.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Chi phí");
  await prisma.expense.delete({ where: { id } });
  return noContent(res);
}));

export default router;
