// src/modules/hr/hr.router.ts
// Module Quản trị Nhân sự (HR) — Giai đoạn 1: tổ chức + hồ sơ nhân viên.
// Employee là thực thể GỐC, tách khỏi User; ký HĐ/đủ điều kiện → cấp tài khoản theo vị trí.
// Xem docs/quan-ly-nhan-su.md.
//
//  GET    /hr/stats                          — KPI: tổng NV theo trạng thái, số phòng ban/vị trí
//  GET    /hr/departments                    — danh sách phòng ban
//  POST   /hr/departments                    — tạo phòng ban
//  PATCH  /hr/departments/:id                — sửa
//  DELETE /hr/departments/:id                — xóa
//  GET    /hr/positions?departmentId=        — danh sách vị trí
//  POST   /hr/positions                      — tạo vị trí (gắn role mặc định)
//  PATCH  /hr/positions/:id                  — sửa
//  DELETE /hr/positions/:id                  — xóa
//  GET    /hr/employees?departmentId=&status=&q=&page=&limit=  — danh sách nhân viên
//  GET    /hr/employees/:id                  — chi tiết
//  POST   /hr/employees                      — tạo hồ sơ nhân viên
//  PATCH  /hr/employees/:id                  — cập nhật (resigned/terminated → vô hiệu hóa tài khoản)
//  DELETE /hr/employees/:id                  — xóa hồ sơ
//  POST   /hr/employees/:id/provision-user   — cấp tài khoản User (role theo vị trí)
//  GET    /hr/role-options                   — role công ty (để chọn role mặc định / cấp tài khoản)

import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@vsme/db/client";
import type { EmployeeStatus, Gender, CandidateStatus, PayrollStatus } from "@vsme/db";
import { requireAuth } from "../../middleware/auth.js";
import { ok, created, notFound, badRequest, forbidden, noContent, conflict, wrap } from "../../lib/response.js";
import { hasPermission } from "../../lib/rbac.js";
import { qs, qi, param } from "../../lib/query.js";
import { computePayroll } from "../../lib/payroll.js";

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const deptSchema = z.object({
  name:        z.string().min(1).max(200),
  code:        z.string().max(50).optional(),
  parentId:    z.string().uuid().nullable().optional(),
  managerId:   z.string().uuid().nullable().optional(),
  description: z.string().max(2000).optional(),
});

const positionSchema = z.object({
  title:         z.string().min(1).max(200),
  code:          z.string().max(50).optional(),
  departmentId:  z.string().uuid().nullable().optional(),
  description:   z.string().max(8000).optional(),
  defaultRoleId: z.string().uuid().nullable().optional(),
  level:         z.string().max(20).optional(),
  headcount:     z.number().int().min(0).nullable().optional(),
});

const empStatus = z.enum(["probation", "active", "on_leave", "resigned", "terminated"]);
const employeeSchema = z.object({
  employeeCode: z.string().max(50).optional(),
  fullName:     z.string().min(2).max(200),
  email:        z.string().email().nullable().optional(),
  phone:        z.string().max(30).nullable().optional(),
  gender:       z.enum(["male", "female", "other"]).nullable().optional(),
  dob:          z.string().nullable().optional(),
  address:      z.string().max(500).nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  positionId:   z.string().uuid().nullable().optional(),
  managerId:    z.string().uuid().nullable().optional(),
  status:       empStatus.optional(),
  hireDate:     z.string().nullable().optional(),
  resignDate:   z.string().nullable().optional(),
  note:         z.string().max(2000).nullable().optional(),
  // Lương & đãi ngộ (dùng cho tính lương) — TRƯỚC ĐÂY BỊ THIẾU → lương luôn = 0.
  baseSalary:      z.number().nonnegative().optional(),
  allowance:       z.number().nonnegative().optional(),
  dependents:      z.number().int().min(0).optional(),
  insuranceSalary: z.number().nonnegative().nullable().optional(),
});

const provisionSchema = z.object({
  email:    z.string().email().optional(),     // mặc định lấy employee.email
  roleId:   z.string().uuid().nullable().optional(), // mặc định = position.defaultRoleId
  password: z.string().min(8).optional(),       // nếu trống → sinh tạm
});

