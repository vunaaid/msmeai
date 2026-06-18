// src/modules/work/recurring.router.ts
// Quản lý danh mục công việc định kỳ của công ty + sinh việc thủ công.
// GET    /recurring                — danh sách
// POST   /recurring                — tạo mục
// PUT    /recurring/:id            — sửa
// DELETE /recurring/:id            — xoá
// POST   /recurring/import-defaults— nạp catalog mặc định
// POST   /recurring/generate       — sinh việc đến hạn (cho công ty)
// GET    /recurring/catalog        — xem catalog mặc định

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import { requireAuth } from "../../middleware/auth.js";
import { ok, created, notFound, badRequest, wrap } from "../../lib/response.js";
import { assertPermission } from "../../lib/rbac.js";
import { param, qi, qs } from "../../lib/query.js";
import { RECURRING_CATALOG } from "@vsme/db";
import { importDefaults, generateDueForCompany } from "./recurring.service.js";
import { occurrencesForYear } from "./recurring-schedule.js";

const router = Router();

const upsertSchema = z.object({
  roleId:        z.string().uuid(),
  title:         z.string().min(2).max(200),
  description:   z.string().max(2000).optional(),
  cadence:       z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  module:        z.string().max(50).optional(),
  priority:      z.enum(["urgent", "high", "normal", "low"]).default("normal"),
  dueOffsetDays: z.number().int().min(0).max(365).default(0),
  active:        z.boolean().default(true),
});

// ─── GET /recurring ────────────────────────────────────────────────────────────
// Xem được cho mọi user trong công ty (chỉ đọc); quản lý/sửa cần admin:configure.
// Mỗi mục kèm: nhân sự giữ vai trò (assignees) + các lần thực hiện trong năm
// (occurrences: ngày đã tính theo quy tắc thứ 6 cuối kỳ + ngày lễ, nhóm theo quý).
router.get("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const year = qi(req.query["year"], new Date().getUTCFullYear());
  // mine=1 → chỉ việc định kỳ thuộc vai trò của user (chính + bổ sung). Trang admin
  // cấu hình không truyền → vẫn nhận toàn bộ danh mục.
  const mine = qs(req.query["mine"]) === "1" || qs(req.query["mine"]) === "true";
  const myRoleIds = new Set([user.roleId, ...(user.extraRoleIds ?? [])].filter((r): r is string => !!r));

  const all = await prisma.recurringWork.findMany({
    where: { companyId: user.companyId },
    include: { role: { select: { id: true, name: true, level: true } } },
    orderBy: [{ active: "desc" }, { cadence: "asc" }, { title: "asc" }],
  });
  const items = mine ? all.filter((it) => myRoleIds.has(it.roleId)) : all;

  // Nhân sự theo từng vai trò — gồm cả người có vai trò bổ sung (vd thành viên HĐQT).
  const roleIds = [...new Set(items.map((i) => i.roleId))];
  const users = roleIds.length
    ? await prisma.user.findMany({
        where: {
          companyId: user.companyId, isActive: true,
          OR: [{ roleId: { in: roleIds } }, { extraRoleIds: { hasSome: roleIds } }],
        },
        select: { id: true, name: true, avatarUrl: true, roleId: true, extraRoleIds: true },
        orderBy: { name: "asc" },
      })
    : [];
  const byRole = new Map<string, { id: string; name: string; avatarUrl: string | null }[]>();
  const roleIdSet = new Set(roleIds);
  for (const u of users) {
    // Mỗi người xuất hiện ở vai trò chính và mọi vai trò bổ sung khớp danh mục.
    const uRoles = new Set([u.roleId, ...u.extraRoleIds].filter((r): r is string => !!r && roleIdSet.has(r)));
    for (const rid of uRoles) {
      const list = byRole.get(rid) ?? [];
      list.push({ id: u.id, name: u.name, avatarUrl: u.avatarUrl });
      byRole.set(rid, list);
    }
  }

  const enriched = items.map((it) => {
    const overrides = (it.dueDateOverrides as Record<string, string> | null) ?? {};
    return {
      id: it.id,
      title: it.title,
      description: it.description,
      cadence: it.cadence,
      module: it.module,
      priority: it.priority,
      dueOffsetDays: it.dueOffsetDays,
      active: it.active,
      source: it.source,
      role: it.role,
      assignees: byRole.get(it.roleId) ?? [],
      occurrences: occurrencesForYear(it.cadence, year, overrides),
    };
  });

  return ok(res, enriched);
}));

// ─── GET /recurring/catalog ──────────────────────────────────────────────────
router.get("/catalog", requireAuth, wrap(async (req, res) => {
  assertPermission(req.user!, "admin", "read");
  return ok(res, RECURRING_CATALOG);
}));

// ─── POST /recurring ────────────────────────────────────────────────────────────
router.post("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "configure");
  const data = upsertSchema.parse(req.body);

  // Đảm bảo role thuộc công ty
  const role = await prisma.role.findFirst({ where: { id: data.roleId, companyId: user.companyId } });
  if (!role) return badRequest(res, "Vai trò không hợp lệ");

  const item = await prisma.recurringWork.create({
    data: { ...data, companyId: user.companyId, source: "custom" },
  });
  return created(res, item);
}));

// ─── PUT /recurring/:id/occurrence ───────────────────────────────────────────
// Ghi đè ngày thực hiện cho một kỳ cụ thể (admin). Gửi date rỗng để xoá override.
const occurrenceSchema = z.object({
  periodKey: z.string().min(1).max(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
});

router.put("/:id/occurrence", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "configure");
  const id = param(req.params["id"]);
  const { periodKey, date } = occurrenceSchema.parse(req.body);

  const existing = await prisma.recurringWork.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) return notFound(res, "Mục công việc định kỳ");

  const overrides = { ...((existing.dueDateOverrides as Record<string, string> | null) ?? {}) };
  if (date === "") delete overrides[periodKey];
  else overrides[periodKey] = date;

  const item = await prisma.recurringWork.update({
    where: { id },
    data: { dueDateOverrides: overrides },
  });
  return ok(res, item);
}));

// ─── PUT /recurring/:id ──────────────────────────────────────────────────────
router.put("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "configure");
  const id = param(req.params["id"]);
  const data = upsertSchema.partial().parse(req.body);

  const existing = await prisma.recurringWork.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) return notFound(res, "Mục công việc định kỳ");

  if (data.roleId) {
    const role = await prisma.role.findFirst({ where: { id: data.roleId, companyId: user.companyId } });
    if (!role) return badRequest(res, "Vai trò không hợp lệ");
  }

  const item = await prisma.recurringWork.update({ where: { id }, data });
  return ok(res, item);
}));

// ─── DELETE /recurring/:id ───────────────────────────────────────────────────
router.delete("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "configure");
  const id = param(req.params["id"]);

  const existing = await prisma.recurringWork.findFirst({ where: { id, companyId: user.companyId } });
  if (!existing) return notFound(res, "Mục công việc định kỳ");

  await prisma.recurringWork.delete({ where: { id } });
  return ok(res, { deleted: true });
}));

// ─── POST /recurring/import-defaults ─────────────────────────────────────────
router.post("/import-defaults", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "configure");
  const count = await importDefaults(user.companyId);
  return ok(res, { imported: count });
}));

// ─── POST /recurring/generate ────────────────────────────────────────────────
router.post("/generate", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "configure");
  const created = await generateDueForCompany(user.companyId);
  return ok(res, { created });
}));

export default router;
