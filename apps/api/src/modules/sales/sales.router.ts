// src/modules/sales/sales.router.ts
// Module Bán hàng & CSKH — đơn hàng (sales order + lines) + chăm sóc khách hàng.
// Đối tác (KH) quản lý ở /partners. Gate quyền "sales".
//
//  GET    /sales/stats                  — KPI đơn hàng
//  GET    /sales/orders?status=&q=      — danh sách đơn hàng
//  GET    /sales/orders/:id             — chi tiết + dòng hàng
//  POST   /sales/orders                 — tạo đơn (kèm dòng hàng)
//  PATCH  /sales/orders/:id             — sửa (trạng thái/ghi chú/dòng hàng)
//  DELETE /sales/orders/:id             — xóa
//  GET    /sales/interactions?status=&partnerId=  — CSKH
//  POST   /sales/interactions           — ghi tương tác CSKH
//  PATCH  /sales/interactions/:id       — sửa
//  DELETE /sales/interactions/:id       — xóa

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import type { SalesOrderStatus, InteractionType, InteractionStatus } from "@vsme/db";
import { requireAuth } from "../../middleware/auth.js";
import { ok, created, notFound, badRequest, forbidden, noContent, wrap } from "../../lib/response.js";
import { hasPermission } from "../../lib/rbac.js";
import { qs, param } from "../../lib/query.js";

const router = Router();
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);
const ORDER_STATUSES = ["draft", "confirmed", "delivered", "invoiced", "cancelled"];
const INTER_STATUSES = ["open", "done"];

// ─── Đơn hàng ────────────────────────────────────────────────────────────────────

const lineSchema = z.object({
  productId: z.string().uuid().nullable().optional(), // FK tới Product → tự giảm tồn kho khi giao
  itemName:  z.string().min(1).max(300),
  quantity:  z.number().positive(),
  unitPrice: z.number().nonnegative(),
});
const orderSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  orderDate:  z.string().nullable().optional(),
  status:     z.enum(["draft", "confirmed", "delivered", "invoiced", "cancelled"]).optional(),
  note:       z.string().max(2000).nullable().optional(),
  lines:      z.array(lineSchema).optional(),
});

async function nextOrderCode(companyId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const count = await prisma.salesOrder.count({ where: { companyId, code: { startsWith: `SO${year}-` } } });
  return `SO${year}-${String(count + 1).padStart(4, "0")}`;
}

router.get("/stats", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "sales", "read")) return forbidden(res);
  const grouped = await prisma.salesOrder.groupBy({
    by: ["status"], where: { companyId: user.companyId }, _count: { _all: true }, _sum: { total: true },
  });
  const byStatus: Record<string, number> = {};
  let count = 0, totalValue = 0, openValue = 0;
  for (const g of grouped) {
    byStatus[g.status] = g._count._all; count += g._count._all;
    const v = num(g._sum.total); totalValue += v;
    if (g.status !== "cancelled") openValue += v;
  }
  return ok(res, { count, totalValue, openValue, byStatus });
}));

router.get("/orders", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "sales", "read")) return forbidden(res);
  const status = qs(req.query["status"]);
  const q = qs(req.query["q"]);
  const rows = await prisma.salesOrder.findMany({
    where: {
      companyId: user.companyId,
      ...(status && ORDER_STATUSES.includes(status) ? { status: status as SalesOrderStatus } : {}),
      ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" as const } }, { note: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    include: { customer: { select: { id: true, name: true } }, _count: { select: { lines: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return ok(res, rows);
}));

router.get("/orders/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "sales", "read")) return forbidden(res);
  const row = await prisma.salesOrder.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId },
    include: { customer: { select: { id: true, name: true } }, lines: true },
  });
  if (!row) return notFound(res, "Đơn hàng");
  return ok(res, row);
}));

router.post("/orders", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "sales", "write")) return forbidden(res);
  const d = orderSchema.parse(req.body);
  if (d.customerId) {
    const c = await prisma.partner.findFirst({ where: { id: d.customerId, companyId: user.companyId }, select: { id: true } });
    if (!c) return badRequest(res, "Khách hàng không hợp lệ");
  }
  const lines = (d.lines ?? []).map((l) => ({ productId: l.productId ?? null, itemName: l.itemName, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.quantity * l.unitPrice }));
  const total = lines.reduce((s, l) => s + l.amount, 0);

  // Validate productIds belong to company
  const pids = lines.map((l) => l.productId).filter(Boolean) as string[];
  if (pids.length) {
    const prods = await prisma.product.findMany({ where: { id: { in: pids }, companyId: user.companyId }, select: { id: true } });
    if (prods.length !== pids.length) return badRequest(res, "Một hoặc nhiều sản phẩm không hợp lệ");
  }

  // Sinh mã đơn dựa trên count có thể trùng (đồng thời / sau khi xóa) → retry P2002.
  const isP2002 = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
  let row = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextOrderCode(user.companyId);
    try {
      row = await prisma.salesOrder.create({
        data: {
          companyId: user.companyId, code, customerId: d.customerId ?? null,
          orderDate: toDate(d.orderDate) ?? new Date(), status: (d.status ?? "draft") as SalesOrderStatus,
          note: d.note ?? null, total, createdBy: user.id,
          lines: { create: lines },
        },
        include: { lines: true },
      });
      break;
    } catch (e) {
      if (isP2002(e) && attempt < 4) continue;
      throw e;
    }
  }
  return created(res, row);
}));