const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);

// ─── Stats ───────────────────────────────────────────────────────────────────

router.get("/stats", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "read")) return forbidden(res);
  const where = { companyId: user.companyId };
  const [byStatus, deptCount, posCount, linked] = await Promise.all([
    prisma.employee.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.department.count({ where }),
    prisma.position.count({ where }),
    prisma.employee.count({ where: { ...where, userId: { not: null } } }),
  ]);
  const counts: Record<string, number> = {};
  for (const g of byStatus) counts[g.status] = g._count._all;
  const total = byStatus.reduce((s, g) => s + g._count._all, 0);
  return ok(res, { total, byStatus: counts, departments: deptCount, positions: posCount, withAccount: linked });
}));

// ─── Role options (cho dropdown role mặc định / cấp tài khoản) ──────────────────

router.get("/role-options", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "read")) return forbidden(res);
  const roles = await prisma.role.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true, level: true },
    orderBy: { level: "asc" },
  });
  return ok(res, roles);
}));

// ═══ DEPARTMENTS ═══════════════════════════════════════════════════════════════

router.get("/departments", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "read")) return forbidden(res);
  const rows = await prisma.department.findMany({
    where: { companyId: user.companyId },
    include: { _count: { select: { employees: true, positions: true } } },
    orderBy: { name: "asc" },
  });
  return ok(res, rows);
}));

router.post("/departments", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "write")) return forbidden(res);
  const data = deptSchema.parse(req.body);
  const row = await prisma.department.create({
    data: {
      companyId: user.companyId,
      name: data.name, code: data.code ?? null,
      parentId: data.parentId ?? null, managerId: data.managerId ?? null,
      description: data.description ?? null,
    },
  });
  return created(res, row);
}));

router.patch("/departments/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.department.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Phòng ban");
  const data = deptSchema.partial().parse(req.body);
  const row = await prisma.department.update({ where: { id }, data });
  return ok(res, row);
}));

router.delete("/departments/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "delete")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.department.findFirst({
    where: { id, companyId: user.companyId },
    include: { _count: { select: { employees: true } } },
  });
  if (!found) return notFound(res, "Phòng ban");
  if (found._count.employees > 0) return conflict(res, "Phòng ban còn nhân viên, không thể xóa");
  await prisma.department.delete({ where: { id } });
  return noContent(res);
}));

// ═══ POSITIONS ═════════════════════════════════════════════════════════════════

router.get("/positions", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "read")) return forbidden(res);
  const departmentId = qs(req.query["departmentId"]);
  const rows = await prisma.position.findMany({
    where: { companyId: user.companyId, ...(departmentId ? { departmentId } : {}) },
    include: { department: { select: { id: true, name: true } }, _count: { select: { employees: true } } },
    orderBy: { title: "asc" },
  });
  return ok(res, rows);
}));

router.post("/positions", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "write")) return forbidden(res);
  const data = positionSchema.parse(req.body);
  const row = await prisma.position.create({
    data: {
      companyId: user.companyId,
      title: data.title, code: data.code ?? null,
      departmentId: data.departmentId ?? null,
      description: data.description ?? null,
      defaultRoleId: data.defaultRoleId ?? null,
      level: data.level ?? null, headcount: data.headcount ?? null,
    },
  });
  return created(res, row);
}));

router.patch("/positions/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.position.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Vị trí");
  const data = positionSchema.partial().parse(req.body);
  const row = await prisma.position.update({ where: { id }, data });
  return ok(res, row);
}));

router.delete("/positions/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "delete")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.position.findFirst({
    where: { id, companyId: user.companyId },
    include: { _count: { select: { employees: true } } },
  });
  if (!found) return notFound(res, "Vị trí");
  if (found._count.employees > 0) return conflict(res, "Vị trí còn nhân viên, không thể xóa");
  await prisma.position.delete({ where: { id } });
  return noContent(res);
}));

// ═══ EMPLOYEES ═════════════════════════════════════════════════════════════════

