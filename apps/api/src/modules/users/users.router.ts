// src/modules/users/users.router.ts
// GET  /users         — danh sách users (admin)
// POST /users         — tạo user mới (admin)
// GET  /users/:id     — chi tiết user
// PATCH /users/:id    — cập nhật user
// DELETE /users/:id   — vô hiệu hoá user

import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import { AuditAction } from "@vsme/db";
import { writeAuditLog } from "@vsme/audit/audit-log";
import { requireAuth, invalidateExtraRoles } from "../../middleware/auth.js";
import {
  ok, created, noContent, unauthorized, notFound, conflict, badRequest, wrap,
  serverError,
} from "../../lib/response.js";
import { assertPermission, getCompanyScope } from "../../lib/rbac.js";
import { qs, qi, param } from "../../lib/query.js";
import { wouldCreateCycle, getManagerChain, getDirectReports } from "../../lib/hierarchy.js";

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createUserSchema = z.object({
  email:        z.string().email("Email không hợp lệ"),
  name:         z.string().min(2, "Tên tối thiểu 2 ký tự"),
  password:     z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
  roleId:       z.string().uuid().optional(),
  extraRoleIds: z.array(z.string().uuid()).optional(),
  departmentId: z.string().optional(),
  managerId:    z.string().uuid().nullable().optional(),
  phone:        z.string().optional(),
});

const updateUserSchema = z.object({
  name:         z.string().min(2).optional(),
  phone:        z.string().optional(),
  roleId:       z.string().uuid().nullable().optional(),
  extraRoleIds: z.array(z.string().uuid()).optional(),
  departmentId: z.string().nullable().optional(),
  managerId:    z.string().uuid().nullable().optional(),
  isActive:     z.boolean().optional(),
  avatarUrl:    z.string().url().nullable().optional(),
});

/** Cấp trên phải cùng công ty, đang hoạt động, không trùng chính mình, không tạo vòng lặp. */
async function validateManager(
  companyId: string,
  targetUserId: string | null,
  managerId: string,
): Promise<string | null> {
  const mgr = await prisma.user.findFirst({
    where: { id: managerId, companyId, isActive: true },
    select: { id: true },
  });
  if (!mgr) return "Cấp trên không hợp lệ (không tồn tại / khác công ty / đã vô hiệu hoá)";
  if (targetUserId) {
    if (targetUserId === managerId) return "Không thể đặt chính mình làm cấp trên";
    if (await wouldCreateCycle(companyId, targetUserId, managerId))
      return "Quan hệ này tạo vòng lặp trong cây tổ chức";
  }
  return null;
}

// ─── GET /users ───────────────────────────────────────────────────────────────

router.get("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "read");

  const page      = qi(req.query["page"], 1);
  const limit     = Math.min(qi(req.query["limit"], 20), 100);
  const search    = qs(req.query["search"]);
  const companyId = getCompanyScope(user, qs(req.query["companyId"]));

  const where = {
    companyId,
    isActive: true,
    accountType: { not: "system_admin" as const },
    ...(search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true, email: true, name: true, phone: true,
        avatarUrl: true, isActive: true, isSuperAdmin: true,
        lastLoginAt: true, createdAt: true, accountType: true,
        role: { select: { id: true, name: true, level: true } },
        managerId: true,
        manager: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return ok(res, users, { total, page, limit });
}));

// ─── POST /users ──────────────────────────────────────────────────────────────

