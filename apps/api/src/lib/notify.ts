// src/lib/notify.ts
// Điểm vào DUY NHẤT để thông báo cho người dùng. Gộp 3 kênh:
//   1. Lưu Notification (channel=inapp) → hiện ở /notifications + badge.
//   2. SSE realtime (event "notification") → badge cập nhật ngay không cần refresh.
//   3. Web push → PWA nhận cả khi đóng tab/app.
//
// Thay mọi chỗ tạo Notification thủ công bằng notifyUsers(...) để tự động có realtime + push.

import { prisma } from "@vsme/db/client";
import { pushToUsers } from "./realtime.js";
import { sendPushToUsers } from "./push.js";

export interface NotifyInput {
  type:  string;            // VD: 'work.assigned', 'chat.message'
  title: string;
  body:  string;
  url?:  string;            // deep link khi click notification (mặc định /notifications)
  data?: Record<string, unknown>;
}

export async function notifyUsers(
  companyId: string,
  userIds: string[],
  input: NotifyInput,
): Promise<void> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;

  const data = { ...(input.data ?? {}), url: input.url ?? "/notifications" };

  // 1. Lưu DB (in-app)
  const rows = await prisma.notification.createMany({
    data: ids.map((userId) => ({
      companyId,
      userId,
      channel: "inapp" as const,
      type:  input.type,
      title: input.title,
      body:  input.body,
      data,
    })),
  }).catch((e) => { console.error("[notify] createMany lỗi:", e); return null; });

  // 2. SSE realtime — báo client có thông báo mới (để tăng badge / toast)
  pushToUsers(ids, "notification", {
    type: input.type, title: input.title, body: input.body, data,
    createdRows: rows?.count ?? 0,
  });

  // 3. Web push (không chặn lỗi)
  await sendPushToUsers(ids, {
    title: input.title,
    body:  input.body,
    tag:   input.type,
    data:  { url: data.url },
  });
}
