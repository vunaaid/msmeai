// packages/db/src/provisioning.ts
// Cấu hình mặc định khi khởi tạo công ty: roles + permissions + modules + việc định kỳ.
// Dùng chung cho seed (công ty mặc định) và luồng tạo công ty mới (wizard onboarding).

import type { PrismaClient } from "../generated/client";
import { RoleLevel, PermissionAction, PermissionScope } from "../generated/client";
import { RECURRING_CATALOG } from "./recurring-catalog.js";

// Tất cả module (gồm work + documents — 2 module mặc định bật cho mọi công ty).
export const ALL_MODULES = [
  "foundation", "gl", "invoice", "ar", "ap", "cash",
  "sales", "inventory", "hr", "assets", "tax",
  "reports", "contracts", "ai-agents", "admin", "work", "documents",
];

// Module bật mặc định cho mọi công ty.
export const ENABLED_BY_DEFAULT = ["foundation", "admin", "work", "gl", "reports", "documents"];

const CORE_MODULES = ["gl", "invoice", "ar", "ap", "cash", "tax", "reports", "admin", "documents", "work"];
function moduleTier(moduleKey: string): "ai" | "core" | "extended" {
  if (moduleKey === "ai-agents") return "ai";
  return CORE_MODULES.includes(moduleKey) ? "core" : "extended";
}

// Tổ hợp permission cần tạo (global, không theo công ty).
export const MODULE_PERMISSIONS: Array<{
  moduleKey: string;
  action: PermissionAction;
  scope: PermissionScope;
}> = ALL_MODULES.flatMap((moduleKey) => [
  { moduleKey, action: PermissionAction.read, scope: PermissionScope.company },
  { moduleKey, action: PermissionAction.write, scope: PermissionScope.company },
  { moduleKey, action: PermissionAction.delete, scope: PermissionScope.company },
  { moduleKey, action: PermissionAction.approve, scope: PermissionScope.company },
  { moduleKey, action: PermissionAction.export, scope: PermissionScope.company },
  { moduleKey, action: PermissionAction.configure, scope: PermissionScope.company },
  { moduleKey, action: PermissionAction.read, scope: PermissionScope.self },
  { moduleKey, action: PermissionAction.write, scope: PermissionScope.self },
  { moduleKey, action: PermissionAction.read, scope: PermissionScope.team },
  { moduleKey, action: PermissionAction.write, scope: PermissionScope.team },
  { moduleKey, action: PermissionAction.approve, scope: PermissionScope.team },
]);

export interface RoleDef {
  name: string;
  level: RoleLevel;
  description: string;
  /** Phân loại mô hình tổ chức để wizard lọc khi tạo công ty. */
  group: "admin" | "board" | "c_suite" | "department" | "viewer";
  permissions: Array<{ moduleKey: string; action: PermissionAction; scope: PermissionScope }>;
}

