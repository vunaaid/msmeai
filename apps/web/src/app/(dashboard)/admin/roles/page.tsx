// src/app/(dashboard)/admin/roles/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@vsme/db/client";
import Link from "next/link";
import { Shield, ChevronRight, Users, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Phân Quyền Module" };

const LEVEL_VN: Record<string, string> = {
  company_admin: "Quản Trị Viên",
  board:   "HĐQT",
  c_suite: "C-Suite",
  manager: "Trưởng Phòng",
  staff:   "Nhân Viên",
  system:  "Hệ Thống",
};

const LEVEL_COLOR: Record<string, string> = {
  company_admin: "bg-amber-900/30 text-amber-300 border-amber-800",
  board:   "bg-purple-900/30 text-purple-300 border-purple-800",
  c_suite: "bg-blue-900/30 text-blue-300 border-blue-800",
  manager: "bg-emerald-900/30 text-emerald-300 border-emerald-800",
  staff:   "bg-slate-800 text-slate-300 border-slate-700",
  system:  "bg-red-900/30 text-red-300 border-red-800",
};

export default async function RolesPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.accountType !== "company_admin" && !session.user.isSuperAdmin) {
    redirect("/admin");
  }

  const roles = await prisma.role.findMany({
    where: { companyId: session.user.companyId },
    include: {
      _count:      { select: { users: true } },
      permissions: { include: { permission: { select: { moduleKey: true } } } },
    },
    orderBy: { level: "asc" },
  });

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <PageHeader
        icon="Shield"
        iconColor="text-amber-400"
        backHref="/admin"
        title="Phân Quyền Module"
        subtitle="Cấu hình module nào mỗi vai trò được truy cập"
      />

      {/* Info box */}
      <div className="flex items-start gap-3 p-4 bg-blue-900/10 border border-blue-800/30 rounded-xl text-sm text-slate-400">
        <Lock size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-blue-300 font-medium mb-1">Cách hoạt động</p>
          <ul className="space-y-0.5 text-xs">
            <li>• <strong className="text-slate-300">Quản trị viên công ty</strong> luôn thấy tất cả module</li>
            <li>• Các vai trò khác chỉ thấy module được phân quyền bên dưới</li>
            <li>• Module <strong className="text-slate-300">Quản Lý Công Việc</strong> mặc định bật cho tất cả vai trò</li>
            <li>• Thay đổi quyền có hiệu lực khi người dùng đăng nhập lại</li>
          </ul>
        </div>
      </div>

      {/* Roles list */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">{roles.length} vai trò trong công ty</h2>
        </div>
        <div className="divide-y divide-slate-800">
          {roles.map(role => {
            const modulesCount = new Set(role.permissions.map(rp => rp.permission.moduleKey)).size;
            const isSystem = role.isSystem;

            return (
              <div key={role.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-800/30 transition-colors group">
                {/* Icon */}
                <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
                  <Shield size={16} className="text-slate-400" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-200 group-hover:text-white">
                      {role.name}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded border ${LEVEL_COLOR[role.level] ?? LEVEL_COLOR.staff}`}>
                      {LEVEL_VN[role.level] ?? role.level}
                    </span>
                    {isSystem && (
                      <span className="text-xs text-slate-600 border border-slate-700 px-1.5 py-0.5 rounded">
                        Hệ thống
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Users size={11} />
                      {role._count.users} người dùng
                    </span>
                    <span className="text-xs text-slate-500">
                      {modulesCount} module được phép
                    </span>
                  </div>
                </div>

                {/* Action */}
                <Link
                  href={`/admin/roles/${role.id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
                >
                  Cấu hình quyền
                  <ChevronRight size={12} />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
