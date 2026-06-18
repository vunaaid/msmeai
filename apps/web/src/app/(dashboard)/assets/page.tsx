// src/app/(dashboard)/assets/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserPermissions } from "@/lib/auth/permissions";
import { AssetsClient } from "./assets-client";

export const metadata: Metadata = { title: "Tài Sản & Góp Vốn" };

export default async function AssetsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const isAdmin = session.user.accountType === "company_admin" || session.user.isSuperAdmin;
  let canManage = isAdmin;
  if (!isAdmin) {
    const perms = await getUserPermissions(session);
    canManage = perms.some((p) => p.moduleKey === "assets" && (p.action === "write" || p.action === "*"));
  }
  return <AssetsClient canManage={canManage} roleName={session.user.roleName} roleLevel={session.user.roleLevel} />;
}
