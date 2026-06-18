// src/app/(dashboard)/hr/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserPermissions } from "@/lib/auth/permissions";
import { HrClient } from "./hr-client";

export const metadata: Metadata = { title: "Nhân Sự" };

export default async function HrPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const isAdmin =
    session.user.accountType === "company_admin" || session.user.isSuperAdmin;
  let canManage = isAdmin;
  if (!isAdmin) {
    const perms = await getUserPermissions(session);
    canManage = perms.some(
      (p) => p.moduleKey === "hr" && (p.action === "write" || p.action === "*")
    );
  }

  return <HrClient canManage={canManage} roleName={session.user.roleName} roleLevel={session.user.roleLevel} />;
}
