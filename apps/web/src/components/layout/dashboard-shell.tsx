"use client";

// src/components/layout/dashboard-shell.tsx
// Khung dashboard: quản lý trạng thái ẩn/hiện sidebar + nút menu.
// Bấm item trong sidebar → tự ẩn (onNavigate). Nội dung co giãn theo sidebar.

import { createContext, useContext, useEffect, useState } from "react";
import { Sidebar } from "./sidebar";
import { ChatNotifier } from "./chat-notifier";

// Cho phép PageHeader (ở các trang) bật/tắt sidebar qua context.
const SidebarToggleContext = createContext<() => void>(() => {});
export const useSidebarToggle = () => useContext(SidebarToggleContext);

interface ShellModule {
  key: string;
  name: string;
  icon: string;
  route: string;
  tier: string;
  comingSoon?: boolean;
}

interface DashboardShellProps {
  modules: ShellModule[];
  isAdmin: boolean;
  canAccounting?: boolean;
  userId: string;
  userName: string;
  companyName: string;
  unreadCount?: number;
  children: React.ReactNode;
}

export function DashboardShell({
  modules,
  isAdmin,
  canAccounting = false,
  userId,
  userName,
  companyName,
  unreadCount = 0,
  children,
}: DashboardShellProps) {
  const [open, setOpen] = useState(true);

  // Trên màn nhỏ (< lg) sidebar che nội dung → mặc định đóng sau khi mount.
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setOpen(false);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-200">
      <Sidebar
        open={open}
        onNavigate={() => setOpen(false)}
        modules={modules}
        isAdmin={isAdmin}
        canAccounting={canAccounting}
        userName={userName}
        companyName={companyName}
        unreadCount={unreadCount}
      />

      {/* Toast in-app: tin nhắn chat & thông báo hệ thống (mọi trang dashboard) */}
      <ChatNotifier userId={userId} />

      {/* Lớp phủ khi mở (chỉ màn nhỏ) — bấm ra ngoài để đóng */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          aria-hidden
        />
      )}

      <main
        className={`flex-1 overflow-y-auto bg-slate-950 transition-[margin] duration-200 ${
          open ? "lg:ml-60" : "ml-0"
        }`}
      >
        <div className="min-h-screen px-4 py-4">
          {/* Nút menu nằm trong PageHeader của mỗi trang (qua useSidebarToggle) */}
          <SidebarToggleContext.Provider value={() => setOpen((o) => !o)}>
            {children}
          </SidebarToggleContext.Provider>
        </div>
      </main>
    </div>
  );
}
