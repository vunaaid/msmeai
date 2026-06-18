// src/app/(dashboard)/contracts/[id]/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserPermissions } from "@/lib/auth/permissions";
import { ContractDetail } from "./contract-detail";

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const { id } = await params;
  const isAdmin =
    session.user.accountType === "company_admin" || session.user.isSuperAdmin;
  let canManage = isAdmin;
  if (!isAdmin) {
    const perms = await getUserPermissions(session);
    canManage = perms.some(
      (p) => p.moduleKey === "contracts" && (p.action === "write" || p.action === "*")
    );
  }
  return <ContractDetail id={id} canManage={canManage} />;
}