// Toàn bộ vai trò hệ thống. `group` cho phép wizard chọn mô hình tổ chức.
// LƯU Ý: "Phòng Hành Chính Tổng Hợp" là bắt buộc — nơi nhận việc không giao được cho ai.
export const SYSTEM_ROLES: RoleDef[] = [
  {
    name: "Quản Trị Viên Công Ty", level: RoleLevel.company_admin, group: "admin",
    description: "Admin công ty — quản trị users, roles, phân quyền toàn bộ công ty",
    permissions: ["admin", "foundation"].flatMap((m) => [
      { moduleKey: m, action: PermissionAction.read, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.write, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.delete, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.configure, scope: PermissionScope.company },
    ]),
  },
  {
    name: "Chủ tịch HĐQT", level: RoleLevel.board, group: "board",
    description: "Chủ tịch Hội đồng quản trị — đứng đầu HĐQT: xem toàn bộ, phê duyệt chiến lược và cấu hình công ty",
    permissions: ALL_MODULES.flatMap((m) => [
      { moduleKey: m, action: PermissionAction.read, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.approve, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.export, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.configure, scope: PermissionScope.company },
    ]),
  },
  {
    name: "Thành Viên HĐQT", level: RoleLevel.board, group: "board",
    description: "HĐQT — xem toàn bộ, approve chiến lược",
    permissions: ALL_MODULES.flatMap((m) => [
      { moduleKey: m, action: PermissionAction.read, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.approve, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.export, scope: PermissionScope.company },
    ]),
  },
  {
    name: "Tổng Giám Đốc", level: RoleLevel.c_suite, group: "c_suite",
    description: "Giám đốc điều hành — quản lý toàn công ty",
    permissions: ALL_MODULES.flatMap((m) => [
      { moduleKey: m, action: PermissionAction.read, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.approve, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.export, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.configure, scope: PermissionScope.company },
    ]),
  },
  {
    name: "Giám Đốc Tài Chính", level: RoleLevel.c_suite, group: "c_suite",
    description: "Giám đốc tài chính — quản lý toàn bộ phân hệ tài chính",
    permissions: ["gl", "invoice", "ar", "ap", "cash", "tax", "reports"].flatMap((m) => [
      { moduleKey: m, action: PermissionAction.read, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.write, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.approve, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.export, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.configure, scope: PermissionScope.company },
    ]),
  },
  {
    name: "Giám Đốc Công Nghệ", level: RoleLevel.c_suite, group: "c_suite",
    description: "Giám đốc công nghệ — phụ trách hệ thống, AI, dữ liệu",
    permissions: [
      ...ALL_MODULES.map((m) => ({ moduleKey: m, action: PermissionAction.read, scope: PermissionScope.company })),
      ...["ai-agents", "reports"].flatMap((m) => [
        { moduleKey: m, action: PermissionAction.write, scope: PermissionScope.company },
        { moduleKey: m, action: PermissionAction.approve, scope: PermissionScope.company },
        { moduleKey: m, action: PermissionAction.configure, scope: PermissionScope.company },
      ]),
    ],
  },
  {
    name: "Kế Toán Trưởng", level: RoleLevel.manager, group: "department",
    description: "KTT — quản lý phòng kế toán",
    permissions: ["gl", "invoice", "ar", "ap", "cash", "tax", "reports"].flatMap((m) => [
      { moduleKey: m, action: PermissionAction.read, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.write, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.approve, scope: PermissionScope.team },
      { moduleKey: m, action: PermissionAction.export, scope: PermissionScope.company },
    ]),
  },
  {
    name: "Kế Toán Viên", level: RoleLevel.staff, group: "department",
    description: "Nhân viên kế toán",
    permissions: ["gl", "invoice", "ar", "ap", "cash", "tax"].flatMap((m) => [
      { moduleKey: m, action: PermissionAction.read, scope: PermissionScope.team },
      { moduleKey: m, action: PermissionAction.write, scope: PermissionScope.self },
    ]),
  },
  {
    name: "Trưởng Phòng Kinh Doanh", level: RoleLevel.manager, group: "department",
    description: "Trưởng phòng kinh doanh",
    permissions: ["sales", "inventory", "invoice", "contracts"].flatMap((m) => [
      { moduleKey: m, action: PermissionAction.read, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.write, scope: PermissionScope.team },
      { moduleKey: m, action: PermissionAction.approve, scope: PermissionScope.team },
    ]),
  },
  {
    name: "Nhân Viên Kinh Doanh", level: RoleLevel.staff, group: "department",
    description: "Nhân viên kinh doanh",
    permissions: ["sales", "inventory"].flatMap((m) => [
      { moduleKey: m, action: PermissionAction.read, scope: PermissionScope.team },
      { moduleKey: m, action: PermissionAction.write, scope: PermissionScope.self },
    ]),
  },
  {
    name: "Trưởng Phòng Nhân Sự", level: RoleLevel.manager, group: "department",
    description: "Trưởng phòng nhân sự",
    permissions: ["hr"].flatMap((m) => [
      { moduleKey: m, action: PermissionAction.read, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.write, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.approve, scope: PermissionScope.company },
      { moduleKey: m, action: PermissionAction.export, scope: PermissionScope.company },
    ]),
  },
  {
    name: "Trưởng Phòng Hành Chính Tổng Hợp", level: RoleLevel.manager, group: "department",
    description: "Trưởng phòng HCTH — văn thư lưu trữ, quản trị tài sản/CSVC, lễ tân, tổng hợp báo cáo. Nhận việc không giao được cho phòng khác.",
    permissions: [
      ...["contracts", "assets"].flatMap((m) => [
        { moduleKey: m, action: PermissionAction.read, scope: PermissionScope.company },
        { moduleKey: m, action: PermissionAction.write, scope: PermissionScope.company },
        { moduleKey: m, action: PermissionAction.approve, scope: PermissionScope.team },
        { moduleKey: m, action: PermissionAction.export, scope: PermissionScope.company },
      ]),
      { moduleKey: "reports", action: PermissionAction.read, scope: PermissionScope.company },
      { moduleKey: "reports", action: PermissionAction.export, scope: PermissionScope.company },
      { moduleKey: "hr", action: PermissionAction.read, scope: PermissionScope.company },
      { moduleKey: "foundation", action: PermissionAction.read, scope: PermissionScope.company },
    ],
  },
  {
    name: "Nhân Viên Hành Chính", level: RoleLevel.staff, group: "department",
    description: "Nhân viên hành chính — văn thư, lễ tân, quản trị văn phòng, hỗ trợ tổng hợp",
    permissions: [
      ...["contracts", "assets"].flatMap((m) => [
        { moduleKey: m, action: PermissionAction.read, scope: PermissionScope.team },
        { moduleKey: m, action: PermissionAction.write, scope: PermissionScope.self },
      ]),
      { moduleKey: "reports", action: PermissionAction.read, scope: PermissionScope.team },
    ],
  },
  {
    name: "Người Xem", level: RoleLevel.staff, group: "viewer",
    description: "Chỉ xem — không thao tác",
    permissions: ["gl", "invoice", "ar", "ap", "cash", "sales", "reports"].map((m) => ({
      moduleKey: m, action: PermissionAction.read, scope: PermissionScope.company,
    })),
  },
];

