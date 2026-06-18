"use client";

// src/components/push-notification-toggle.tsx
// Toggle để bật/tắt push notifications cho thiết bị hiện tại

import { useState, useEffect } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

type Permission = "default" | "granted" | "denied";
type SubStatus = "loading" | "unsupported" | "subscribed" | "unsubscribed";

export function PushNotificationToggle() {
  const [status, setStatus] = useState<SubStatus>("loading");
  const [permission, setPermission] = useState<Permission>("default");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }

    setPermission(Notification.permission as Permission);

    // Kiểm tra SW đã đăng ký subscription chưa
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setStatus(sub ? "subscribed" : "unsubscribed"))
      .catch(() => setStatus("unsubscribed"));
  }, []);

  // Đăng ký service worker (chỉ chạy một lần khi app load)
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(err => console.error("[SW] Registration failed:", err));
  }, []);

  const handleToggle = async () => {
    if (status === "unsupported" || isBusy) return;
    setIsBusy(true);

    try {
      const reg = await navigator.serviceWorker.ready;

      if (status === "subscribed") {
        // Hủy đăng ký
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
        }
        setStatus("unsubscribed");
      } else {
        // Thiếu VAPID public key (build không nhúng được) → không thể subscribe.
        if (!VAPID_PUBLIC) {
          console.error("[PushToggle] Thiếu NEXT_PUBLIC_VAPID_PUBLIC_KEY — không thể bật push.");
          alert("Chưa cấu hình khóa push (VAPID). Vui lòng liên hệ quản trị.");
          setIsBusy(false);
          return;
        }
        // Xin permission
        const perm = await Notification.requestPermission();
        setPermission(perm as Permission);
        if (perm !== "granted") {
          setIsBusy(false);
          return;
        }

        // Đăng ký push subscription
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as any,
        });

        const json = sub.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            keys: {
              p256dh: json.keys?.p256dh ?? "",
              auth: json.keys?.auth ?? "",
            },
          }),
        });
        setStatus("subscribed");
      }
    } catch (err) {
      console.error("[PushToggle] Error:", err);
    } finally {
      setIsBusy(false);
    }
  };

  if (status === "unsupported") return null;
  if (status === "loading") return null;

  return (
    <button
      onClick={handleToggle}
      disabled={isBusy || permission === "denied"}
      title={
        permission === "denied"
          ? "Thông báo bị chặn — vui lòng mở quyền trong trình duyệt"
          : status === "subscribed"
          ? "Tắt thông báo thiết bị này"
          : "Bật thông báo thiết bị này"
      }
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        status === "subscribed"
          ? "bg-cyan-700/40 text-cyan-300 hover:bg-cyan-700/60 border border-cyan-700/50"
          : "bg-slate-700/50 text-slate-400 hover:bg-slate-700 border border-slate-700"
      }`}
    >
      {isBusy ? (
        <Loader2 size={13} className="animate-spin" />
      ) : status === "subscribed" ? (
        <Bell size={13} />
      ) : (
        <BellOff size={13} />
      )}
      {status === "subscribed" ? "Push bật" : "Push tắt"}
    </button>
  );
}
