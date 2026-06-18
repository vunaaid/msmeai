// src/lib/rbac.ts
// RBAC helpers cho Express — giống hệt Next.js version nhưng dùng express types

import { PermissionError } from "./response.js";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  accountType: "system_admin" | "company_admin" | "user";
  companyId: string;
  companyName: string;
  companySlug: string | null;
  roleId: string | null;
  roleName: string | null;
  roleLevel: string | null;
  extraRoleIds: string[]; // Vai trò bổ sung (HĐQT, ban...) — chỉ ảnh hưởng việc định kỳ + đọc tài liệu, không cấp quyền
  isSuperAdmin: boolean;
  avatarUrl: string | null;
  aiMode: "full" | "assistant";
  permissions: Array<{ moduleKey: string; action: string; scope: string }>;
};

export function isSystemAdmin(user: SessionUser | undefined): boolean {
  return user?.accountType === "system_admin";
}

export function isCompanyAdmin(user: SessionUser | undefined): boolean {
  return user?.accountType === "company_admin" || isSystemAdmin(user);
}

/**
 * Kiểm tra user có permission không.
 */
export function hasPermission(
  user: SessionUser | undefined,
  moduleKey: string,
  action: string,
  scope?: string
): boolean {
  if (!user) return false;
  // Company admin (và system admin / super admin) toàn quyền trong công ty mình
  if (isCompanyAdmin(user) || user.isSuperAdmin) return true;

  return user.permissions.some(p => {
    const moduleMatch = p.moduleKey === moduleKey || p.moduleKey === "*";
    const actionMatch = p.action === action || p.action === "*";
    const scopeMatch = !scope || p.scope === scope || isScopeWider(p.scope, scope);
    return moduleMatch && actionMatch && scopeMatch;
  });
}

function isScopeWider(userScope: string, requiredScope: string): boolean {
  const hierarchy = ["self", "team", "dept", "company"];
  const userLevel = hierarchy.indexOf(userScope);
  const requiredLevel = hierarchy.indexOf(requiredScope);
  return userLevel > requiredLevel;
}

/**
 * Throw PermissionError nếu không có quyền.
 */
export function assertPermission(
  user: SessionUser | undefined,
  moduleKey: string,
  action: string,
  scope?: string
): void {
  if (!hasPermission(user, moduleKey, action, scope)) {
    throw new PermissionError(`Không có quyền ${action} trên module ${moduleKey}`);
  }
}

/**
 * Trả companyId scope — system_admin có thể query theo companyId param,
 * company_admin chỉ thấy công ty mình.
 */
export function getCompanyScope(
  user: SessionUser,
  paramCompanyId?: string | null
): string {
  if (isSystemAdmin(user) && paramCompanyId) return paramCompanyId;
  return user.companyId;
}
