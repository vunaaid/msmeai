// src/modules/debts/debts.router.ts
// Module Công nợ — Phải thu (AR, receivable) & Phải trả (AP, payable).
// Gate quyền theo loại: receivable→"ar", payable→"ap". Nối Đối tác + Hợp đồng.
//
//  GET    /debts?kind=&partnerId=&status=&q=   — danh sách
//  GET    /debts/stats?kind=                   — tổng quan + aging (quá hạn)
//  POST   /debts                                — tạo công nợ
//  PATCH  /debts/:id                            — sửa
//  DELETE /debts/:id                            — xóa
//  POST   /debts/:id/pay  {amount}              — ghi nhận thu/trả 1 phần → cập nhật trạng thái

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import type { DebtKind, DebtStatus } from "@vsme/db";
import { requireAuth } from "../../middleware/auth.js";
import { ok, created, notFound, badRequest, forbidden, noContent, wrap } from "../../lib/response.js";
import { hasPermission } from "../../lib/rbac.js";
import { qs, qi, param } from "../../lib/query.js";
import type { SessionUser } from "../../lib/rbac.js";

const router = Router();

const moduleOf = (kind: string) => (kind === "payable" ? "ap" : "ar");
const can = (user: SessionUser, kind: string, action: string) => hasPermission(user, moduleOf(kind), action);
const num = (v: unknown): number => (v == null ? 0 : Number(v));

const debtSchema = z.object({
  kind:        z.enum(["receivable", "payable"]),
  partnerId:   z.string().uuid().nullable().optional(),
  contractId:  z.string().uuid().nullable().optional(),
  description: z.string().min(1).max(500),
  amount:      z.number().nonnegative(),
  issueDate:   z.string().nullable().optional(),
  dueDate:     z.string().nullable().optional(),
  note:        z.string().max(2000).nullable().optional(),
});

const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);
const statusOf = (amount: number, paid: number): DebtStatus => (paid <= 0 ? "open" : paid >= amount ? "paid" : "partial");

router.get("/stats", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const kind = qs(req.query["kind"]) ?? "receivable";
  if (!can(user, kind, "read")) return forbidden(res);
  const rows = await prisma.debt.findMany({
    where: { companyId: user.companyId, kind: kind as DebtKind },
    select: { amount: true, paidAmount: true, dueDate: true, status: true },
  });
  const now = Date.now();
  let outstanding = 0, overdue = 0;
  for (const r of rows) {
    const remain = num(r.amount) - num(r.paidAmount);
    if (remain <= 0) continue;
    outstanding += remain;
    if (r.dueDate && new Date(r.dueDate).getTime() < now) overdue += remain;
  }
  return ok(res, { count: rows.length, outstanding, overdue, upcoming: outstanding - overdue });
}));

router.get("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const kind = qs(req.query["kind"]) ?? "receivable";
  if (!can(user, kind, "read")) return forbidden(res);
  const partnerId = qs(req.query["partnerId"]);
  const status = qs(req.query["status"]);
  const q = qs(req.query["q"]);
  const page = Math.max(1, qi(req.query["page"], 1));
  const limit = Math.min(100, qi(req.query["limit"], 50));

  const where = {
    companyId: user.companyId, kind: kind as DebtKind,
    ...(partnerId ? { partnerId } : {}),
    ...(status ? { status: status as DebtStatus } : {}),
    ...(q ? { description: { contains: q, mode: "insensitive" as const } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.debt.count({ where }),
    prisma.debt.findMany({
      where,
      include: { partner: { select: { id: true, name: true } }, contract: { select: { id: true, number: true } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      skip: (page - 1) * limit, take: limit,
    }),
  ]);
  return ok(res, rows, { total, page, limit });
}));

router.post("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const d = debtSchema.parse(req.body);
  if (!can(user, d.kind, "write")) return forbidden(res);
  // Đối tác/hợp đồng (nếu có) phải thuộc công ty.
  if (d.partnerId) {
    const p = await prisma.partner.findFirst({ where: { id: d.partnerId, companyId: user.companyId }, select: { id: true } });
    if (!p) return badRequest(res, "Đối tác không hợp lệ");
  }
  if (d.contractId) {
    const c = await prisma.contract.findFirst({ where: { id: d.contractId, companyId: user.companyId }, select: { id: true } });
    if (!c) return badRequest(res, "Hợp đồng không hợp lệ");
  }
  const row = await prisma.debt.create({
    data: {
      companyId: user.companyId, kind: d.kind as DebtKind,
      partnerId: d.partnerId ?? null, contractId: d.contractId ?? null,
      description: d.description, amount: d.amount,
      issueDate: toDate(d.issueDate), dueDate: toDate(d.dueDate),
      note: d.note ?? null, createdBy: user.id,
    },
  });
  return created(res, row);
}));

router.patch("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const id = param(req.params["id"]);
  const found = await prisma.debt.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Công nợ");
  if (!can(user, found.kind, "write")) return forbidden(res);
  const d = debtSchema.partial().omit({ kind: true }).parse(req.body);
  const amount = d.amount ?? num(found.amount);
  const row = await prisma.debt.update({
    where: { id },
    data: {
      ...(d.partnerId !== undefined ? { partnerId: d.partnerId } : {}),
      ...(d.contractId !== undefined ? { contractId: d.contractId } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.amount !== undefined ? { amount: d.amount, status: statusOf(amount, num(found.paidAmount)) } : {}),
      ...(d.issueDate !== undefined ? { issueDate: toDate(d.issueDate) } : {}),
      ...(d.dueDate !== undefined ? { dueDate: toDate(d.dueDate) } : {}),
      ...(d.note !== undefined ? { note: d.note } : {}),
    },
  });
  return ok(res, row);
}));

router.delete("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const id = param(req.params["id"]);
  const found = await prisma.debt.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Công nợ");
  if (!can(user, found.kind, "delete")) return forbidden(res);
  await prisma.debt.delete({ where: { id } });
  return noContent(res);
}));

const paySchema = z.object({ amount: z.number().positive() });

router.post("/:id/pay", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const id = param(req.params["id"]);
  const found = await prisma.debt.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Công nợ");
  if (!can(user, found.kind, "write")) return forbidden(res);
  const { amount } = paySchema.parse(req.body);
  const newPaid = Math.min(num(found.amount), num(found.paidAmount) + amount);
  const row = await prisma.debt.update({
    where: { id },
    data: { paidAmount: newPaid, status: statusOf(num(found.amount), newPaid) },
  });
  return ok(res, row);
}));

export default router;
