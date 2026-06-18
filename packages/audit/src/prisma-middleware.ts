// packages/audit/src/prisma-middleware.ts
// Prisma Extension — tự động ghi audit log cho mọi write operation

import { Prisma } from "@vsme/db/client";
import { writeAuditLog } from "./audit-log";
import type { AuditContext } from "./types";
import { AuditAction } from "@vsme/db";

// Map Prisma action → AuditAction
function mapAction(prismaAction: string): AuditAction | null {
  const map: Record<string, AuditAction> = {
    create: AuditAction.create,
    createMany: AuditAction.create,
    update: AuditAction.update,
    updateMany: AuditAction.update,
    upsert: AuditAction.update,
    delete: AuditAction.delete,
    deleteMany: AuditAction.delete,
  };
  return map[prismaAction] ?? null;
}

// Models bỏ qua (audit chính chúng sẽ tạo infinite loop)
const SKIP_MODELS = new Set(["AuditLog", "Session", "DomainEvent"]);

// Models chứa sensitive data — chỉ log action, không log data
const SENSITIVE_MODELS = new Set(["User"]);

/**
 * Context store — lưu context theo async local storage
 * Trong production dùng AsyncLocalStorage cho thread-safety
 */
let _currentContext: AuditContext | null = null;

export function setAuditContext(context: AuditContext): void {
  _currentContext = context;
}

export function clearAuditContext(): void {
  _currentContext = null;
}

/**
 * Prisma extension để tự động audit log.
 * Usage: const xprisma = prisma.$extends(auditExtension)
 */
export const auditExtension = Prisma.defineExtension({
  name: "audit-log",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const auditAction = mapAction(operation);

        // Skip nếu không phải write operation hoặc model trong blacklist
        if (!auditAction || !model || SKIP_MODELS.has(model)) {
          return query(args);
        }

        const context = _currentContext;
        if (!context) {
          // Không có context → vẫn thực hiện query nhưng không audit
          return query(args);
        }

        // Lấy data trước khi thay đổi (cho update/delete)
        let dataBefore: Record<string, unknown> | null = null;

        if (
          (auditAction === AuditAction.update || auditAction === AuditAction.delete) &&
          !SENSITIVE_MODELS.has(model)
        ) {
          try {
            const whereClause = (args as { where?: unknown }).where;
            if (whereClause && typeof whereClause === "object" && "id" in whereClause) {
              // @ts-expect-error — dynamic model access
              dataBefore = await (query as unknown as ReturnType<typeof Prisma.defineExtension>);
            }
          } catch {
            // Ignore — không cần thiết phải có dataBefore
          }
        }

        // Thực hiện query
        const result = await query(args);

        // Ghi audit log async (không block main flow)
        const entityId =
          (result as { id?: string })?.id ??
          (args as { where?: { id?: string } }).where?.id ??
          "unknown";

        writeAuditLog({
          context,
          action: auditAction,
          entityType: model,
          entityId: String(entityId),
          dataBefore: SENSITIVE_MODELS.has(model) ? null : dataBefore,
          dataAfter: SENSITIVE_MODELS.has(model) ? null : (result as Record<string, unknown>),
        }).catch(err => console.error("[AuditExtension] Error:", err));

        return result;
      },
    },
  },
});

/**
 * Helper: Wrap một async function với audit context.
 *
 * @example
 * await withAuditContext(
 *   { companyId, userId, moduleKey: 'gl', ipAddress },
 *   async () => {
 *     await prisma.journal.create({ ... }); // ← tự động audit
 *   }
 * )
 */
export async function withAuditContext<T>(
  context: AuditContext,
  fn: () => Promise<T>
): Promise<T> {
  setAuditContext(context);
  try {
    return await fn();
  } finally {
    clearAuditContext();
  }
}
