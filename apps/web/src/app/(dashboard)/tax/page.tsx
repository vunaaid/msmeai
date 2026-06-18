// src/app/(dashboard)/tax/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserPermissions } from "@/lib/auth/permissions";
import { TaxClient } from "./tax-client";

export const metadata: Metadata = { title: "Khai Báo Thuế" };

export default async function TaxPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const isAdmin = session.user.accountType === "company_admin" || session.user.isSuperAdmin;
  let canManage = isAdmin;
  if (!isAdmin) {
    const perms = await getUserPermissions(session);
    canManage = perms.some((p) => p.moduleKey === "tax" && (p.action === "write" || p.action === "*"));
  }
  return <TaxClient canManage={canManage} roleName={session.user.roleName} roleLevel={session.user.roleLevel} />;
}