/** Tên 2 role bắt buộc của Phòng Hành Chính Tổng Hợp — luôn được tạo dù chọn mô hình nào. */
export const ADMIN_DEPARTMENT_ROLE_NAMES = ["Trưởng Phòng Hành Chính Tổng Hợp", "Nhân Viên Hành Chính"];

/** Tạo toàn bộ Permission toàn cục (idempotent). Gọi 1 lần cho cả instance. */
export async function ensureGlobalPermissions(prisma: PrismaClient): Promise<number> {
  for (const perm of MODULE_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { moduleKey_action_scope: { moduleKey: perm.moduleKey, action: perm.action, scope: perm.scope } },
      update: {},
      create: perm,
    });
  }
  return MODULE_PERMISSIONS.length;
}

export interface InitOptions {
  /** Lọc role theo tên (mô hình tổ chức từ wizard). Bỏ trống = tạo tất cả. */
  roleNames?: string[];
  /** Module bật thêm ngoài mặc định (work + documents luôn bật). */
  extraEnabledModules?: string[];
}

/** Tạo system roles cho 1 công ty + gán permission (idempotent). */
export async function createCompanyRoles(prisma: PrismaClient, companyId: string, opts: InitOptions = {}): Promise<number> {
  const wanted = opts.roleNames
    ? SYSTEM_ROLES.filter((r) =>
        opts.roleNames!.includes(r.name) || ADMIN_DEPARTMENT_ROLE_NAMES.includes(r.name) || r.group === "admin",
      )
    : SYSTEM_ROLES;

  for (const roleDef of wanted) {
    const role = await prisma.role.upsert({
      where: { companyId_name: { companyId, name: roleDef.name } },
      update: { level: roleDef.level, description: roleDef.description, isSystem: true },
      create: {
        companyId, name: roleDef.name, level: roleDef.level,
        description: roleDef.description, isSystem: true, isDefault: roleDef.name === "Người Xem",
      },
    });
    // Baseline TÀI LIỆU: mọi role đều có quyền đọc + ghi tài liệu (chính sách công ty —
    // ai cũng tạo/sửa/upload được; phân quyền riêng tư xử lý ở tầng thư mục cá nhân).
    const perms = [
      ...roleDef.permissions,
      { moduleKey: "documents", action: PermissionAction.read, scope: PermissionScope.company },
      { moduleKey: "documents", action: PermissionAction.write, scope: PermissionScope.company },
    ];
    for (const permDef of perms) {
      const perm = await prisma.permission.findUnique({
        where: { moduleKey_action_scope: { moduleKey: permDef.moduleKey, action: permDef.action, scope: permDef.scope } },
      });
      if (perm) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {}, create: { roleId: role.id, permissionId: perm.id },
        });
      }
    }
  }
  return wanted.length;
}

