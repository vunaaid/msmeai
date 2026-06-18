"use client";

// src/components/layout/sidebar.tsx
// Dynamic Sidebar — tự ẩn/hiện theo module config

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield, Settings, BookOpen, FileText, TrendingUp, TrendingDown,
  Banknote, Calculator, BarChart3, ShoppingCart, Package, Users,
  Building2, Pen, Bot, ClipboardList, Bell, FileStack, NotebookPen,
  MessagesSquare,
} from "lucide-react";
import { SignOutButton } from "./sign-out-button";

const ICON_MAP: Record<string, React.ElementType> = {
  Shield, Settings, BookOpen, FileText, TrendingUp, TrendingDown,
  Banknote, Calculator, BarChart3, ShoppingCart, Package, Users,
  Building2, Pen, Bot, ClipboardList, FileStack, NotebookPen, MessagesSquare,
};

interface SidebarModule {
  key: string;
  name: string;
  icon: string;
  route: string;
  tier: string;
  comingSoon?: boolean;
}

interface SidebarProps {
  modules: SidebarModule[];
  isAdmin: boolean;
  canAccounting?: boolean;
  userName: string;
  companyName: string;
  unreadCount?: number;
  open: boolean;
  onNavigate: () => void;
}

export function Sidebar({ modules, isAdmin, canAccounting = false, userName, companyName, unreadCount = 0, open, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  // "foundation" và "admin" không phải module nghiệp vụ — admin hiển thị riêng (chỉ cho admin).
  const grouped = {
    core: modules.filter(m => m.tier === "core" && !["foundation", "admin"].includes(m.key)),
    extended: modules.filter(m => m.tier === "extended"),
    ai: modules.filter(m => m.tier === "ai"),
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen w-60 bg-slate-900 flex flex-col z-40 transform transition-transform duration-200 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-lg">v</span>
        </div>
        <div className="min-w-0">
          <div className="text-white font-bold text-base leading-tight">vSME</div>
          <div className="text-slate-500 text-xs truncate">{companyName}</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {/* Dashboard — trang chủ theo vai trò, luôn là mục đầu tiên */}
        <NavItem
          href="/dashboard"
          icon="BarChart3"
          label="Dashboard"
          active={pathname === "/dashboard"}
          onNavigate={onNavigate}
        />

        {/* Quản Trị — chỉ hiển thị cho vai trò quản trị (company_admin / system_admin) */}
        {isAdmin && (
          <NavItem
            href="/admin"
            icon="Settings"
            label="Quản Trị"
            active={pathname.startsWith("/admin")}
            onNavigate={onNavigate}
          />
        )}

        {/* Kế Toán — module hợp nhất (GL, Hóa đơn, AR/AP, Ngân quỹ, TSCĐ, BCTC).
            Chỉ hiển thị cho admin hoặc role có quyền đọc module 'gl'. */}
        {(isAdmin || canAccounting) && (
          <NavItem
            href="/accounting"
            icon="Calculator"
            label="Kế Toán"
            active={pathname.startsWith("/accounting")}
            onNavigate={onNavigate}
          />
        )}

        {/* Core modules */}
        {grouped.core.length > 0 && (
          <>
            <SectionLabel>Nghiệp Vụ</SectionLabel>
            {grouped.core.map(m => (
              <NavItem
                key={m.key}
                href={m.route}
                icon={m.icon}
                label={m.name}
                active={pathname.startsWith(m.route)}
                comingSoon={m.comingSoon}
                onNavigate={onNavigate}
              />
            ))}
          </>
        )}

        {/* Extended modules */}
        {grouped.extended.length > 0 && (
          <>
            <SectionLabel>Vận Hành</SectionLabel>
            {grouped.extended.map(m => (
              <NavItem
                key={m.key}
                href={m.route}
                icon={m.icon}
                label={m.name}
                active={pathname.startsWith(m.route)}
                comingSoon={m.comingSoon}
                onNavigate={onNavigate}
              />
            ))}
          </>
        )}

        {/* AI */}
        {grouped.ai.length > 0 && (
          <>
            <SectionLabel>AI System</SectionLabel>
            {grouped.ai.map(m => (
              <NavItem
                key={m.key}
                href={m.route}
                icon={m.icon}
                label={m.name}
                active={pathname.startsWith(m.route)}
                badge="AI"
                comingSoon={m.comingSoon}
                onNavigate={onNavigate}
              />
            ))}
          </>
        )}
      </nav>

      {/* Bottom: User + Logout */}
      <div className="border-t border-slate-800 p-3 space-y-1">
        <Link
          href="/notifications"
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <Bell size={18} />
          <span className="text-sm">Thông báo</span>
          {unreadCount > 0 && (
            <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
          <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">
              {userName.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-slate-300 text-sm truncate flex-1">{userName}</span>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  href, icon, label, active, badge, comingSoon, onNavigate,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  badge?: string;
  comingSoon?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = ICON_MAP[icon] ?? Shield;

  // Module chưa có trang → hiển thị disabled, KHÔNG dùng Link (tránh prefetch 404)
  if (comingSoon) {
    return (
      <div
        title="Tính năng đang được phát triển"
        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 cursor-default select-none"
      >
        <Icon size={17} className="flex-shrink-0 opacity-60" />
        <span className="flex-1 truncate">{label}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700/60">
          Sắp ra mắt
        </span>
      </div>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
        active
          ? "bg-blue-700 text-white"
          : "text-slate-400 hover:text-white hover:bg-slate-800"
      }`}
    >
      <Icon size={17} className="flex-shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-600 text-white">{badge}</span>
      )}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-1">
      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
        {children}
      </span>
    </div>
  );
}
