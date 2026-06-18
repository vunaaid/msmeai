"use client";

// src/components/layout/page-header.tsx
// Header dùng chung cho mọi trang dashboard: nút menu (☰) + icon + tiêu đề + nút thao tác.
// Desktop: 1 hàng (icon · tiêu đề · thao tác).
// Mobile: 2 hàng — hàng 1 = icon (trái) + thao tác/user (phải), hàng 2 = tên chức năng + subtitle.

import Link from "next/link";
import * as LucideIcons from "lucide-react";
import { Menu, ArrowLeft } from "lucide-react";
import { useSidebarToggle } from "./dashboard-shell";
import { NotificationBell } from "./notification-bell";

interface PageHeaderProps {
  // Truyền component icon trực tiếp (client component) HOẶC tên icon Lucide dạng chuỗi.
  // Server component KHÔNG được truyền component (không serialize qua ranh giới RSC) → dùng chuỗi.
  icon?: React.ElementType | string;
  iconColor?: string;
  title?: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  backHref?: string;
}

export function PageHeader({
  icon: iconProp,
  iconColor = "text-cyan-400",
  title,
  subtitle,
  actions,
  backHref,
}: PageHeaderProps) {
  const toggle = useSidebarToggle();

  const Icon =
    typeof iconProp === "string"
      ? ((LucideIcons as unknown as Record<string, React.ElementType>)[iconProp] ?? null)
      : iconProp;

  // Khối tiêu đề + subtitle — dùng lại ở hàng desktop và hàng 2 trên mobile.
  // Có thể vắng mặt (vd trang đưa tiêu đề xuống card riêng) → header chỉ còn icon + thao tác.
  const titleBlock = (title || subtitle) ? (
    <>
      {title && <h1 className="text-lg sm:text-2xl font-bold text-white leading-tight truncate">{title}</h1>}
      {subtitle && <p className="text-slate-400 text-xs sm:text-sm mt-0.5 truncate">{subtitle}</p>}
    </>
  ) : null;

  return (
    <div className="mb-5">
      {/* Hàng điều khiển: icon bên trái, thao tác/user bên phải */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Nút menu */}
        <button
          onClick={toggle}
          aria-label="Menu"
          className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
        >
          <Menu width={18} height={18} className="w-[18px] h-[18px] shrink-0" />
        </button>

        {backHref && (
          <Link
            href={backHref}
            aria-label="Quay lại"
            className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <ArrowLeft size={18} />
          </Link>
        )}

        {Icon && <Icon className={`w-6 h-6 sm:w-7 sm:h-7 shrink-0 ${iconColor}`} />}

        {/* Desktop: tiêu đề nằm cùng hàng */}
        <div className="hidden sm:block flex-1 min-w-0">{titleBlock}</div>

        {/* Mobile: khoảng đệm đẩy thao tác/user sang phải */}
        <div className="flex-1 sm:hidden" />

        {actions && <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">{actions}</div>}

        {/* Chuông thông báo — hiển thị ở mọi trang dùng PageHeader */}
        <NotificationBell />
      </div>

      {/* Mobile: tiêu đề + subtitle ở hàng 2 */}
      {titleBlock && <div className="sm:hidden mt-2 min-w-0">{titleBlock}</div>}
    </div>
  );
}
