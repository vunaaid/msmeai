// src/modules/push/push.router.ts
// POST   /push/subscribe    — đăng ký push subscription
// DELETE /push/subscribe    — huỷ đăng ký

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import { requireAuth } from "../../middleware/auth.js";
import { ok, wrap } from "../../lib/response.js";
import { qs } from "../../lib/query.js";

const router = Router();

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth:   z.string(),
  }),
});

// ─── POST /push/subscribe ────────────────────────────────────────────────────

router.post("/subscribe", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const { endpoint, keys } = subscribeSchema.parse(req.body);

  await prisma.userPushSubscription.upsert({
    where:  { endpoint },
    update: { p256dh: keys.p256dh, auth: keys.auth },
    create: {
      userId:   user.id,
      endpoint,
      p256dh:   keys.p256dh,
      auth:     keys.auth,
    },
  });

  return ok(res, { subscribed: true });
}));

// ─── DELETE /push/subscribe ───────────────────────────────────────────────────

router.delete("/subscribe", requireAuth, wrap(async (req, res) => {
  const user     = req.user!;
  const endpoint = qs(req.query["endpoint"]);

  if (endpoint) {
    await prisma.userPushSubscription.deleteMany({
      where: { userId: user.id, endpoint },
    });
  } else {
    // Xoá tất cả subscriptions của user
    await prisma.userPushSubscription.deleteMany({
      where: { userId: user.id },
    });
  }

  return ok(res, { unsubscribed: true });
}));

export default router;
