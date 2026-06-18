// src/app/(dashboard)/cash/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserPermissions } from "@/lib/auth/permissions";
import { CashClient } from "./cash-client";

export const metadata: Metadata = { title: "Ngân Quỹ" };

export default async function CashPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const isAdmin = session.user.accountType === "company_admin" || session.user.isSuperAdmin;
  let canManage = isAdmin;
  if (!isAdmin) {
    const perms = await getUserPermissions(session);
    canManage = perms.some((p) => p.moduleKey === "cash" && (p.action === "write" || p.action === "*"));
  }
  return <CashClient canManage={canManage} roleName={session.user.roleName} roleLevel={session.user.roleLevel} />;
}
