// src/modules/notifications/notifications.router.ts
// GET  /notifications          — danh sách notifications của user
// PATCH /notifications/:id     — đánh dấu đã đọc
// PATCH /notifications/read-all — đánh dấu tất cả đã đọc

import { Router } from "express";
import { prisma } from "@vsme/db/client";
import { requireAuth } from "../../middleware/auth.js";
import { ok, notFound, wrap } from "../../lib/response.js";
import { qi, param } from "../../lib/query.js";

const router = Router();

// ─── GET /notifications ───────────────────────────────────────────────────────

router.get("/", requireAuth, wrap(async (req, res) => {
  const user     = req.user!;
  const page       = qi(req.query["page"], 1);
  const limit      = Math.min(qi(req.query["limit"], 20), 50);
  const unreadOnly = req.query["unreadOnly"] === "true";

  const where = {
    userId: user.id,
    ...(unreadOnly ? { readAt: null } : {}),
  };

  const [total, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return ok(res, notifications, { total, page, limit });
}));

// ─── PATCH /notifications/read-all ───────────────────────────────────────────

router.patch("/read-all", requireAuth, wrap(async (req, res) => {
  const user = req.user!;

  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return ok(res, { success: true });
}));

// ─── PATCH /notifications/:id ────────────────────────────────────────────────

router.patch("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;

  const notification = await prisma.notification.findFirst({
    where: { id: param(param(req.params["id"])), userId: user.id },
  });
  if (!notification) return notFound(res, "Notification");

  const updated = await prisma.notification.update({
    where: { id: notification.id },
    data:  { readAt: new Date() },
  });

  return ok(res, updated);
}));

export default router;