router.post("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "write");

  const data = createUserSchema.parse(req.body);

  const existing = await prisma.user.findUnique({
    where: { companyId_email: { companyId: user.companyId, email: data.email } },
  });
  if (existing) return conflict(res, "Email đã tồn tại trong công ty");

  if (data.managerId) {
    const err = await validateManager(user.companyId, null, data.managerId);
    if (err) return badRequest(res, err);
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const created_ = await prisma.user.create({
    data: {
      companyId:    user.companyId,
      email:        data.email,
      name:         data.name,
      passwordHash,
      roleId:       data.roleId,
      extraRoleIds: data.extraRoleIds ?? [],
      departmentId: data.departmentId,
      managerId:    data.managerId ?? null,
      phone:        data.phone,
    },
    select: {
      id: true, email: true, name: true, createdAt: true,
      role: { select: { id: true, name: true } },
    },
  });

  await writeAuditLog({
    context: {
      companyId:  user.companyId,
      userId:     user.id,
      moduleKey:  "admin",
      ipAddress:  req.ip,
    },
    action:     AuditAction.create,
    entityType: "User",
    entityId:   created_.id,
    dataAfter:  { email: created_.email, name: created_.name },
  });

  return created(res, created_);
}));

// ─── GET /users/:id ───────────────────────────────────────────────────────────

router.get("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "read");

  const target = await prisma.user.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId },
    select: {
      id: true, email: true, name: true, phone: true, avatarUrl: true,
      isActive: true, isSuperAdmin: true, lastLoginAt: true, createdAt: true,
      accountType: true,
      role:       { select: { id: true, name: true, level: true } },
      extraRoleIds: true,
      departmentId: true,
      managerId:  true,
      manager:    { select: { id: true, name: true, email: true, role: { select: { name: true, level: true } } } },
    },
  });

  if (!target) return notFound(res, "User");
  const reports = await getDirectReports(user.companyId, target.id);
  return ok(res, { ...target, reports });
}));

// ─── GET /users/:id/chain ─── chuỗi cấp trên (dùng cho trình ký / báo cáo lên trên)

router.get("/:id/chain", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "read");
  const target = await prisma.user.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId },
    select: { id: true },
  });
  if (!target) return notFound(res, "User");
  const chain = await getManagerChain(user.companyId, target.id);
  return ok(res, chain);
}));

// ─── PATCH /users/:id ────────────────────────────────────────────────────────

router.patch("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "write");

  const data = updateUserSchema.parse(req.body);

  const target = await prisma.user.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId },
  });
  if (!target) return notFound(res, "User");

  if (data.managerId) {
    const err = await validateManager(user.companyId, target.id, data.managerId);
    if (err) return badRequest(res, err);
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      ...(data.name         !== undefined ? { name:         data.name }         : {}),
      ...(data.phone        !== undefined ? { phone:        data.phone }        : {}),
      ...(data.roleId       !== undefined ? { roleId:       data.roleId }       : {}),
      ...(data.extraRoleIds !== undefined ? { extraRoleIds: data.extraRoleIds } : {}),
      ...(data.departmentId !== undefined ? { departmentId: data.departmentId } : {}),
      ...(data.managerId    !== undefined ? { managerId:    data.managerId }    : {}),
      ...(data.isActive     !== undefined ? { isActive:     data.isActive }     : {}),
      ...(data.avatarUrl    !== undefined ? { avatarUrl:    data.avatarUrl }    : {}),
    },
    select: { id: true, email: true, name: true, isActive: true, updatedAt: true },
  });

  if (data.extraRoleIds !== undefined) invalidateExtraRoles(target.id);

  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "admin", ipAddress: req.ip },
    action:     AuditAction.update,
    entityType: "User",
    entityId:   updated.id,
    dataBefore: { name: target.name, isActive: target.isActive },
    dataAfter:  data,
  });

  return ok(res, updated);
}));

// ─── DELETE /users/:id (soft delete) ─────────────────────────────────────────

router.delete("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "write");

  const target = await prisma.user.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId },
  });
  if (!target) return notFound(res, "User");
  if (target.id === user.id) return badRequest(res, "Không thể xoá chính mình");

  await prisma.user.update({ where: { id: target.id }, data: { isActive: false } });

  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "admin", ipAddress: req.ip },
    action:     AuditAction.delete,
    entityType: "User",
    entityId:   target.id,
    dataBefore: { email: target.email },
  });

  return noContent(res);
}));

export default router;
