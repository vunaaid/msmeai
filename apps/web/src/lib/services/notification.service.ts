// src/lib/services/notification.service.ts
// Notification reads cho web server components.
// Việc GỬI notification (in-app/email/push, queue, templates) do Express API
// + ai-worker đảm nhiệm — web chỉ đọc.

import { prisma } from "@vsme/db/client";

/**
 * Lấy notifications của user (chưa đọc trước).
 */
export async function getUserNotifications(
  userId: string,
  options: { page?: number; limit?: number; unreadOnly?: boolean } = {}
) {
  const { page = 1, limit = 20, unreadOnly = false } = options;

  const where = {
    userId,
    ...(unreadOnly ? { readAt: null } : {}),
  };

  const [total, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const unreadCount = unreadOnly
    ? total
    : await prisma.notification.count({ where: { userId, readAt: null } });

  return { total, unreadCount, page, limit, data: notifications };
}
