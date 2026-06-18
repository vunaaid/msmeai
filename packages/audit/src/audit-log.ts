// packages/audit/src/audit-log.ts
// Audit Log Service — ghi log mọi write operation

import { prisma } from "@vsme/db/client";
import type { Prisma } from "@vsme/db";
import type { WriteAuditLogParams } from "./types";

/**
 * Ghi audit log.
 * - Không throw error nếu audit thất bại (không block main flow).
 * - Append-only: không có update/delete.
 */
export async function writeAuditLog(params: WriteAuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        companyId: params.context.companyId,
        userId: params.context.userId,
        action: params.action,
        moduleKey: params.context.moduleKey,
        entityType: params.entityType,
        entityId: params.entityId,
        dataBefore: (params.dataBefore ?? undefined) as Prisma.InputJsonValue | undefined,
        dataAfter: (params.dataAfter ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: params.context.ipAddress,
        userAgent: params.context.userAgent,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    // Log to console but don't rethrow — audit failure shouldn't break main flow
    console.error("[AuditLog] Failed to write audit log:", error);
  }
}

/**
 * Query audit logs với filter.
 */
export async function queryAuditLogs(params: {
  companyId?: string;
  moduleKey?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  limit?: number;
}) {
  const {
    companyId,
    moduleKey,
    entityType,
    entityId,
    userId,
    fromDate,
    toDate,
    page = 1,
    limit = 50,
  } = params;

  const where = {
    ...(companyId ? { companyId } : {}),
    ...(moduleKey && { moduleKey }),
    ...(entityType && { entityType }),
    ...(entityId && { entityId }),
    ...(userId && { userId }),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate && { gte: fromDate }),
            ...(toDate && { lte: toDate }),
          },
        }
      : {}),
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return { total, page, limit, data: logs };
}
