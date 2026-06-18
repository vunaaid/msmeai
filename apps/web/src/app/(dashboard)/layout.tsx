// src/app/(dashboard)/layout.tsx
// Dashboard layout — server component, load sidebar modules

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@vsme/db/client";
import { getSidebarItems } from "@vsme/modules/registry";
import type { ModuleKey } from "@vsme/modules/types";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getUserNotifications } from "@/lib/services/notification.service";
import { getUserPermissions } from "@/lib/auth/permissions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  // Load enabled modules từ DB (company-level)
  const moduleConfigs = await prisma.moduleConfig.findMany({
    where: { companyId: session.user.companyId, enabled: true },
    select: { moduleKey: true },
  });

  const companyModules = new Set([
    "foundation" as ModuleKey,
    "admin" as ModuleKey,
    "work" as ModuleKey,  // Module mặc định — luôn bật cho mọi công ty / mọi user
    "notes" as ModuleKey, // Module ghi chép cá nhân — luôn bật cho mọi user
    "chat" as ModuleKey,  // Trò chuyện — luôn bật cho mọi user
    ...moduleConfigs.map(c => c.moduleKey as ModuleKey),
  ]);

  // Filter theo quyền của role user (trừ company_admin / system_admin — thấy tất cả)
  const isAdmin =
    session.user.accountType === "company_admin" ||
    session.user.accountType === "system_admin" ||
    session.user.isSuperAdmin;

  let enabledSet: Set<ModuleKey>;

  if (isAdmin) {
    enabledSet = companyModules;
  } else {
    // Lấy modules mà role user có quyền read (load từ DB theo roleId)
    const userPerms = await getUserPermissions(session);
    const permittedModules = new Set(
      userPerms
        .filter(p => p.action === "read")
        .map(p => p.moduleKey as ModuleKey)
    );
    // work + notes + chat là module mặc định cho mọi user (admin KHÔNG thêm — chỉ admin mới thấy)
    permittedModules.add("work" as ModuleKey);
    permittedModules.add("notes" as ModuleKey);
    permittedModules.add("chat" as ModuleKey);
    // Intersect: chỉ show modules enabled ở company VÀ role có quyền
    enabledSet = new Set([...companyModules].filter(m => permittedModules.has(m)));
  }

  // Modules đã có trang thật trong app — còn lại hiển thị "Sắp ra mắt" (không link → tránh 404)
  const IMPLEMENTED_MODULES = new Set<ModuleKey>([
    "foundation", "admin", "work", "ai-agents", "reports", "documents", "notes", "chat", "contracts", "hr", "sales", "ar", "ap", "cash", "assets", "inventory", "tax",
  ]);
  // Các phân hệ kế toán được gộp vào MỘT module "Kế Toán" (route /accounting, tab nội bộ)
  // → ẩn các entry registry riêng lẻ khỏi sidebar để tránh trùng + entry "Sắp ra mắt".
  const ACCOUNTING_SUBMODULES = new Set<ModuleKey>(["gl", "invoice", "ar", "ap", "cash", "tax", "assets"]);

  const sidebarItems = getSidebarItems(enabledSet)
    .filter((m) => !ACCOUNTING_SUBMODULES.has(m.key))
    .map((m) => ({
      ...m,
      comingSoon: !IMPLEMENTED_MODULES.has(m.key),
    }));

  // Module Kế Toán (hợp nhất, route /accounting) — hiện khi có quyền đọc 'gl'
  // (hoặc 'reports' cho phần BCTC). Admin thấy mặc định.
  const canAccounting = isAdmin || enabledSet.has("gl") || enabledSet.has("reports");

  // Lấy unread notification count
  const { unreadCount } = await getUserNotifications(session.user.id, {
    unreadOnly: true,
    limit: 1,
  });

  return (
    <DashboardShell
      modules={sidebarItems}
      isAdmin={isAdmin}
      canAccounting={canAccounting}
      userId={session.user.id}
      userName={session.user.name ?? session.user.email}
      companyName={session.user.companyName}
      unreadCount={unreadCount}
    >
      {children}
    </DashboardShell>
  );
}