router.patch("/orders/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "sales", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.salesOrder.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Đơn hàng");
  const d = orderSchema.parse(req.body);

  // Nếu gửi lines → thay toàn bộ + tính lại total.
  const lines = d.lines?.map((l) => ({ productId: l.productId ?? null, itemName: l.itemName, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.quantity * l.unitPrice }));
  const total = lines ? lines.reduce((s, l) => s + l.amount, 0) : undefined;

  // Validate productIds nếu có
  if (lines) {
    const pids = lines.map((l) => l.productId).filter(Boolean) as string[];
    if (pids.length) {
      const prods = await prisma.product.findMany({ where: { id: { in: pids }, companyId: user.companyId }, select: { id: true } });
      if (prods.length !== pids.length) return badRequest(res, "Một hoặc nhiều sản phẩm không hợp lệ");
    }
  }

  const STOCK_TRIGGER = ["delivered", "invoiced"]; // status kích hoạt xuất kho
  const needsStock = d.status && STOCK_TRIGGER.includes(d.status) && !STOCK_TRIGGER.includes(found.status);

  const row = await prisma.$transaction(async (tx) => {
    if (lines) {
      await tx.salesOrderLine.deleteMany({ where: { orderId: id } });
      await tx.salesOrderLine.createMany({ data: lines.map((l) => ({ ...l, orderId: id })) });
    }
    const updated = await tx.salesOrder.update({
      where: { id },
      data: {
        ...(d.customerId !== undefined ? { customerId: d.customerId } : {}),
        ...(d.orderDate !== undefined ? { orderDate: toDate(d.orderDate) } : {}),
        ...(d.status !== undefined ? { status: d.status as SalesOrderStatus } : {}),
        ...(d.note !== undefined ? { note: d.note } : {}),
        ...(total !== undefined ? { total } : {}),
      },
      include: { lines: true },
    });

    // Xuất kho tự động khi chuyển sang delivered/invoiced lần đầu
    if (needsStock) {
      const linesWithProduct = updated.lines.filter((l) => l.productId);
      for (const l of linesWithProduct) {
        await tx.stockMovement.create({
          data: {
            companyId: user.companyId, productId: l.productId!, kind: "out",
            quantity: l.quantity, unitCost: l.unitPrice,
            reference: updated.code, note: `Xuất kho theo đơn hàng ${updated.code}`,
            createdBy: user.id,
          },
        });
      }
    }
    return updated;
  });
  return ok(res, row);
}));

router.delete("/orders/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "sales", "delete")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.salesOrder.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Đơn hàng");
  await prisma.salesOrder.delete({ where: { id } });
  return noContent(res);
}));

// ─── CSKH (tương tác khách hàng) ────────────────────────────────────────────────

const interactionSchema = z.object({
  partnerId: z.string().uuid().nullable().optional(),
  type:      z.enum(["call", "email", "meeting", "note", "ticket"]),
  subject:   z.string().min(1).max(300),
  content:   z.string().max(4000).nullable().optional(),
  status:    z.enum(["open", "done"]).optional(),
  date:      z.string().nullable().optional(),
});

router.get("/interactions", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "sales", "read")) return forbidden(res);
  const status = qs(req.query["status"]);
  const partnerId = qs(req.query["partnerId"]);
  const rows = await prisma.customerInteraction.findMany({
    where: {
      companyId: user.companyId,
      ...(status && INTER_STATUSES.includes(status) ? { status: status as InteractionStatus } : {}),
      ...(partnerId ? { partnerId } : {}),
    },
    include: { partner: { select: { id: true, name: true } } },
    orderBy: { date: "desc" },
    take: 200,
  });
  return ok(res, rows);
}));

router.post("/interactions", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "sales", "write")) return forbidden(res);
  const d = interactionSchema.parse(req.body);
  if (d.partnerId) {
    const p = await prisma.partner.findFirst({ where: { id: d.partnerId, companyId: user.companyId }, select: { id: true } });
    if (!p) return badRequest(res, "Khách hàng không hợp lệ");
  }
  const row = await prisma.customerInteraction.create({
    data: {
      companyId: user.companyId, partnerId: d.partnerId ?? null, type: d.type as InteractionType,
      subject: d.subject, content: d.content ?? null, status: (d.status ?? "open") as InteractionStatus,
      date: toDate(d.date) ?? new Date(), createdBy: user.id,
    },
  });
  return created(res, row);
}));

router.patch("/interactions/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "sales", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.customerInteraction.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Tương tác");
  const d = interactionSchema.partial().parse(req.body);
  const row = await prisma.customerInteraction.update({
    where: { id },
    data: {
      ...(d.partnerId !== undefined ? { partnerId: d.partnerId } : {}),
      ...(d.type !== undefined ? { type: d.type as InteractionType } : {}),
      ...(d.subject !== undefined ? { subject: d.subject } : {}),
      ...(d.content !== undefined ? { content: d.content } : {}),
      ...(d.status !== undefined ? { status: d.status as InteractionStatus } : {}),
      ...(d.date !== undefined ? { date: toDate(d.date) ?? new Date() } : {}),
    },
  });
  return ok(res, row);
}));

router.delete("/interactions/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "sales", "delete")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.customerInteraction.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Tương tác");
  await prisma.customerInteraction.delete({ where: { id } });
  return noContent(res);
}));

export default router;