const employeeInclude = {
  department: { select: { id: true, name: true } },
  position:   { select: { id: true, title: true, defaultRoleId: true } },
  manager:    { select: { id: true, fullName: true } },
  user:       { select: { id: true, email: true, isActive: true, role: { select: { name: true } } } },
} as const;

router.get("/employees", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "read")) return forbidden(res);
  const departmentId = qs(req.query["departmentId"]);
  const status       = qs(req.query["status"]);
  const q            = qs(req.query["q"]);
  const page  = Math.max(1, qi(req.query["page"], 1));
  const limit = Math.min(100, qi(req.query["limit"], 50));

  const where = {
    companyId: user.companyId,
    ...(departmentId ? { departmentId } : {}),
    ...(status ? { status: status as EmployeeStatus } : {}),
    ...(q ? { OR: [
      { fullName: { contains: q, mode: "insensitive" as const } },
      { employeeCode: { contains: q, mode: "insensitive" as const } },
      { email: { contains: q, mode: "insensitive" as const } },
    ] } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where, include: employeeInclude,
      orderBy: [{ status: "asc" }, { fullName: "asc" }],
      skip: (page - 1) * limit, take: limit,
    }),
  ]);
  return ok(res, rows, { total, page, limit });
}));

router.get("/employees/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "read")) return forbidden(res);
  const id = param(req.params["id"]);
  const row = await prisma.employee.findFirst({
    where: { id, companyId: user.companyId },
    include: { ...employeeInclude, reports: { select: { id: true, fullName: true } } },
  });
  if (!row) return notFound(res, "Nhân viên");
  return ok(res, row);
}));

// Sinh mã NV tự động: NV0001, NV0002...
async function nextEmployeeCode(companyId: string): Promise<string> {
  const count = await prisma.employee.count({ where: { companyId } });
  return `NV${String(count + 1).padStart(4, "0")}`;
}

router.post("/employees", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "write")) return forbidden(res);
  const data = employeeSchema.parse(req.body);
  const code = data.employeeCode?.trim() || (await nextEmployeeCode(user.companyId));

  const dup = await prisma.employee.findFirst({ where: { companyId: user.companyId, employeeCode: code } });
  if (dup) return conflict(res, `Mã nhân viên "${code}" đã tồn tại`);

  const row = await prisma.employee.create({
    data: {
      companyId:    user.companyId,
      employeeCode: code,
      fullName:     data.fullName,
      email:        data.email ?? null,
      phone:        data.phone ?? null,
      gender:       (data.gender ?? null) as Gender | null,
      dob:          toDate(data.dob),
      address:      data.address ?? null,
      departmentId: data.departmentId ?? null,
      positionId:   data.positionId ?? null,
      managerId:    data.managerId ?? null,
      status:       (data.status ?? "probation") as EmployeeStatus,
      hireDate:     toDate(data.hireDate),
      resignDate:   toDate(data.resignDate),
      note:         data.note ?? null,
      baseSalary:      data.baseSalary ?? 0,
      allowance:       data.allowance ?? 0,
      dependents:      data.dependents ?? 0,
      insuranceSalary: data.insuranceSalary ?? null,
    },
    include: employeeInclude,
  });
  return created(res, row);
}));

