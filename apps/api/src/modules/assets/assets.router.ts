// src/modules/assets/assets.router.ts
// Module Tài sản cố định & Góp vốn. Gate quyền "assets".
// - Tài sản: nguyên giá + khấu hao đường thẳng → giá trị còn lại (NBV) tính realtime.
// - Góp vốn: tiền / tài sản / QSDĐ / SHTT / khác + định giá (todo02 mục 1.3).
//
//  GET    /assets                  — danh sách TSCĐ (kèm khấu hao luỹ kế + NBV)
//  GET    /assets/stats            — tổng nguyên giá + giá trị còn lại
//  POST   /assets                  — tạo TSCĐ
//  PATCH  /assets/:id              — sửa
//  DELETE /assets/:id              — xóa
//  GET    /assets/capital          — danh sách góp vốn
//  GET    /assets/capital/stats    — tổng vốn góp theo hình thức
//  POST   /assets/capital          — tạo khoản góp vốn
//  PATCH  /assets/capital/:id      — sửa
//  DELETE /assets/capital/:id      — xóa

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import type { AssetStatus, CapitalKind, CapitalStatus } from "@vsme/db";
import { requireAuth } from "../../middleware/auth.js";
import { ok, created, notFound, badRequest, forbidden, noContent, wrap } from "../../lib/response.js";
import { hasPermission } from "../../lib/rbac.js";
import { qs, param } from "../../lib/query.js";

const router = Router();
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);

// Khấu hao đường thẳng → khấu hao luỹ kế + giá trị còn lại (NBV) tại thời điểm hiện tại.
function depreciation(a: { cost: unknown; salvageValue: unknown; usefulLifeMonths: number | null; acquisitionDate: Date | null; status: string }) {
  const cost = num(a.cost), salvage = num(a.salvageValue);
  const life = a.usefulLifeMonths ?? 0;
  if (a.status === "disposed") return { monthly: 0, accumulated: cost - salvage, nbv: salvage };
  if (!life || !a.acquisitionDate) return { monthly: 0, accumulated: 0, nbv: cost };
  const now = new Date();
  const months = Math.max(0,
    (now.getUTCFullYear() - a.acquisitionDate.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - a.acquisitionDate.getUTCMonth()));
  const monthly = (cost - salvage) / life;
  const accumulated = Math.min(cost - salvage, monthly * months);
  return { monthly: Math.round(monthly), accumulated: Math.round(accumulated), nbv: Math.round(cost - accumulated) };
}

// ─── Tài sản cố định ────────────────────────────────────────────────────────────

const assetSchema = z.object({
  name:             z.string().min(1).max(300),
  code:             z.string().max(50).nullable().optional(),
  category:         z.string().max(100).nullable().optional(),
  acquisitionDate:  z.string().nullable().optional(),
  cost:             z.number().nonnegative(),
  salvageValue:     z.number().nonnegative().nullable().optional(),
  usefulLifeMonths: z.number().int().min(0).nullable().optional(),
  status:           z.enum(["active", "disposed"]).optional(),
  partnerId:        z.string().uuid().nullable().optional(),
  note:             z.string().max(2000).nullable().optional(),
});

router.get("/stats", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "assets", "read")) return forbidden(res);
  const rows = await prisma.asset.findMany({
    where: { companyId: user.companyId },
    select: { cost: true, salvageValue: true, usefulLifeMonths: true, acquisitionDate: true, status: true },
  });
  let totalCost = 0, totalNbv = 0, active = 0;
  for (const a of rows) {
    totalCost += num(a.cost);
    totalNbv += depreciation(a).nbv;
    if (a.status === "active") active++;
  }
  return ok(res, { count: rows.length, active, totalCost, totalNbv });
}));

