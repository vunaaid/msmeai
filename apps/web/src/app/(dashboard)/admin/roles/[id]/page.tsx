// src/app/(dashboard)/admin/roles/[id]/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@vsme/db/client";
import { RolePermissionsClient } from "./role-permissions-client";
import { MODULE_REGISTRY } from "@vsme/modules/registry";

export const metadata: Metadata = { title: "Cấu Hình Quyền Vai Trò" };

type Props = { params: Promise<{ id: string }> };

export default async function RolePermissionsPage({ params }: Props) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.accountType !== "company_admin" && !session.user.isSuperAdmin) {
    redirect("/admin");
  }

  const { id } = await params;

  const role = await prisma.role.findFirst({
    where: { id, companyId: session.user.companyId },
    include: {
      permissions: {
        include: {
          permission: { select: { moduleKey: true, action: true } },
        },
      },
    },
  });

  if (!role) notFound();

  // Các module company đang bật
  const enabledModuleConfigs = await prisma.moduleConfig.findMany({
    where: { companyId: session.user.companyId, enabled: true },
    select: { moduleKey: true },
  });
  const companyModules = new Set(enabledModuleConfigs.map(m => m.moduleKey));

  // Map module → actions hiện tại của role
  const currentPermissions: Record<string, string[]> = {};
  for (const rp of role.permissions) {
    const key = rp.permission.moduleKey;
    if (!currentPermissions[key]) currentPermissions[key] = [];
    currentPermissions[key].push(rp.permission.action);
  }

  // Danh sách modules để hiển thị (chỉ những module công ty đang bật, loại bỏ foundation)
  const displayModules = Object.values(MODULE_REGISTRY)
    .filter(m => m.key !== "foundation" && companyModules.has(m.key))
    .sort((a, b) => a.navOrder - b.navOrder)
    .map(m => ({
      key: m.key,
      name: m.name,
      description: m.description,
      tier: m.tier,
      icon: m.icon,
      canDisable: m.canDisable,
    }));

  return (
    <RolePermissionsClient
      roleId={id}
      roleName={role.name}
      roleLevel={role.level}
      isSystemRole={role.isSystem}
      currentPermissions={currentPermissions}
      modules={displayModules}
    />
  );
}