router.patch("/employees/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.employee.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Nhân viên");
  const data = employeeSchema.partial().parse(req.body);

  const row = await prisma.employee.update({
    where: { id },
    data: {
      ...(data.employeeCode !== undefined ? { employeeCode: data.employeeCode } : {}),
      ...(data.fullName     !== undefined ? { fullName: data.fullName } : {}),
      ...(data.email        !== undefined ? { email: data.email } : {}),
      ...(data.phone        !== undefined ? { phone: data.phone } : {}),
      ...(data.gender       !== undefined ? { gender: (data.gender ?? null) as Gender | null } : {}),
      ...(data.dob          !== undefined ? { dob: toDate(data.dob) } : {}),
      ...(data.address      !== undefined ? { address: data.address } : {}),
      ...(data.departmentId !== undefined ? { departmentId: data.departmentId } : {}),
      ...(data.positionId   !== undefined ? { positionId: data.positionId } : {}),
      ...(data.managerId    !== undefined ? { managerId: data.managerId } : {}),
      ...(data.status       !== undefined ? { status: data.status as EmployeeStatus } : {}),
      ...(data.hireDate     !== undefined ? { hireDate: toDate(data.hireDate) } : {}),
      ...(data.resignDate   !== undefined ? { resignDate: toDate(data.resignDate) } : {}),
      ...(data.note         !== undefined ? { note: data.note } : {}),
      ...(data.baseSalary      !== undefined ? { baseSalary: data.baseSalary } : {}),
      ...(data.allowance       !== undefined ? { allowance: data.allowance } : {}),
      ...(data.dependents      !== undefined ? { dependents: data.dependents } : {}),
      ...(data.insuranceSalary !== undefined ? { insuranceSalary: data.insuranceSalary } : {}),
    },
    include: employeeInclude,
  });

  // Nghỉ việc/chấm dứt → vô hiệu hóa tài khoản hệ thống liên kết (nếu có).
  if ((data.status === "resigned" || data.status === "terminated") && found.userId) {
    await prisma.user.update({ where: { id: found.userId }, data: { isActive: false } }).catch(() => {});
  }
  return ok(res, row);
}));

router.delete("/employees/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "delete")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.employee.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Nhân viên");
  await prisma.employee.delete({ where: { id } });
  return noContent(res);
}));

// ─── Cấp tài khoản User cho nhân viên (theo vị trí) ─────────────────────────────
// Điểm nối HR → IAM: ký HĐ/đủ điều kiện mới cấp tài khoản. Role mặc định = vị trí.

router.post("/employees/:id/provision-user", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const emp = await prisma.employee.findFirst({
    where: { id, companyId: user.companyId },
    include: { position: { select: { defaultRoleId: true } }, manager: { select: { userId: true } } },
  });
  if (!emp) return notFound(res, "Nhân viên");
  if (emp.userId) return conflict(res, "Nhân viên đã có tài khoản");
  if (emp.status === "resigned" || emp.status === "terminated") return badRequest(res, "Không cấp tài khoản cho nhân viên đã nghỉ");

  const body = provisionSchema.parse(req.body ?? {});
  const email = (body.email ?? emp.email ?? "").trim().toLowerCase();
  if (!email) return badRequest(res, "Cần email để cấp tài khoản");

  const exists = await prisma.user.findFirst({ where: { companyId: user.companyId, email } });
  if (exists) return conflict(res, "Email đã được dùng cho tài khoản khác");

  const roleId = body.roleId ?? emp.position?.defaultRoleId ?? null;
  // Role phải thuộc công ty (chống gán role chéo tenant → leo quyền).
  if (roleId) {
    const role = await prisma.role.findFirst({ where: { id: roleId, companyId: user.companyId }, select: { id: true } });
    if (!role) return badRequest(res, "Vai trò không hợp lệ");
  }
  const tempPassword = body.password ?? `Vsme@${Math.floor(100000 + Math.random() * 900000)}`;
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const created_ = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        companyId: user.companyId,
        email, name: emp.fullName, passwordHash,
        roleId, phone: emp.phone ?? undefined,
        managerId: emp.manager?.userId ?? null,
        accountType: "user",
      },
      select: { id: true, email: true },
    });
    await tx.employee.update({ where: { id: emp.id }, data: { userId: u.id } });
    return u;
  });

  // Trả mật khẩu tạm 1 lần để HR bàn giao (không lưu plaintext).
  return created(res, { userId: created_.id, email: created_.email, tempPassword: body.password ? undefined : tempPassword });
}));

// ═══ RECRUITMENT — TUYỂN DỤNG ══════════════════════════════════════════════════

const candidateSchema = z.object({
  fullName:       z.string().min(2).max(200),
  email:          z.string().email().nullable().optional(),
  phone:          z.string().max(30).nullable().optional(),
  positionId:     z.string().uuid().nullable().optional(),
  departmentId:   z.string().uuid().nullable().optional(),
  source:         z.string().max(100).nullable().optional(),
  expectedSalary: z.number().nonnegative().nullable().optional(),
  status:         z.enum(["applied", "screening", "interview", "offer", "hired", "rejected"]).optional(),
  note:           z.string().max(2000).nullable().optional(),
});

