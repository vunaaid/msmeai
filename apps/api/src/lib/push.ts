// src/lib/push.ts
// Gửi push tới thiết bị. Thiết kế theo lớp "provider" để sau gắn thêm FCM (app native) dễ.
//
// Hiện có 1 provider: Web Push (chuẩn W3C/VAPID) — đẩy tới PWA trên Android/desktop/iOS 16.4+.
// Khi làm app mobile native, thêm provider FCM (token-based) vào mảng PROVIDERS bên dưới,
// và lưu device token vào một bảng riêng (vd UserDeviceToken) — không đụng tới luồng gọi.

import webpush from "web-push";
import { prisma } from "@vsme/db/client";

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>; // { url?: string } — sw.js dùng data.url khi click
}

// ─── Cấu hình VAPID (keys đã có trong .env) ───────────────────────────────────

const VAPID_PUBLIC  = process.env["NEXT_PUBLIC_VAPID_PUBLIC_KEY"];
const VAPID_PRIVATE = process.env["VAPID_PRIVATE_KEY"];
const VAPID_SUBJECT = process.env["VAPID_SUBJECT"] ?? "mailto:admin@vsme.vn";

let vapidReady = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidReady = true;
} else {
  console.warn("[push] Thiếu VAPID keys — web push bị tắt. Kiểm tra .env.");
}

// ─── Provider: Web Push ───────────────────────────────────────────────────────

async function sendWebPush(userIds: string[], payload: PushPayload): Promise<void> {
  if (!vapidReady) return;

  const subs = await prisma.userPushSubscription.findMany({
    where: { userId: { in: [...new Set(userIds)] } },
  });
  if (subs.length === 0) return;

  const body = JSON.stringify({
    title: payload.title,
    body:  payload.body,
    icon:  payload.icon  ?? "/favicon.svg",
    badge: payload.badge ?? "/favicon.svg",
    tag:   payload.tag,
    data:  payload.data ?? {},
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (err: unknown) {
        // 404/410 = subscription hết hạn → dọn để không gửi lại nữa
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await prisma.userPushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("[push] sendNotification lỗi:", status ?? err);
        }
      }
    }),
  );
}

// ─── Điểm phân phối (fan-out tới mọi provider) ────────────────────────────────
// TODO(FCM): khi có app native, thêm hàm sendFcm(userIds, payload) và đưa vào mảng này.
const PROVIDERS: Array<(userIds: string[], payload: PushPayload) => Promise<void>> = [
  sendWebPush,
];

/** Gửi push tới các user qua tất cả provider đang bật. Không bao giờ throw ra ngoài. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return;
  await Promise.all(PROVIDERS.map((p) => p(userIds, payload).catch((e) => console.error("[push]", e))));
}