/** Tạo ModuleConfig cho công ty; bật work + documents + mặc định (idempotent). */
export async function configureCompanyModules(prisma: PrismaClient, companyId: string, opts: InitOptions = {}): Promise<void> {
  const enabled = new Set([...ENABLED_BY_DEFAULT, ...(opts.extraEnabledModules ?? [])]);
  for (const moduleKey of ALL_MODULES) {
    await prisma.moduleConfig.upsert({
      where: { companyId_moduleKey: { companyId, moduleKey } },
      update: { enabled: enabled.has(moduleKey) },
      create: { companyId, moduleKey, enabled: enabled.has(moduleKey), tier: moduleTier(moduleKey), settings: {} },
    });
  }
}

/** Nạp danh mục việc định kỳ mặc định (khớp role theo level + tên). Trả về số mục đã tạo. */
export async function importRecurringDefaults(prisma: PrismaClient, companyId: string): Promise<number> {
  const roles = await prisma.role.findMany({ where: { companyId }, select: { id: true, name: true, level: true } });
  let count = 0;
  for (const duty of RECURRING_CATALOG) {
    const nameLike = duty.roleNameLike?.toLowerCase();
    const role = roles.find((r) => r.level === duty.roleLevel && (!nameLike || r.name.toLowerCase().includes(nameLike)));
    if (!role) continue;
    const exists = await prisma.recurringWork.findFirst({ where: { companyId, roleId: role.id, title: duty.title }, select: { id: true } });
    if (exists) continue;
    await prisma.recurringWork.create({
      data: {
        companyId, roleId: role.id, title: duty.title, description: duty.description ?? null,
        cadence: duty.cadence, module: duty.module ?? null, priority: duty.priority ?? "normal",
        dueOffsetDays: duty.dueOffsetDays ?? 0, source: "default",
      },
    });
    count++;
  }
  return count;
}

/**
 * Khởi tạo toàn bộ cấu hình mặc định cho 1 công ty: roles + modules + việc định kỳ.
 * Idempotent — gọi lại an toàn. Permission toàn cục phải tồn tại trước (ensureGlobalPermissions).
 */
export async function initializeCompanyDefaults(
  prisma: PrismaClient, companyId: string, opts: InitOptions = {},
): Promise<{ roles: number; recurring: number }> {
  const roles = await createCompanyRoles(prisma, companyId, opts);
  await configureCompanyModules(prisma, companyId, opts);
  const recurring = await importRecurringDefaults(prisma, companyId);
  return { roles, recurring };
}
