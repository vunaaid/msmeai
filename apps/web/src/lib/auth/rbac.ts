// src/lib/auth/rbac.ts
// RBAC helpers — kiểm tra quyền (dùng cho UI gating ở server components).
// Permissions load từ DB theo roleId (xem [[permissions]]), không lấy từ JWT.

import type { Session } from "next-auth";
import type { PermissionAction, PermissionScope } from "@vsme/db";
import { getUserPermissions, type UserPermission } from "./permissions";

/** System admin — quản lý toàn bộ platform, bypass mọi permission check */
export function isSystemAdmin(session: Session | null): boolean {
  return session?.user?.accountType === "system_admin";
}

/** Company admin hoặc system admin — quản trị trong phạm vi công ty */
export function isCompanyAdmin(session: Session | null): boolean {
  return (
    session?.user?.accountType === "company_admin" ||
    isSystemAdmin(session)
  );
}

/**
 * Scope hierarchy: company > dept > team > self
 * Nếu user có scope rộng hơn → vẫn pass check scope hẹp hơn
 */
function isScopeWider(userScope: string, requiredScope: string): boolean {
  const hierarchy = ["self", "team", "dept", "company"];
  return hierarchy.indexOf(userScope) >= hierarchy.indexOf(requiredScope);
}

function permissionMatches(
  perms: UserPermission[],
  moduleKey: string,
  action: string,
  scope?: string
): boolean {
  return perms.some((p) => {
    const moduleMatch = p.moduleKey === moduleKey || p.moduleKey === "*";
    const actionMatch = p.action === action || p.action === "*";
    const scopeMatch = !scope || p.scope === scope || isScopeWider(p.scope, scope);
    return moduleMatch && actionMatch && scopeMatch;
  });
}

/**
 * Kiểm tra user có permission không. Async vì permissions được load từ DB.
 *
 * @example
 * await userCan(session, 'gl', 'write', 'company')
 * await userCan(session, 'invoice', 'approve')  // bất kỳ scope nào
 */
export async function userCan(
  session: Session | null,
  moduleKey: string,
  action: PermissionAction | string,
  scope?: PermissionScope | string
): Promise<boolean> {
  if (!session?.user) return false;
  // Company admin / system admin / super admin toàn quyền trong công ty mình
  if (isCompanyAdmin(session) || session.user.isSuperAdmin) return true;
  const perms = await getUserPermissions(session);
  return permissionMatches(perms, moduleKey, action, scope);
}
