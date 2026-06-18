// apps/ai-worker/src/handlers/notification.handler.ts
// BullMQ Worker xử lý gửi notifications

import { Worker } from "bullmq";
import { QUEUE_NAMES } from "@vsme/audit/event-bus";
import { prisma } from "@vsme/db/client";
import type { Prisma } from "@vsme/db";
import nodemailer from "nodemailer";

// ─── Email Transporter ────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env["SMTP_HOST"] ?? "localhost",
  port: parseInt(process.env["SMTP_PORT"] ?? "1025"),
  secure: process.env["SMTP_SECURE"] === "true",
  auth: process.env["SMTP_USER"]
    ? {
        user: process.env["SMTP_USER"],
        pass: process.env["SMTP_PASS"],
      }
    : undefined,
});

// ─── Notification Worker ──────────────────────────────────────────────────────
export function startNotificationWorker(concurrency = 10): Worker {
  const connection = {
    host: (() => {
      try { return new URL(process.env["REDIS_URL"] ?? "redis://localhost:6379").hostname; }
      catch { return "localhost"; }
    })(),
    port: (() => {
      try { return parseInt(new URL(process.env["REDIS_URL"] ?? "redis://localhost:6379").port || "6379"); }
      catch { return 6379; }
    })(),
    password: (() => {
      try {
        const url = new URL(process.env["REDIS_URL"] ?? "redis://localhost:6379");
        return url.password || undefined;
      }
      catch { return undefined; }
    })(),
  };

  const worker = new Worker(
    QUEUE_NAMES.NOTIFICATIONS,
    async (job) => {
      const { companyId, userId, type, title, body, data } = job.data as {
        companyId: string;
        userId: string;
        type: string;
        title: string;
        body: string;
        data?: Record<string, unknown>;
        sendEmail?: boolean;
        templateData?: Record<string, unknown>;
      };

      // 1. Lưu in-app notification
      await prisma.notification.create({
        data: {
          companyId,
          userId,
          channel: "inapp",
          type,
          title,
          body,
          data: data as unknown as Prisma.InputJsonValue | undefined,
        },
      });

      // 2. Gửi email nếu cần
      if (job.data.sendEmail) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, name: true },
        });

        if (user?.email) {
          await transporter.sendMail({
            from: process.env["SMTP_FROM"] ?? "vSME <noreply@vsme.local>",
            to: user.email,
            subject: title,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1e3a8a;">${title}</h2>
                <p>${body}</p>
                <hr style="border: 1px solid #e5e7eb;" />
                <p style="color: #6b7280; font-size: 12px;">vSME Platform</p>
              </div>
            `,
          });
        }
      }

      console.log(`[Notification] Sent '${type}' to user ${userId}`);
    },
    { connection, concurrency }
  );

  worker.on("failed", (job, error) => {
    console.error(`[Notification] Job failed:`, error.message);
  });

  return worker;
}
