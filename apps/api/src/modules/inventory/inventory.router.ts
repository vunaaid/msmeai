// src/modules/inventory/inventory.router.ts
// Module Hàng tồn kho — sản phẩm + nhập/xuất/điều chỉnh kho + tồn realtime. Gate "inventory".
//
//  GET    /inventory/products            — sản phẩm + tồn kho + giá trị tồn
//  GET    /inventory/stats               — tổng sản phẩm + giá trị tồn
//  POST   /inventory/products            — tạo sản phẩm
//  PATCH  /inventory/products/:id        — sửa
//  DELETE /inventory/products/:id        — xóa
//  GET    /inventory/movements?productId=&kind=  — phiếu nhập/xuất
//  POST   /inventory/movements           — ghi nhập/xuất/điều chỉnh
//  DELETE /inventory/movements/:id       — xóa phiếu

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import type { StockMoveKind } from "@vsme/db";
import { requireAuth } from "../../middleware/auth.js";
import { ok, created, notFound, badRequest, forbidden, noContent, conflict, wrap } from "../../lib/response.js";
import { hasPermission } from "../../lib/rbac.js";
import { qs, param } from "../../lib/query.js";

const router = Router();
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);

// Tồn kho mỗi SP = Σ(nhập) − Σ(xuất) + Σ(điều chỉnh, có dấu).
async function onHandMap(companyId: string): Promise<Map<string, number>> {
  const g = await prisma.stockMovement.groupBy({
    by: ["productId", "kind"], where: { companyId }, _sum: { quantity: true },
  });
  const m = new Map<string, number>();
  for (const r of g) {
    const sign = r.kind === "out" ? -1 : 1; // in:+, out:−, adjust:+ (quantity có dấu)
    m.set(r.productId, (m.get(r.productId) ?? 0) + sign * num(r._sum.quantity));
  }
  return m;
}

// ─── Sản phẩm ────────────────────────────────────────────────────────────────────

const productSchema = z.object({
  name:      z.string().min(1).max(300),
  sku:       z.string().max(50).nullable().optional(),
  unit:      z.string().max(30).optional(),
  category:  z.string().max(100).nullable().optional(),
  costPrice: z.number().nonnegative().optional(),
  salePrice: z.number().nonnegative().optional(),
  note:      z.string().max(2000).nullable().optional(),
  isActive:  z.boolean().optional(),
});

router.get("/stats", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "inventory", "read")) return forbidden(res);
  const [products, onhand] = await Promise.all([
    prisma.product.findMany({ where: { companyId: user.companyId }, select: { id: true, costPrice: true } }),
    onHandMap(user.companyId),
  ]);
  let stockValue = 0;
  for (const p of products) stockValue += (onhand.get(p.id) ?? 0) * num(p.costPrice);
  return ok(res, { products: products.length, stockValue });
}));

router.get("/products", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "inventory", "read")) return forbidden(res);
  const q = qs(req.query["q"]);
  const [rows, onhand] = await Promise.all([
    prisma.product.findMany({
      where: { companyId: user.companyId, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { sku: { contains: q, mode: "insensitive" as const } }] } : {}) },
      orderBy: { name: "asc" },
    }),
    onHandMap(user.companyId),
  ]);
  return ok(res, rows.map((p) => {
    const qty = onhand.get(p.id) ?? 0;
    return { ...p, onHand: qty, stockValue: qty * num(p.costPrice) };
  }));
}));

router.post("/products", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "inventory", "write")) return forbidden(res);
  const d = productSchema.parse(req.body);
  if (d.sku) {
    const dup = await prisma.product.findFirst({ where: { companyId: user.companyId, sku: d.sku }, select: { id: true } });
    if (dup) return conflict(res, `Mã SKU "${d.sku}" đã tồn tại`);
  }
  const row = await prisma.product.create({
    data: {
      companyId: user.companyId, name: d.name, sku: d.sku ?? null, unit: d.unit ?? "cái",
      category: d.category ?? null, costPrice: d.costPrice ?? 0, salePrice: d.salePrice ?? 0,
      note: d.note ?? null, isActive: d.isActive ?? true, createdBy: user.id,
    },
  });
  return created(res, row);
}));

