// src/lib/auth/permissions.ts
// Permissions của user được load từ DB theo roleId — KHÔNG nhúng vào JWT
// (tránh cookie phình to gây 502 "upstream sent too big header" ở nginx).

import { cache } from "react";
import type { Session } from "next-auth";
import { prisma } from "@vsme/db/client";

export interface UserPermission {
  moduleKey: string;
  action: string;
  scope: string;
}

// Cache theo roleId trong phạm vi 1 request (React cache) — tránh query lặp
// khi nhiều server component cùng cần permissions.
const fetchPermissionsByRole = cache(
  async (roleId: string): Promise<UserPermission[]> => {
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
    return (role?.permissions ?? []).map((rp) => ({
      moduleKey: rp.permission.moduleKey,
      action: rp.permission.action,
      scope: rp.permission.scope,
    }));
  }
);

/** Permissions của user trong session (rỗng nếu chưa gán role). */
export async function getUserPermissions(
  session: Session | null
): Promise<UserPermission[]> {
  const roleId = session?.user?.roleId;
  if (!roleId) return [];
  return fetchPermissionsByRole(roleId);
}