router.get("/candidates", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "read")) return forbidden(res);
  const status = qs(req.query["status"]);
  const q = qs(req.query["q"]);
  const rows = await prisma.candidate.findMany({
    where: {
      companyId: user.companyId,
      ...(status ? { status: status as CandidateStatus } : {}),
      ...(q ? { OR: [
        { fullName: { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } },
      ] } : {}),
    },
    include: { position: { select: { id: true, title: true } } },
    orderBy: { appliedAt: "desc" },
  });
  return ok(res, rows);
}));

router.post("/candidates", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "write")) return forbidden(res);
  const d = candidateSchema.parse(req.body);
  const row = await prisma.candidate.create({
    data: {
      companyId: user.companyId, fullName: d.fullName,
      email: d.email ?? null, phone: d.phone ?? null,
      positionId: d.positionId ?? null, departmentId: d.departmentId ?? null,
      source: d.source ?? null, expectedSalary: d.expectedSalary ?? null,
      status: (d.status ?? "applied") as CandidateStatus, note: d.note ?? null,
    },
  });
  return created(res, row);
}));

router.patch("/candidates/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.candidate.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Ứng viên");
  const d = candidateSchema.partial().parse(req.body);
  const row = await prisma.candidate.update({
    where: { id },
    data: {
      ...(d.fullName !== undefined ? { fullName: d.fullName } : {}),
      ...(d.email !== undefined ? { email: d.email } : {}),
      ...(d.phone !== undefined ? { phone: d.phone } : {}),
      ...(d.positionId !== undefined ? { positionId: d.positionId } : {}),
      ...(d.departmentId !== undefined ? { departmentId: d.departmentId } : {}),
      ...(d.source !== undefined ? { source: d.source } : {}),
      ...(d.expectedSalary !== undefined ? { expectedSalary: d.expectedSalary } : {}),
      ...(d.status !== undefined ? { status: d.status as CandidateStatus } : {}),
      ...(d.note !== undefined ? { note: d.note } : {}),
    },
  });
  return ok(res, row);
}));

router.delete("/candidates/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "delete")) return forbidden(res);
  const id = param(req.params["id"]);
  const found = await prisma.candidate.findFirst({ where: { id, companyId: user.companyId } });
  if (!found) return notFound(res, "Ứng viên");
  await prisma.candidate.delete({ where: { id } });
  return noContent(res);
}));

// Tuyển ứng viên → tạo hồ sơ Employee (điểm nối tuyển dụng → nhân sự).
const hireSchema = z.object({
  employeeCode: z.string().max(50).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  positionId:   z.string().uuid().nullable().optional(),
  baseSalary:   z.number().nonnegative().optional(),
  hireDate:     z.string().nullable().optional(),
});

router.post("/candidates/:id/hire", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const cand = await prisma.candidate.findFirst({ where: { id, companyId: user.companyId } });
  if (!cand) return notFound(res, "Ứng viên");
  if (cand.employeeId) return conflict(res, "Ứng viên đã được tuyển");
  const d = hireSchema.parse(req.body ?? {});
  const code = d.employeeCode?.trim() || (await nextEmployeeCode(user.companyId));
  const dup = await prisma.employee.findFirst({ where: { companyId: user.companyId, employeeCode: code } });
  if (dup) return conflict(res, `Mã nhân viên "${code}" đã tồn tại`);

  const emp = await prisma.$transaction(async (tx) => {
    const e = await tx.employee.create({
      data: {
        companyId: user.companyId, employeeCode: code, fullName: cand.fullName,
        email: cand.email, phone: cand.phone,
        departmentId: d.departmentId ?? cand.departmentId ?? null,
        positionId: d.positionId ?? cand.positionId ?? null,
        baseSalary: d.baseSalary ?? 0,
        status: "probation", hireDate: d.hireDate ? new Date(d.hireDate) : new Date(),
      },
      include: employeeInclude,
    });
    await tx.candidate.update({ where: { id }, data: { status: "hired", employeeId: e.id } });
    return e;
  });
  return created(res, emp);
}));

// ═══ PAYROLL — TÍNH LƯƠNG ═══════════════════════════════════════════════════════

