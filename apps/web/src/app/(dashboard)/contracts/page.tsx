// src/app/(dashboard)/contracts/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserPermissions } from "@/lib/auth/permissions";
import { ContractsClient } from "./contracts-client";

export const metadata: Metadata = { title: "Hợp Đồng" };

export default async function ContractsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const isAdmin =
    session.user.accountType === "company_admin" || session.user.isSuperAdmin;
  // canManage = admin HOẶC role có quyền contracts:write (c_suite/board/manager...).
  let canManage = isAdmin;
  if (!isAdmin) {
    const perms = await getUserPermissions(session);
    canManage = perms.some(
      (p) => p.moduleKey === "contracts" && (p.action === "write" || p.action === "*")
    );
  }

  return (
    <ContractsClient
      canManage={canManage}
      roleName={session.user.roleName}
      roleLevel={session.user.roleLevel}
    />
  );
}
