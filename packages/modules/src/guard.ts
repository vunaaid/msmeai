// packages/modules/src/guard.ts
// Module Access Guard — middleware kiểm tra module có được bật không

import { prisma } from "@vsme/db/client";
import type { ModuleKey } from "./types";

/**
 * Cache module status per company (in-memory, TTL 30s)
 * Trong production nên dùng Redis cache
 */
const moduleCache = new Map<string, { enabled: Set<ModuleKey>; expiry: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Lấy danh sách modules đang bật cho một company.
 * Có cache để tránh query DB liên tục.
 */
export async function getEnabledModules(companyId: string): Promise<Set<ModuleKey>> {
  const cached = moduleCache.get(companyId);
  if (cached && cached.expiry > Date.now()) {
    return cached.enabled;
  }

  const configs = await prisma.moduleConfig.findMany({
    where: { companyId, enabled: true },
    select: { moduleKey: true },
  });

  const enabled = new Set(configs.map(c => c.moduleKey as ModuleKey));
  moduleCache.set(companyId, { enabled, expiry: Date.now() + CACHE_TTL_MS });

  return enabled;
}

/**
 * Xóa cache của company (gọi sau khi toggle module)
 */
export function invalidateModuleCache(companyId: string): void {
  moduleCache.delete(companyId);
}

/**
 * Kiểm tra module có được bật không.
 */
export async function isModuleEnabled(
  companyId: string,
  moduleKey: ModuleKey
): Promise<boolean> {
  // foundation, admin và work luôn bật (work là module mặc định cho mọi user)
  if (moduleKey === "foundation" || moduleKey === "admin" || moduleKey === "work") return true;

  const enabled = await getEnabledModules(companyId);
  return enabled.has(moduleKey);
}

/**
 * Throw error nếu module không được bật.
 * Dùng trong API route handlers.
 */
export async function requireModule(
  companyId: string,
  moduleKey: ModuleKey
): Promise<void> {
  const enabled = await isModuleEnabled(companyId, moduleKey);
  if (!enabled) {
    throw new ModuleDisabledError(moduleKey);
  }
}

export class ModuleDisabledError extends Error {
  public readonly moduleKey: ModuleKey;
  public readonly statusCode = 403;

  constructor(moduleKey: ModuleKey) {
    super(`Module '${moduleKey}' is not enabled for this company`);
    this.name = "ModuleDisabledError";
    this.moduleKey = moduleKey;
  }
}
