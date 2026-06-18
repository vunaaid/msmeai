// src/modules/cash/cash.router.ts
// Module Ngân quỹ — sổ quỹ tiền mặt & ngân hàng: tài khoản quỹ + phiếu thu/chi + số dư.
// Gate quyền "cash".
//
//  GET    /cash/accounts                 — tài khoản quỹ + số dư
//  POST   /cash/accounts                 — tạo tài khoản quỹ
//  PATCH  /cash/accounts/:id             — sửa
//  DELETE /cash/accounts/:id             — xóa (nếu chưa có giao dịch)
//  GET    /cash/transactions?accountId=&kind=&q=  — phiếu thu/chi
//  POST   /cash/transactions             — ghi phiếu thu/chi
//  DELETE /cash/transactions/:id         — xóa phiếu
//  GET    /cash/stats                    — tổng số dư + thu/chi tháng này

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import type { CashAccountType, CashTxKind } from "@vsme/db";
import { requireAuth } from "../../middleware/auth.js";
import { ok, created, notFound, badRequest, forbidden, noContent, conflict, wrap } from "../../lib/response.js";
import { hasPermission } from "../../lib/rbac.js";
import { qs, qi, param } from "../../lib/query.js";

const router = Router();
const num = (v: unknown): number => (v == null ? 0 : Number(v));

// ─── Tài khoản quỹ ─────────────────────────────────────────────────────────────

const accountSchema = z.object({
  name:           z.string().min(1).max(200),
  type:           z.enum(["cash", "bank"]),
  bankName:       z.string().max(200).nullable().optional(),
  accountNo:      z.string().max(50).nullable().optional(),
  openingBalance: z.number().nullable().optional(),
  isActive:       z.boolean().optional(),
});

// Số dư = đầu kỳ + thu − chi.
async function balances(companyId: string): Promise<Map<string, number>> {
  const grouped = await prisma.cashTransaction.groupBy({
    by: ["accountId", "kind"], where: { companyId }, _sum: { amount: true },
  });
  const m = new Map<string, number>();
  for (const g of grouped) {
    const delta = (g.kind === "receipt" ? 1 : -1) * num(g._sum.amount);
    m.set(g.accountId, (m.get(g.accountId) ?? 0) + delta);
  }
  return m;
}

router.get("/accounts", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "cash", "read")) return forbidden(res);
  const [rows, bal] = await Promise.all([
    prisma.cashAccount.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" } }),
    balances(user.companyId),
  ]);
  return ok(res, rows.map((a) => ({ ...a, balance: num(a.openingBalance) + (bal.get(a.id) ?? 0) })));
}));

router.post("/accounts", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "cash", "write")) return forbidden(res);
  const d = accountSchema.parse(req.body);
  const row = await prisma.cashAccount.create({
    data: {
      companyId: user.companyId, name: d.name, type: d.type as CashAccountType,
      bankName: d.bankName ?? null, accountNo: d.accountNo ?? null,
      openingBalance: d.openingBalance ?? 0, isActive: d.isActive ?? true,
    },
  });
  return created(res, row);
}));

router.patch("/accounts/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "cash", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.cashAccount.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Tài khoản quỹ");
  const d = accountSchema.partial().parse(req.body);
  const row = await prisma.cashAccount.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.type !== undefined ? { type: d.type as CashAccountType } : {}),
      ...(d.bankName !== undefined ? { bankName: d.bankName } : {}),
      ...(d.accountNo !== undefined ? { accountNo: d.accountNo } : {}),
      ...(d.openingBalance !== undefined ? { openingBalance: d.openingBalance ?? 0 } : {}),
      ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
    },
  });
  return ok(res, row);
}));

router.delete("/accounts/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "cash", "delete")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.cashAccount.findFirst({
    where: { id, companyId: user.companyId },
    include: { _count: { select: { transactions: true } } },
  });
  if (!found) return notFound(res, "Tài khoản quỹ");
  if (found._count.transactions > 0) return conflict(res, "Tài khoản còn giao dịch, không thể xóa");
  await prisma.cashAccount.delete({ where: { id } });
  return noContent(res);
}));

// ─── Phiếu thu/chi ─────────────────────────────────────────────────────────────

const txSchema = z.object({
  accountId:   z.string().uuid(),
  kind:        z.enum(["receipt", "payment"]),
  amount:      z.number().positive(),
  date:        z.string().nullable().optional(),
  category:    z.string().max(100).nullable().optional(),
  description: z.string().min(1).max(500),
  partnerId:   z.string().uuid().nullable().optional(),
});

router.get("/transactions", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "cash", "read")) return forbidden(res);
  const accountId = qs(req.query["accountId"]);
  const kind = qs(req.query["kind"]);
  const q = qs(req.query["q"]);
  const page = Math.max(1, qi(req.query["page"], 1));
  const limit = Math.min(100, qi(req.query["limit"], 50));
  const where = {
    companyId: user.companyId,
    ...(accountId ? { accountId } : {}),
    ...(kind ? { kind: kind as CashTxKind } : {}),
    ...(q ? { description: { contains: q, mode: "insensitive" as const } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.cashTransaction.count({ where }),
    prisma.cashTransaction.findMany({
      where,
      include: { account: { select: { id: true, name: true } }, partner: { select: { id: true, name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit, take: limit,
    }),
  ]);
  return ok(res, rows, { total, page, limit });
}));

router.post("/transactions", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "cash", "write")) return forbidden(res);
  const d = txSchema.parse(req.body);
  const acc = await prisma.cashAccount.findFirst({ where: { id: d.accountId, companyId: user.companyId }, select: { id: true } });
  if (!acc) return notFound(res, "Tài khoản quỹ");
  if (d.partnerId) {
    const p = await prisma.partner.findFirst({ where: { id: d.partnerId, companyId: user.companyId }, select: { id: true } });
    if (!p) return badRequest(res, "Đối tác không hợp lệ");
  }
  const row = await prisma.cashTransaction.create({
    data: {
      companyId: user.companyId, accountId: d.accountId, kind: d.kind as CashTxKind,
      amount: d.amount, date: d.date ? new Date(d.date) : new Date(),
      category: d.category ?? null, description: d.description,
      partnerId: d.partnerId ?? null, createdBy: user.id,
    },
  });
  return created(res, row);
}));

router.delete("/transactions/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "cash", "delete")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.cashTransaction.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Giao dịch");
  await prisma.cashTransaction.delete({ where: { id } });
  return noContent(res);
}));

// ─── Tổng quan ─────────────────────────────────────────────────────────────────

router.get("/stats", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "cash", "read")) return forbidden(res);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [accounts, bal, monthAgg] = await Promise.all([
    prisma.cashAccount.findMany({ where: { companyId: user.companyId }, select: { id: true, openingBalance: true } }),
    balances(user.companyId),
    prisma.cashTransaction.groupBy({ by: ["kind"], where: { companyId: user.companyId, date: { gte: monthStart } }, _sum: { amount: true } }),
  ]);
  const totalBalance = accounts.reduce((s, a) => s + num(a.openingBalance) + (bal.get(a.id) ?? 0), 0);
  let monthIn = 0, monthOut = 0;
  for (const g of monthAgg) { if (g.kind === "receipt") monthIn = num(g._sum.amount); else monthOut = num(g._sum.amount); }
  return ok(res, { totalBalance, monthIn, monthOut, accounts: accounts.length });
}));

export default router;
