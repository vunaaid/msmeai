"use client";

// src/components/layout/notification-bell.tsx
// Chuông thông báo dùng chung ở header mọi trang — badge số chưa đọc, bấm → /notifications.

import Link from "next/link";
import { useEffect } from "react";
import { Bell } from "lucide-react";
import { useApi } from "@/lib/api/client";

export function NotificationBell() {
  // Chỉ cần meta.total (không lấy danh sách) → limit=1 cho nhẹ.
  const { meta, refresh } = useApi<unknown[]>("/api/notifications?unreadOnly=true&limit=1");
  const unread = meta?.total ?? 0;

  // Khi trang Thông báo đánh dấu đã đọc → phát "notifications:changed" → refresh badge.
  useEffect(() => {
    const onChanged = () => refresh();
    window.addEventListener("notifications:changed", onChanged);
    return () => window.removeEventListener("notifications:changed", onChanged);
  }, [refresh]);

  return (
    <Link
      href="/notifications"
      title="Thông báo"
      aria-label="Thông báo"
      className="relative flex items-center justify-center w-9 h-9 shrink-0 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
    >
      <Bell size={18} />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] leading-none rounded-full px-1 py-0.5 min-w-[16px] text-center">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