const num = (v: unknown): number => (v == null ? 0 : Number(v));

router.get("/payroll", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "read")) return forbidden(res);
  const periods = await prisma.payrollPeriod.findMany({
    where: { companyId: user.companyId },
    include: { _count: { select: { items: true } }, items: { select: { netSalary: true, companyCost: true } } },
    orderBy: { month: "desc" },
  });
  const rows = periods.map((p) => ({
    id: p.id, month: p.month, status: p.status, note: p.note, paidDate: p.paidDate,
    count: p._count.items,
    totalNet: p.items.reduce((s, i) => s + num(i.netSalary), 0),
    totalCost: p.items.reduce((s, i) => s + num(i.companyCost), 0),
  }));
  return ok(res, rows);
}));

const monthSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), note: z.string().max(500).optional() });

router.post("/payroll", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "write")) return forbidden(res);
  const d = monthSchema.parse(req.body);
  const exists = await prisma.payrollPeriod.findFirst({ where: { companyId: user.companyId, month: d.month } });
  if (exists) return conflict(res, `Đã có bảng lương tháng ${d.month}`);
  const row = await prisma.payrollPeriod.create({
    data: { companyId: user.companyId, month: d.month, note: d.note ?? null, createdBy: user.id },
  });
  return created(res, row);
}));

// Sinh dòng lương từ nhân viên đang làm việc (probation/active/on_leave). Chỉ khi draft.
router.post("/payroll/:id/generate", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "write")) return forbidden(res);
  const id = param(req.params["id"]);
  const period = await prisma.payrollPeriod.findFirst({ where: { id, companyId: user.companyId } });
  if (!period) return notFound(res, "Bảng lương");
  if (period.status !== "draft") return badRequest(res, "Chỉ sinh lại được khi bảng đang nháp");

  const emps = await prisma.employee.findMany({
    where: { companyId: user.companyId, status: { in: ["probation", "active", "on_leave"] } },
    select: { id: true, baseSalary: true, allowance: true, dependents: true, insuranceSalary: true },
  });

  await prisma.$transaction([
    prisma.payrollItem.deleteMany({ where: { periodId: id } }),
    ...emps.map((e) => {
      const r = computePayroll({
        baseSalary: num(e.baseSalary), allowance: num(e.allowance),
        dependents: e.dependents, insuranceSalary: e.insuranceSalary == null ? null : num(e.insuranceSalary),
      });
      return prisma.payrollItem.create({
        data: {
          periodId: id, employeeId: e.id,
          baseSalary: num(e.baseSalary), allowance: num(e.allowance), otherDeduction: 0,
          grossSalary: r.grossSalary, insuranceBase: r.insuranceBase,
          insuranceEmployee: r.insuranceEmployee, insuranceEmployer: r.insuranceEmployer,
          dependents: e.dependents, taxableIncome: r.taxableIncome, pit: r.pit,
          netSalary: r.netSalary, companyCost: r.companyCost,
        },
      });
    }),
  ]);
  return ok(res, { generated: emps.length });
}));

router.get("/payroll/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "read")) return forbidden(res);
  const id = param(req.params["id"]);
  const period = await prisma.payrollPeriod.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      items: {
        include: { employee: { select: { id: true, fullName: true, employeeCode: true } } },
        orderBy: { employee: { fullName: "asc" } },
      },
    },
  });
  if (!period) return notFound(res, "Bảng lương");
  return ok(res, period);
}));

const periodUpdateSchema = z.object({
  status: z.enum(["draft", "approved", "paid"]).optional(),
  note:   z.string().max(500).nullable().optional(),
});

router.patch("/payroll/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "approve")) return forbidden(res);
  const id = param(req.params["id"]);
  const period = await prisma.payrollPeriod.findFirst({ where: { id, companyId: user.companyId } });
  if (!period) return notFound(res, "Bảng lương");
  if (period.status === "paid") return badRequest(res, "Bảng lương đã chi, không thể thay đổi trạng thái");
  if (period.status === "approved") return badRequest(res, "Bảng lương đã duyệt. Để hủy duyệt, liên hệ quản trị viên");
  const d = periodUpdateSchema.parse(req.body);
  const row = await prisma.payrollPeriod.update({
    where: { id },
    data: {
      ...(d.status !== undefined ? { status: d.status as PayrollStatus, paidDate: d.status === "paid" ? new Date() : period.paidDate } : {}),
      ...(d.note !== undefined ? { note: d.note } : {}),
    },
  });
  return ok(res, row);
}));

