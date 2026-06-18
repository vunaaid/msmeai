// packages/audit/src/event-bus.ts
// Event Bus — phát và subscribe domain events qua BullMQ

import { Queue, Worker, type Job, type ConnectionOptions } from "bullmq";
import { prisma } from "@vsme/db/client";
import type { Prisma } from "@vsme/db";
import type { PublishEventParams, DomainEventType } from "./types";

// ─── Queue Names ─────────────────────────────────────────────────────────────
export const QUEUE_NAMES = {
  EVENTS: "events",
  AI_TASKS: "ai-tasks",
  NOTIFICATIONS: "notifications",
  REPORTS: "reports",
  TCT_SYNC: "tct-sync",
} as const;

// ─── Connection ───────────────────────────────────────────────────────────────
function getRedisConnection(): ConnectionOptions {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  // Parse redis://[:password@]host[:port]
  const parsed = new URL(url);
  return {
    host: parsed.hostname || "localhost",
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

// Lazy initialization
let _eventsQueue: Queue | null = null;
let _notificationsQueue: Queue | null = null;
let _aiTasksQueue: Queue | null = null;
let _reportsQueue: Queue | null = null;

function getEventsQueue(): Queue {
  if (!_eventsQueue) {
    _eventsQueue = new Queue(QUEUE_NAMES.EVENTS, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return _eventsQueue;
}

export function getNotificationsQueue(): Queue {
  if (!_notificationsQueue) {
    _notificationsQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      },
    });
  }
  return _notificationsQueue;
}

export function getAiTasksQueue(): Queue {
  if (!_aiTasksQueue) {
    _aiTasksQueue = new Queue(QUEUE_NAMES.AI_TASKS, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "fixed", delay: 5000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return _aiTasksQueue;
}

export function getReportsQueue(): Queue {
  if (!_reportsQueue) {
    _reportsQueue = new Queue(QUEUE_NAMES.REPORTS, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "fixed", delay: 10000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return _reportsQueue;
}

// ─── Publish Event ─────────────────────────────────────────────────────────────

/**
 * Phát domain event:
 * 1. Lưu vào DB (DomainEvent table)
 * 2. Đưa vào BullMQ queue để process async
 */
export async function publishEvent(params: PublishEventParams): Promise<string> {
  // Lưu vào DB trước
  const event = await prisma.domainEvent.create({
    data: {
      companyId: params.companyId,
      eventType: params.eventType,
      sourceModule: params.sourceModule,
      payload: params.payload as unknown as Prisma.InputJsonValue,
      status: "pending",
    },
  });

  // Đưa vào queue
  try {
    await getEventsQueue().add(
      params.eventType,
      {
        eventId: event.id,
        companyId: params.companyId,
        eventType: params.eventType,
        sourceModule: params.sourceModule,
        payload: params.payload,
      },
      { jobId: event.id }
    );
  } catch (queueError) {
    // Queue lỗi nhưng event đã lưu DB → sẽ retry sau
    console.error("[EventBus] Failed to queue event:", queueError);
  }

  return event.id;
}

// ─── Event Handler Type ──────────────────────────────────────────────────────

export type EventHandler = (job: Job<{
  eventId: string;
  companyId: string;
  eventType: string;
  sourceModule: string;
  payload: Record<string, unknown>;
}>) => Promise<void>;

// ─── Subscribe (Worker) ───────────────────────────────────────────────────────

/**
 * Handler registry: eventType → handlers[]
 */
const eventHandlers = new Map<string, EventHandler[]>();

export function onEvent(eventType: DomainEventType, handler: EventHandler): void {
  const existing = eventHandlers.get(eventType) ?? [];
  eventHandlers.set(eventType, [...existing, handler]);
}

export function onEventPattern(pattern: string, handler: EventHandler): void {
  // Pattern matching: "invoice.*" matches "invoice.outgoing.confirmed"
  // Simple prefix match
  const existing = eventHandlers.get(`pattern:${pattern}`) ?? [];
  eventHandlers.set(`pattern:${pattern}`, [...existing, handler]);
}

/**
 * Khởi động Event Worker — chỉ gọi từ ai-worker app, không gọi từ Next.js
 */
export function startEventWorker(concurrency = 20): Worker {
  const worker = new Worker(
    QUEUE_NAMES.EVENTS,
    async (job) => {
      const { eventId, eventType, companyId } = job.data;

      try {
        // Cập nhật status → processing
        await prisma.domainEvent.update({
          where: { id: eventId },
          data: { status: "processing", attempts: { increment: 1 } },
        });

        // Chạy handlers phù hợp
        const handlers = eventHandlers.get(eventType) ?? [];
        const patternHandlers: EventHandler[] = [];

        for (const [key, hs] of eventHandlers.entries()) {
          if (key.startsWith("pattern:")) {
            const pattern = key.slice("pattern:".length);
            if (eventType.startsWith(pattern.replace("*", ""))) {
              patternHandlers.push(...hs);
            }
          }
        }

        const allHandlers = [...handlers, ...patternHandlers];

        // Chạy song song tất cả handlers
        await Promise.allSettled(allHandlers.map(h => h(job)));

        // Cập nhật → processed
        await prisma.domainEvent.update({
          where: { id: eventId },
          data: { status: "processed", processedAt: new Date() },
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        await prisma.domainEvent.update({
          where: { id: eventId },
          data: { status: "failed", lastError: errorMsg },
        }).catch(() => {}); // Ignore update error

        throw error; // Re-throw để BullMQ retry
      }
    },
    {
      connection: getRedisConnection(),
      concurrency,
    }
  );

  worker.on("failed", async (job, error) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
      // Dead letter
      await prisma.domainEvent.update({
        where: { id: job.data.eventId as string },
        data: { status: "dead_letter", lastError: error.message },
      }).catch(() => {});
    }
  });

  console.log(`[EventBus] Worker started (concurrency: ${concurrency})`);
  return worker;
}
