// src/app/(dashboard)/ap/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserPermissions } from "@/lib/auth/permissions";
import { DebtsClient } from "@/components/debts/debts-client";

export const metadata: Metadata = { title: "Công Nợ Phải Trả" };

export default async function ApPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const isAdmin = session.user.accountType === "company_admin" || session.user.isSuperAdmin;
  let canManage = isAdmin;
  if (!isAdmin) {
    const perms = await getUserPermissions(session);
    canManage = perms.some((p) => p.moduleKey === "ap" && (p.action === "write" || p.action === "*"));
  }
  return <DebtsClient kind="payable" canManage={canManage} roleName={session.user.roleName} roleLevel={session.user.roleLevel} />;
}