router.patch("/products/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "inventory", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.product.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Sản phẩm");
  const d = productSchema.partial().parse(req.body);
  if (d.sku) {
    const dup = await prisma.product.findFirst({ where: { companyId: user.companyId, sku: d.sku, id: { not: id } }, select: { id: true } });
    if (dup) return conflict(res, `Mã SKU "${d.sku}" đã tồn tại`);
  }
  const row = await prisma.product.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.sku !== undefined ? { sku: d.sku } : {}),
      ...(d.unit !== undefined ? { unit: d.unit } : {}),
      ...(d.category !== undefined ? { category: d.category } : {}),
      ...(d.costPrice !== undefined ? { costPrice: d.costPrice } : {}),
      ...(d.salePrice !== undefined ? { salePrice: d.salePrice } : {}),
      ...(d.note !== undefined ? { note: d.note } : {}),
      ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
    },
  });
  return ok(res, row);
}));

router.delete("/products/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "inventory", "delete")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.product.findFirst({
    where: { id, companyId: user.companyId },
    include: { _count: { select: { movements: true } } },
  });
  if (!found) return notFound(res, "Sản phẩm");
  if (found._count.movements > 0) return conflict(res, "Sản phẩm đã có phát sinh nhập/xuất, không thể xóa");
  await prisma.product.delete({ where: { id } });
  return noContent(res);
}));

// ─── Nhập / Xuất / Điều chỉnh kho ────────────────────────────────────────────────

const moveSchema = z.object({
  productId: z.string().uuid(),
  kind:      z.enum(["in", "out", "adjust"]),
  quantity:  z.number(),
  unitCost:  z.number().nonnegative().nullable().optional(),
  date:      z.string().nullable().optional(),
  reference: z.string().max(100).nullable().optional(),
  partnerId: z.string().uuid().nullable().optional(),
  note:      z.string().max(2000).nullable().optional(),
});

router.get("/movements", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "inventory", "read")) return forbidden(res);
  const productId = qs(req.query["productId"]);
  const kind = qs(req.query["kind"]);
  const rows = await prisma.stockMovement.findMany({
    where: {
      companyId: user.companyId,
      ...(productId ? { productId } : {}),
      ...(kind && ["in", "out", "adjust"].includes(kind) ? { kind: kind as StockMoveKind } : {}),
    },
    include: { product: { select: { id: true, name: true, unit: true } }, partner: { select: { id: true, name: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return ok(res, rows);
}));

router.post("/movements", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "inventory", "write")) return forbidden(res);
  const d = moveSchema.parse(req.body);
  if ((d.kind === "in" || d.kind === "out") && d.quantity <= 0) return badRequest(res, "Số lượng nhập/xuất phải > 0");
  if (d.kind === "adjust" && d.quantity === 0) return badRequest(res, "Số lượng điều chỉnh phải khác 0");
  const p = await prisma.product.findFirst({ where: { id: d.productId, companyId: user.companyId }, select: { id: true } });
  if (!p) return badRequest(res, "Sản phẩm không hợp lệ");
  if (d.partnerId) {
    const pa = await prisma.partner.findFirst({ where: { id: d.partnerId, companyId: user.companyId }, select: { id: true } });
    if (!pa) return badRequest(res, "Đối tác không hợp lệ");
  }
  const row = await prisma.stockMovement.create({
    data: {
      companyId: user.companyId, productId: d.productId, kind: d.kind as StockMoveKind,
      quantity: d.quantity, unitCost: d.unitCost ?? null, date: toDate(d.date) ?? new Date(),
      reference: d.reference ?? null, partnerId: d.partnerId ?? null, note: d.note ?? null, createdBy: user.id,
    },
  });
  return created(res, row);
}));

router.delete("/movements/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "inventory", "delete")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.stockMovement.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Phiếu kho");
  await prisma.stockMovement.delete({ where: { id } });
  return noContent(res);
}));

export default router;
