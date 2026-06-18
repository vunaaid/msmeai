// src/app/(dashboard)/accounting/page.tsx
// Module Kế Toán — server component: auth + RBAC (quyền module 'gl') + render client tabs.
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserPermissions } from "@/lib/auth/permissions";
import { AccountingClient } from "./accounting-client";

export const metadata: Metadata = { title: "Kế Toán" };

export default async function AccountingPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const isAdmin =
    session.user.accountType === "company_admin" ||
    session.user.accountType === "system_admin" ||
    session.user.isSuperAdmin;

  // RBAC: cần quyền đọc 'gl' (hoặc 'reports' cho BCTC). Quản trị thấy mặc định.
  let canRead = isAdmin;
  let canManage = isAdmin;
  if (!isAdmin) {
    const perms = await getUserPermissions(session);
    canRead = perms.some(
      (p) => (p.moduleKey === "gl" || p.moduleKey === "reports") && p.action === "read"
    );
    canManage = perms.some((p) => p.moduleKey === "gl" && p.action === "write");
  }

  if (!canRead) redirect("/");

  return (
    <AccountingClient
      userName={session.user.name ?? session.user.email}
      canManage={canManage}
      roleName={session.user.roleName}
      roleLevel={session.user.roleLevel}
    />
  );
}
