// src/modules/roles/roles.router.ts
// GET  /roles               — danh sách roles
// GET  /roles/:id/permissions — permissions của role
// PUT  /roles/:id/permissions — cập nhật permissions

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import { requireAuth } from "../../middleware/auth.js";
import { ok, notFound, wrap } from "../../lib/response.js";
import { assertPermission, getCompanyScope } from "../../lib/rbac.js";
import { qs, param } from "../../lib/query.js";

const router = Router();

// ─── GET /roles ───────────────────────────────────────────────────────────────

router.get("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "read");

  const companyId = getCompanyScope(user, qs(req.query["companyId"]));

  const roles = await prisma.role.findMany({
    where: { companyId },
    select: {
      id: true, name: true, level: true, description: true,
      isSystem: true, isDefault: true,
      _count: { select: { users: true } },
    },
    orderBy: { level: "asc" },
  });

  return ok(res, roles);
}));

// ─── GET /roles/:id/permissions ───────────────────────────────────────────────

router.get("/:id/permissions", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "read");

  const role = await prisma.role.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId },
    include: {
      permissions: {
        include: { permission: true },
        orderBy: { permission: { moduleKey: "asc" } },
      },
    },
  });

  if (!role) return notFound(res, "Role");
  return ok(res, role);
}));

// ─── PUT /roles/:id/permissions ───────────────────────────────────────────────

// UI gửi { modules: { moduleKey: actions[] } } (không biết UUID của Permission),
// backend tự ánh xạ (moduleKey, action) → tất cả Permission rows khớp (mọi scope).
const updatePermissionsSchema = z.object({
  modules: z.record(z.string(), z.array(z.string())),
});

router.put("/:id/permissions", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "write");

  const role = await prisma.role.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId },
  });
  if (!role) return notFound(res, "Role");

  const { modules } = updatePermissionsSchema.parse(req.body);

  // Ánh xạ (moduleKey, action) → permissionId. Cấp ở mọi scope cho action được chọn
  // (scope company là rộng nhất nên bao trùm self/team/dept khi kiểm tra runtime).
  const allPerms = await prisma.permission.findMany({
    select: { id: true, moduleKey: true, action: true },
  });
  const permissionIds: string[] = [];
  for (const [moduleKey, actions] of Object.entries(modules)) {
    const actionSet = new Set(actions);
    for (const p of allPerms) {
      if (p.moduleKey === moduleKey && actionSet.has(p.action)) permissionIds.push(p.id);
    }
  }

  // Transaction: xoá cũ, thêm mới
  const updated = await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });

    if (permissionIds.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionIds.map(permissionId => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
    }

    return tx.role.findUnique({
      where: { id: role.id },
      include: {
        permissions: {
          include: { permission: true },
          orderBy: { permission: { moduleKey: "asc" } },
        },
      },
    });
  });

  return ok(res, updated);
}));

export default router;
