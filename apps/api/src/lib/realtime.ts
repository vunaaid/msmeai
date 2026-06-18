// src/lib/realtime.ts
// Hub SSE in-memory — quản lý kết nối realtime theo userId.
// Dùng chung cho chat (event "chat:message", "chat:read") và thông báo ("notification").
//
// ⚠️ State nằm trong RAM của tiến trình → yêu cầu API chạy single-instance (fork).
//    Đã xác nhận ecosystem.config.js: vsme-api instances:1, exec_mode:"fork".
//    Khi scale nhiều instance, thay lớp này bằng Postgres LISTEN/NOTIFY hoặc Redis pub/sub.

import type { Response } from "express";

// userId → tập các response SSE đang mở (một user có thể mở nhiều tab/thiết bị)
const clients = new Map<string, Set<Response>>();

/** Đăng ký một kết nối SSE cho user. Trả về hàm cleanup. */
export function addClient(userId: string, res: Response): () => void {
  let set = clients.get(userId);
  if (!set) {
    set = new Set();
    clients.set(userId, set);
  }
  set.add(res);
  return () => removeClient(userId, res);
}

/** Gỡ một kết nối SSE. */
export function removeClient(userId: string, res: Response): void {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

/** Ghi một sự kiện SSE tới một response. Bọc try/catch để 1 kết nối hỏng không làm vỡ vòng lặp. */
function writeEvent(res: Response, event: string, data: unknown): void {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    /* kết nối đã đóng — sẽ được dọn khi 'close' bắn */
  }
}

/** Đẩy realtime tới nhiều user (mọi tab đang mở của họ). */
export function pushToUsers(userIds: string[], event: string, data: unknown): void {
  for (const userId of new Set(userIds)) {
    const set = clients.get(userId);
    if (!set) continue;
    for (const res of set) writeEvent(res, event, data);
  }
}

/** Số kết nối đang mở của một user (>0 nghĩa là user đang online ở ít nhất 1 tab). */
export function isOnline(userId: string): boolean {
  return (clients.get(userId)?.size ?? 0) > 0;
}

/** Gửi comment keepalive định kỳ để proxy/nginx không ngắt kết nối idle. */
export function startKeepalive(res: Response): NodeJS.Timeout {
  return setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      /* ignore */
    }
  }, 25_000);
}
