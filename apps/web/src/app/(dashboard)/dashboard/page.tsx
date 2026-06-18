// src/app/(dashboard)/dashboard/page.tsx
// Trang chủ sau đăng nhập — Dashboard theo vai trò.
// Server component: đọc session + quyền → quyết định widget (resolveWidgets),
// render lưới widget (client). Admin có thêm hàng KPI quản trị.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, Package, FileText, Bot } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@vsme/db/client";
import { getUserPermissions } from "@/lib/auth/permissions";
import { isCompanyAdmin } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { resolveWidgets } from "@/lib/dashboard/widgets";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = { title: "Dashboard" };

const LEVEL_LABEL: Record<string, string> = {
  board: "HĐQT",
  c_suite: "Ban điều hành",
  manager: "Quản lý",
  staff: "Nhân viên",
  system: "Hệ thống",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user;
  const isAdmin = isCompanyAdmin(session);
  const level = user.roleLevel;

  const perms = await getUserPermissions(session);
  const can = (mod: string, action: string) =>
    perms.some(
      (p) => (p.moduleKey === mod || p.moduleKey === "*") && (p.action === action || p.action === "*")
    );
  const canFinance = isAdmin || can("gl", "read") || can("reports", "read");
  const canFinanceApprove = isAdmin || can("gl", "approve");

  const widgets = resolveWidgets({ isAdmin, level, canFinance, canFinanceApprove });
  const year = new Date().getFullYear();

  // Hàng KPI quản trị (chỉ admin) — truy vấn trực tiếp như trang /admin.
  let adminStats: { userCount: number; moduleCount: number; auditCount: number; agentCount: number } | null = null;
  if (isAdmin) {
    const [userCount, moduleCount, auditCount, agentCount] = await Promise.all([
      prisma.user.count({ where: { companyId: user.companyId, isActive: true } }),
      prisma.moduleConfig.count({ where: { companyId: user.companyId, enabled: true } }),
      prisma.auditLog.count({ where: { companyId: user.companyId } }),
      prisma.companyAgent.count({ where: { companyId: user.companyId, isActive: true } }),
    ]);
    adminStats = { userCount, moduleCount, auditCount, agentCount };
  }

  const roleLabel = user.roleName ?? (level ? LEVEL_LABEL[level] : null);

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        icon="LayoutDashboard"
        iconColor="text-blue-400"
        title="Dashboard"
        subtitle={
          <>
            Xin chào, <span className="text-slate-200 font-medium">{user.name}</span>
            {roleLabel ? <> · <span className="text-slate-300">{roleLabel}</span></> : null} ·{" "}
            <span className="text-slate-300">{user.companyName}</span>
          </>
        }
      />

      {adminStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { title: "Người dùng", value: adminStats.userCount, icon: Users, href: "/admin/users", color: "text-blue-400", bg: "bg-blue-500/10" },
            { title: "Modules bật", value: adminStats.moduleCount, icon: Package, href: "/admin/modules", color: "text-emerald-400", bg: "bg-emerald-500/10" },
            { title: "Audit logs", value: adminStats.auditCount.toLocaleString(), icon: FileText, href: "/admin/audit", color: "text-purple-400", bg: "bg-purple-500/10" },
            { title: "AI Agents", value: adminStats.agentCount, icon: Bot, href: "/admin/agents", color: "text-fuchsia-400", bg: "bg-fuchsia-500/10" },
          ].map((c) => (
            <Link
              key={c.title}
              href={c.href}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-600 hover:bg-slate-800/50 transition-colors group"
            >
              <div className={`inline-flex p-2 rounded-lg mb-3 ${c.bg}`}>
                <c.icon size={18} className={c.color} />
              </div>
              <div className="text-2xl font-bold text-white">{c.value}</div>
              <div className="text-xs text-slate-400 mt-0.5 group-hover:text-slate-300">{c.title}</div>
            </Link>
          ))}
        </div>
      )}

      <DashboardClient widgets={widgets} year={year} />
    </div>
  );
}
