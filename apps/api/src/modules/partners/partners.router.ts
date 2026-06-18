// src/modules/partners/partners.router.ts
// Module Đối tác — Khách hàng (customer) & Nhà cung cấp (vendor). Nền cho Bán hàng,
// Công nợ AR/AP, Hợp đồng. Gate theo quyền "sales".
//
//  GET    /partners?kind=&q=&page=&limit=   — danh sách (lọc KH/NCC + tìm)
//  GET    /partners/stats                   — đếm theo loại
//  GET    /partners/:id                      — chi tiết
//  POST   /partners                          — tạo
//  PATCH  /partners/:id                      — sửa
//  DELETE /partners/:id                      — xóa

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import type { PartnerKind } from "@vsme/db";
import { requireAuth } from "../../middleware/auth.js";
import { ok, created, notFound, forbidden, noContent, conflict, wrap } from "../../lib/response.js";
import { hasPermission } from "../../lib/rbac.js";
import { qs, qi, param } from "../../lib/query.js";

const router = Router();

const partnerSchema = z.object({
  kind:            z.enum(["customer", "vendor", "both"]),
  name:            z.string().min(1).max(300),
  code:            z.string().max(50).nullable().optional(),
  taxCode:         z.string().max(30).nullable().optional(),
  address:         z.string().max(500).nullable().optional(),
  phone:           z.string().max(30).nullable().optional(),
  email:           z.string().email().nullable().optional(),
  contactPerson:   z.string().max(200).nullable().optional(),
  contactPhone:    z.string().max(30).nullable().optional(),
  creditLimit:     z.number().nonnegative().nullable().optional(),
  paymentTermDays: z.number().int().min(0).nullable().optional(),
  note:            z.string().max(2000).nullable().optional(),
  isActive:        z.boolean().optional(),
});

router.get("/stats", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "sales", "read")) return forbidden(res);
  const grouped = await prisma.partner.groupBy({
    by: ["kind"], where: { companyId: user.companyId }, _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.kind] = g._count._all;
  return ok(res, { customer: (counts["customer"] ?? 0) + (counts["both"] ?? 0), vendor: (counts["vendor"] ?? 0) + (counts["both"] ?? 0), counts });
}));

router.get("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "sales", "read")) return forbidden(res);
  const kind = qs(req.query["kind"]); // customer | vendor
  const q = qs(req.query["q"]);
  const page = Math.max(1, qi(req.query["page"], 1));
  const limit = Math.min(100, qi(req.query["limit"], 50));

  // KH gồm 'customer' + 'both'; NCC gồm 'vendor' + 'both'.
  const kindWhere =
    kind === "customer" ? { kind: { in: ["customer", "both"] as PartnerKind[] } } :
    kind === "vendor"   ? { kind: { in: ["vendor", "both"] as PartnerKind[] } } : {};

  const where = {
    companyId: user.companyId,
    ...kindWhere,
    ...(q ? { OR: [
      { name: { contains: q, mode: "insensitive" as const } },
      { code: { contains: q, mode: "insensitive" as const } },
      { taxCode: { contains: q, mode: "insensitive" as const } },
    ] } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.partner.count({ where }),
    prisma.partner.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * limit, take: limit }),
  ]);
  return ok(res, rows, { total, page, limit });
}));

router.get("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "sales", "read")) return forbidden(res);
  const row = await prisma.partner.findFirst({ where: { id: param(req.params["id"]), companyId: user.companyId } });
  if (!row) return notFound(res, "Đối tác");
  return ok(res, row);
}));

router.post("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "sales", "write")) return forbidden(res);
  const d = partnerSchema.parse(req.body);
  if (d.taxCode) {
    const dup = await prisma.partner.findFirst({ where: { companyId: user.companyId, taxCode: d.taxCode } });
    if (dup) return conflict(res, `Mã số thuế "${d.taxCode}" đã tồn tại`);
  }
  const row = await prisma.partner.create({
    data: {
      companyId: user.companyId, kind: d.kind as PartnerKind, name: d.name,
      code: d.code ?? null, taxCode: d.taxCode ?? null, address: d.address ?? null,
      phone: d.phone ?? null, email: d.email ?? null,
      contactPerson: d.contactPerson ?? null, contactPhone: d.contactPhone ?? null,
      creditLimit: d.creditLimit ?? null, paymentTermDays: d.paymentTermDays ?? null,
      note: d.note ?? null, isActive: d.isActive ?? true,
    },
  });
  return created(res, row);
}));

router.patch("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "sales", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.partner.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Đối tác");
  const d = partnerSchema.partial().parse(req.body);
  const row = await prisma.partner.update({
    where: { id },
    data: {
      ...(d.kind !== undefined ? { kind: d.kind as PartnerKind } : {}),
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.code !== undefined ? { code: d.code } : {}),
      ...(d.taxCode !== undefined ? { taxCode: d.taxCode } : {}),
      ...(d.address !== undefined ? { address: d.address } : {}),
      ...(d.phone !== undefined ? { phone: d.phone } : {}),
      ...(d.email !== undefined ? { email: d.email } : {}),
      ...(d.contactPerson !== undefined ? { contactPerson: d.contactPerson } : {}),
      ...(d.contactPhone !== undefined ? { contactPhone: d.contactPhone } : {}),
      ...(d.creditLimit !== undefined ? { creditLimit: d.creditLimit } : {}),
      ...(d.paymentTermDays !== undefined ? { paymentTermDays: d.paymentTermDays } : {}),
      ...(d.note !== undefined ? { note: d.note } : {}),
      ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
    },
  });
  return ok(res, row);
}));

router.delete("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "sales", "delete")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.partner.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Đối tác");
  await prisma.partner.delete({ where: { id } });
  return noContent(res);
}));

export default router;
