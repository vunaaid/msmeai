"use client";

// src/app/(dashboard)/notifications/notifications-client.tsx
// Danh sách thông báo có tương tác: tự đánh dấu đã đọc khi mở trang, nút "Đánh dấu tất cả
// đã đọc", và bấm 1 thông báo → đánh dấu đã đọc + mở deep link (data.url) nếu có.
// Sau khi đổi trạng thái → phát window event "notifications:changed" để chuông (NotificationBell)
// tự cập nhật badge.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { apiSend } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/page-header";
import { PushNotificationToggle } from "@/components/push-notification-toggle";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: string | Date | null;
  createdAt: string | Date;
}

interface Props {
  initial: NotificationItem[];
}

/** Báo cho NotificationBell (và nơi khác) biết trạng thái đọc đã đổi → refresh badge. */
function notifyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("notifications:changed"));
  }
}

function urlOf(data: unknown): string | null {
  if (data && typeof data === "object" && "url" in data) {
    const u = (data as { url?: unknown }).url;
    return typeof u === "string" && u.length > 0 ? u : null;
  }
  return null;
}

export function NotificationsClient({ initial }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>(initial);
  const [markingAll, setMarkingAll] = useState(false);
  const autoMarked = useRef(false);

  const unread = items.filter((n) => !n.readAt).length;

  // Tự đánh dấu TẤT CẢ đã đọc khi mở trang (chạy 1 lần) → badge chuông tự về 0.
  useEffect(() => {
    if (autoMarked.current) return;
    autoMarked.current = true;
    const hasUnread = initial.some((n) => !n.readAt);
    if (!hasUnread) return;
    apiSend("/api/notifications/read-all", "PATCH")
      .then(() => {
        const now = new Date().toISOString();
        setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
        notifyChanged();
      })
      .catch(() => {});
  }, [initial]);

  const markAllRead = () => {
    if (unread === 0 || markingAll) return;
    setMarkingAll(true);
    apiSend("/api/notifications/read-all", "PATCH")
      .then(() => {
        const now = new Date().toISOString();
        setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
        notifyChanged();
      })
      .catch(() => {})
      .finally(() => setMarkingAll(false));
  };

  const openItem = (n: NotificationItem) => {
    if (!n.readAt) {
      // đánh dấu đã đọc (optimistic) — không chặn điều hướng
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      apiSend(`/api/notifications/${n.id}`, "PATCH").then(notifyChanged).catch(() => {});
    }
    const url = urlOf(n.data);
    if (url) router.push(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon="Bell"
        iconColor="text-cyan-400"
        title="Thông báo"
        actions={
          <>
            {unread > 0 && (
              <span className="text-xs bg-cyan-600 text-white px-2 py-0.5 rounded-full">{unread} chưa đọc</span>
            )}
            <button
              onClick={markAllRead}
              disabled={unread === 0 || markingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {markingAll ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
              Đánh dấu tất cả đã đọc
            </button>
            <PushNotificationToggle />
          </>
        }
      />

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <Bell className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-sm">Chưa có thông báo nào</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const hasUrl = !!urlOf(n.data);
            return (
              <div
                key={n.id}
                onClick={() => openItem(n)}
                className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${
                  hasUrl ? "cursor-pointer hover:border-slate-500" : ""
                } ${
                  n.readAt
                    ? "bg-slate-800/40 border-slate-700/40 text-slate-400"
                    : "bg-slate-800/80 border-slate-600/60 text-white"
                }`}
              >
                <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${n.readAt ? "bg-slate-600" : "bg-cyan-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{n.body}</p>
                  <p className="text-xs text-slate-600 mt-1">{new Date(n.createdAt).toLocaleString("vi-VN")}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