router.delete("/payroll/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "delete")) return forbidden(res);
  const id = param(req.params["id"]);
  const period = await prisma.payrollPeriod.findFirst({ where: { id, companyId: user.companyId } });
  if (!period) return notFound(res, "Bảng lương");
  if (period.status === "paid") return conflict(res, "Bảng lương đã chi, không thể xóa");
  await prisma.payrollPeriod.delete({ where: { id } });
  return noContent(res);
}));

// Điều chỉnh 1 dòng lương (phụ cấp / khấu trừ khác) → tính lại. Chỉ khi draft.
const itemAdjustSchema = z.object({
  allowance:      z.number().nonnegative().optional(),
  otherDeduction: z.number().nonnegative().optional(),
});

router.patch("/payroll/items/:itemId", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "write")) return forbidden(res);
  const itemId = param(req.params["itemId"]);
  const item = await prisma.payrollItem.findFirst({
    where: { id: itemId, period: { companyId: user.companyId } },
    include: { period: { select: { status: true } } },
  });
  if (!item) return notFound(res, "Dòng lương");
  if (item.period.status !== "draft") return badRequest(res, "Chỉ sửa được khi bảng đang nháp");
  const d = itemAdjustSchema.parse(req.body);
  const allowance = d.allowance ?? num(item.allowance);
  const otherDeduction = d.otherDeduction ?? num(item.otherDeduction);
  const r = computePayroll({
    baseSalary: num(item.baseSalary), allowance, otherDeduction,
    dependents: item.dependents, insuranceSalary: num(item.insuranceBase),
  });
  const row = await prisma.payrollItem.update({
    where: { id: itemId },
    data: {
      allowance, otherDeduction, grossSalary: r.grossSalary,
      insuranceEmployee: r.insuranceEmployee, insuranceEmployer: r.insuranceEmployer,
      taxableIncome: r.taxableIncome, pit: r.pit, netSalary: r.netSalary, companyCost: r.companyCost,
    },
  });
  return ok(res, row);
}));

// ─── Dự báo dòng tiền lương (cho màn Dòng tiền): dự kiến + thật theo tháng ──────

router.get("/payroll-forecast", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPermission(user, "hr", "read")) return forbidden(res);
  const months = Math.min(24, Math.max(1, qi(req.query["months"], 12)));

  // Thật: các bảng lương đã chi → companyCost theo tháng.
  const paid = await prisma.payrollPeriod.findMany({
    where: { companyId: user.companyId, status: "paid" },
    include: { items: { select: { companyCost: true } } },
  });
  const actual = paid.map((p) => ({ month: p.month, amount: p.items.reduce((s, i) => s + num(i.companyCost), 0) }));
  const paidMonths = new Set(actual.map((a) => a.month));

  // Dự kiến: chi phí lương 1 tháng từ nhân viên đang làm việc.
  const emps = await prisma.employee.findMany({
    where: { companyId: user.companyId, status: { in: ["probation", "active", "on_leave"] } },
    select: { baseSalary: true, allowance: true, dependents: true, insuranceSalary: true },
  });
  const monthlyProjected = emps.reduce((s, e) => s + computePayroll({
    baseSalary: num(e.baseSalary), allowance: num(e.allowance),
    dependents: e.dependents, insuranceSalary: e.insuranceSalary == null ? null : num(e.insuranceSalary),
  }).companyCost, 0);

  // Sinh danh sách tháng tương lai (từ tháng hiện tại) chưa có bảng đã chi.
  const now = new Date();
  const projected: { month: string; amount: number }[] = [];
  for (let i = 0; i < months; i++) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const m = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!paidMonths.has(m)) projected.push({ month: m, amount: monthlyProjected });
  }

  return ok(res, { headcount: emps.length, monthlyProjected, actual, projected });
}));

export default router;
