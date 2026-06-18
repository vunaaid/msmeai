// src/app/(dashboard)/notifications/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getUserNotifications } from "@/lib/services/notification.service";
import { NotificationsClient, type NotificationItem } from "./notifications-client";

export const metadata: Metadata = { title: "Thông Báo" };

export default async function NotificationsPage() {
  const session = await auth();
  const { data: notifications } = await getUserNotifications(session!.user.id, { limit: 50 });

  return <NotificationsClient initial={notifications as unknown as NotificationItem[]} />;
}
