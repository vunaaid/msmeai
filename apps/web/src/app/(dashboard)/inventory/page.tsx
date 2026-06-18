// src/app/(dashboard)/inventory/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserPermissions } from "@/lib/auth/permissions";
import { InventoryClient } from "./inventory-client";

export const metadata: Metadata = { title: "Hàng Tồn Kho" };

export default async function InventoryPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const isAdmin = session.user.accountType === "company_admin" || session.user.isSuperAdmin;
  let canManage = isAdmin;
  if (!isAdmin) {
    const perms = await getUserPermissions(session);
    canManage = perms.some((p) => p.moduleKey === "inventory" && (p.action === "write" || p.action === "*"));
  }
  return <InventoryClient canManage={canManage} roleName={session.user.roleName} roleLevel={session.user.roleLevel} />;
}
