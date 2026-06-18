// src/app/(dashboard)/admin/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@vsme/db/client";
import Link from "next/link";
import { Users, Package, FileText, Shield, CalendarClock, Bot } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Quản Trị" };

export default async function AdminPage() {
  const session = await auth();

  const [userCount, moduleCount, auditCount, agentCount] = await Promise.all([
    prisma.user.count({ where: { companyId: session!.user.companyId, isActive: true } }),
    prisma.moduleConfig.count({ where: { companyId: session!.user.companyId, enabled: true } }),
    prisma.auditLog.count({ where: { companyId: session!.user.companyId } }),
    prisma.companyAgent.count({ where: { companyId: session!.user.companyId, isActive: true } }),
  ]);

  const cards = [
    {
      title: "Người Dùng",
      value: userCount,
      icon: Users,
      href: "/admin/users",
      iconColor: "text-blue-400",
      iconBg: "bg-blue-500/10",
    },
    {
      title: "Modules Bật",
      value: moduleCount,
      icon: Package,
      href: "/admin/modules",
      iconColor: "text-emerald-400",
      iconBg: "bg-emerald-500/10",
    },
    {
      title: "Audit Logs",
      value: auditCount.toLocaleString(),
      icon: FileText,
      href: "/admin/audit",
      iconColor: "text-purple-400",
      iconBg: "bg-purple-500/10",
    },
    {
      title: "Phân Quyền",
      value: "Vai Trò",
      icon: Shield,
      href: "/admin/roles",
      iconColor: "text-amber-400",
      iconBg: "bg-amber-500/10",
    },
    {
      title: "Công Việc Định Kỳ",
      value: "Lịch việc",
      icon: CalendarClock,
      href: "/admin/recurring",
      iconColor: "text-cyan-400",
      iconBg: "bg-cyan-500/10",
    },
    {
      title: "AI Agents",
      value: agentCount,
      icon: Bot,
      href: "/admin/agents",
      iconColor: "text-fuchsia-400",
      iconBg: "bg-fuchsia-500/10",
    },
  ];

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Header */}
      <PageHeader
        title="Quản Trị Hệ Thống"
        subtitle={
          <>
            Xin chào, <span className="text-slate-200 font-medium">{session?.user.name}</span>!
            Đang quản lý <span className="text-slate-200 font-medium">{session?.user.companyName}</span>.
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(card => (
          <Link
            key={card.title}
            href={card.href}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-600 hover:bg-slate-800/50 transition-colors group"
          >
            <div className={`inline-flex p-2.5 rounded-lg mb-4 ${card.iconBg}`}>
              <card.icon size={20} className={card.iconColor} />
            </div>
            <div className="text-2xl font-bold text-white">{card.value}</div>
            <div className="text-sm text-slate-400 mt-1 group-hover:text-slate-300">{card.title}</div>
          </Link>
        ))}
      </div>

      {/* Quick links */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-4">Truy Cập Nhanh</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: "Quản lý người dùng", href: "/admin/users" },
            { label: "Quản lý AI Agents", href: "/admin/agents" },
            { label: "Phân quyền vai trò", href: "/admin/roles" },
            { label: "Cấu hình modules", href: "/admin/modules" },
            { label: "Xem audit logs", href: "/admin/audit" },
          ].map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center justify-between p-3 border border-slate-700 rounded-lg hover:bg-slate-800 hover:border-slate-600 transition-colors text-sm"
            >
              <span className="font-medium text-slate-300 hover:text-white">{link.label}</span>
              <span className="text-slate-500">→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
