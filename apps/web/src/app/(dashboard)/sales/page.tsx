// src/app/(dashboard)/sales/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserPermissions } from "@/lib/auth/permissions";
import { SalesClient } from "./sales-client";

export const metadata: Metadata = { title: "Bán Hàng & CRM" };

export default async function SalesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const isAdmin = session.user.accountType === "company_admin" || session.user.isSuperAdmin;
  let canManage = isAdmin;
  if (!isAdmin) {
    const perms = await getUserPermissions(session);
    canManage = perms.some((p) => p.moduleKey === "sales" && (p.action === "write" || p.action === "*"));
  }

  return <SalesClient canManage={canManage} roleName={session.user.roleName} roleLevel={session.user.roleLevel} />;
}