router.get("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "assets", "read")) return forbidden(res);
  const rows = await prisma.asset.findMany({
    where: { companyId: user.companyId },
    include: { partner: { select: { id: true, name: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  return ok(res, rows.map((a) => ({ ...a, ...depreciation(a) })));
}));

router.post("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "assets", "write")) return forbidden(res);
  const d = assetSchema.parse(req.body);
  if (d.partnerId) {
    const p = await prisma.partner.findFirst({ where: { id: d.partnerId, companyId: user.companyId }, select: { id: true } });
    if (!p) return badRequest(res, "Đối tác không hợp lệ");
  }
  const row = await prisma.asset.create({
    data: {
      companyId: user.companyId, name: d.name, code: d.code ?? null, category: d.category ?? null,
      acquisitionDate: toDate(d.acquisitionDate), cost: d.cost, salvageValue: d.salvageValue ?? 0,
      usefulLifeMonths: d.usefulLifeMonths ?? null, status: (d.status ?? "active") as AssetStatus,
      partnerId: d.partnerId ?? null, note: d.note ?? null, createdBy: user.id,
    },
  });
  return created(res, row);
}));

router.patch("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "assets", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.asset.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Tài sản");
  const d = assetSchema.partial().parse(req.body);
  const row = await prisma.asset.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.code !== undefined ? { code: d.code } : {}),
      ...(d.category !== undefined ? { category: d.category } : {}),
      ...(d.acquisitionDate !== undefined ? { acquisitionDate: toDate(d.acquisitionDate) } : {}),
      ...(d.cost !== undefined ? { cost: d.cost } : {}),
      ...(d.salvageValue !== undefined ? { salvageValue: d.salvageValue ?? 0 } : {}),
      ...(d.usefulLifeMonths !== undefined ? { usefulLifeMonths: d.usefulLifeMonths } : {}),
      ...(d.status !== undefined ? { status: d.status as AssetStatus } : {}),
      ...(d.partnerId !== undefined ? { partnerId: d.partnerId } : {}),
      ...(d.note !== undefined ? { note: d.note } : {}),
    },
  });
  return ok(res, row);
}));

router.delete("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "assets", "delete")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.asset.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Tài sản");
  await prisma.asset.delete({ where: { id } });
  return noContent(res);
}));

// ─── Góp vốn ─────────────────────────────────────────────────────────────────────

const capitalSchema = z.object({
  contributorName: z.string().min(1).max(300),
  partnerId:       z.string().uuid().nullable().optional(),
  kind:            z.enum(["cash", "asset", "land_use_right", "ip_right", "other"]),
  description:     z.string().max(2000).nullable().optional(),
  value:           z.number().nonnegative(),
  valuationMethod: z.string().max(300).nullable().optional(),
  contributedDate: z.string().nullable().optional(),
  status:          z.enum(["proposed", "valued", "recorded"]).optional(),
  note:            z.string().max(2000).nullable().optional(),
});

router.get("/capital/stats", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "assets", "read")) return forbidden(res);
  const grouped = await prisma.capitalContribution.groupBy({
    by: ["kind"], where: { companyId: user.companyId }, _sum: { value: true },
  });
  const byKind: Record<string, number> = {};
  let total = 0;
  for (const g of grouped) { const v = num(g._sum.value); byKind[g.kind] = v; total += v; }
  return ok(res, { total, byKind });
}));

router.get("/capital", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "assets", "read")) return forbidden(res);
  const kind = qs(req.query["kind"]);
  const rows = await prisma.capitalContribution.findMany({
    where: { companyId: user.companyId, ...(kind ? { kind: kind as CapitalKind } : {}) },
    include: { partner: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return ok(res, rows);
}));

router.post("/capital", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "assets", "write")) return forbidden(res);
  const d = capitalSchema.parse(req.body);
  if (d.partnerId) {
    const p = await prisma.partner.findFirst({ where: { id: d.partnerId, companyId: user.companyId }, select: { id: true } });
    if (!p) return badRequest(res, "Đối tác không hợp lệ");
  }
  const row = await prisma.capitalContribution.create({
    data: {
      companyId: user.companyId, contributorName: d.contributorName, partnerId: d.partnerId ?? null,
      kind: d.kind as CapitalKind, description: d.description ?? null, value: d.value,
      valuationMethod: d.valuationMethod ?? null, contributedDate: toDate(d.contributedDate),
      status: (d.status ?? "proposed") as CapitalStatus, note: d.note ?? null, createdBy: user.id,
    },
  });
  return created(res, row);
}));

router.patch("/capital/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "assets", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.capitalContribution.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Khoản góp vốn");
  const d = capitalSchema.partial().parse(req.body);
  const row = await prisma.capitalContribution.update({
    where: { id },
    data: {
      ...(d.contributorName !== undefined ? { contributorName: d.contributorName } : {}),
      ...(d.partnerId !== undefined ? { partnerId: d.partnerId } : {}),
      ...(d.kind !== undefined ? { kind: d.kind as CapitalKind } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.value !== undefined ? { value: d.value } : {}),
      ...(d.valuationMethod !== undefined ? { valuationMethod: d.valuationMethod } : {}),
      ...(d.contributedDate !== undefined ? { contributedDate: toDate(d.contributedDate) } : {}),
      ...(d.status !== undefined ? { status: d.status as CapitalStatus } : {}),
      ...(d.note !== undefined ? { note: d.note } : {}),
    },
  });
  return ok(res, row);
}));

router.delete("/capital/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "assets", "delete")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.capitalContribution.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Khoản góp vốn");
  await prisma.capitalContribution.delete({ where: { id } });
  return noContent(res);
}));

export default router;
