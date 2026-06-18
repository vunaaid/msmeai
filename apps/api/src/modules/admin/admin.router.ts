// src/modules/admin/admin.router.ts
// GET /admin/audit                        — audit logs
// GET /admin/modules                      — danh sách modules
// PUT /admin/modules/:key/toggle          — bật/tắt module

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import { AuditAction } from "@vsme/db";
import { queryAuditLogs } from "@vsme/audit/audit-log";
import { publishEvent } from "@vsme/audit/event-bus";
import { writeAuditLog } from "@vsme/audit/audit-log";
import { MODULE_REGISTRY, canEnableModule, canDisableModule } from "@vsme/modules/registry";
import { invalidateModuleCache } from "@vsme/modules/guard";
import { requireAuth } from "../../middleware/auth.js";
import {
  ok, notFound, badRequest, forbidden, wrap,
} from "../../lib/response.js";
import { assertPermission, getCompanyScope } from "../../lib/rbac.js";
import { qs, qi, param } from "../../lib/query.js";
import type { ModuleKey } from "@vsme/modules/types";

const router = Router();

// ─── GET /admin/audit ────────────────────────────────────────────────────────

router.get("/audit", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "read");

  const page       = qi(req.query["page"], 1);
  const limit      = Math.min(qi(req.query["limit"], 50), 200);
  const moduleKey  = qs(req.query["module"]);
  const entityType = qs(req.query["entityType"]);
  const entityId   = qs(req.query["entityId"]);
  const userId     = qs(req.query["userId"]);
  const fromStr    = qs(req.query["from"]);
  const toStr      = qs(req.query["to"]);
  const fromDate   = fromStr ? new Date(fromStr) : undefined;
  const toDate     = toStr   ? new Date(toStr)   : undefined;
  const companyId  = getCompanyScope(user, qs(req.query["companyId"]));

  const result = await queryAuditLogs({
    companyId, moduleKey, entityType, entityId, userId,
    fromDate, toDate, page, limit,
  });

  return ok(res, result.data, { total: result.total, page, limit });
}));

// ─── GET /admin/modules ───────────────────────────────────────────────────────

router.get("/modules", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  assertPermission(user, "admin", "read");

  const companyId = getCompanyScope(user, qs(req.query["companyId"]));
  if (!companyId) return forbidden(res, "Specify ?companyId= to query a specific company");

  const dbConfigs = await prisma.moduleConfig.findMany({ where: { companyId } });
  const configMap = new Map(dbConfigs.map(c => [c.moduleKey, c]));

  const enabledModules = new Set([
    "foundation" as ModuleKey,
    "admin" as ModuleKey,
    "work" as ModuleKey,
    ...dbConfigs.filter(c => c.enabled).map(c => c.moduleKey as ModuleKey),
  ]);

  const modules = Object.values(MODULE_REGISTRY).map(def => {
    const config = configMap.get(def.key);
    const enabled = def.key === "foundation" || def.key === "admin" || def.key === "work"
      ? true
      : (config?.enabled ?? false);

    const { allowed: canEnable, missingDeps }          = canEnableModule(def.key, enabledModules);
    const { allowed: canDisable, blockingDependents }  = canDisableModule(def.key, enabledModules);

    return {
      key: def.key, name: def.name, description: def.description,
      tier: def.tier, icon: def.icon, route: def.route,
      dependencies: def.dependencies,
      enabled,
      canEnable:  !enabled && canEnable,
      canDisable:  enabled && canDisable && def.canDisable,
      missingDeps, blockingDependents,
      settings:  config?.settings ?? {},
      enabledAt: config?.enabledAt,
    };
  });

  return ok(res, modules);
}));

// ─── PUT /admin/modules/:key/toggle ──────────────────────────────────────────

const toggleSchema = z.object({ enabled: z.boolean() });

router.put("/modules/:key/toggle", requireAuth, wrap(async (req, res) => {
  const user      = req.user!;
  assertPermission(user, "admin", "configure");

  const moduleKey = param(req.params["key"]) as ModuleKey;
  const companyId = getCompanyScope(user, qs(req.query["companyId"]));
  if (!companyId) return forbidden(res, "Specify ?companyId= to target a specific company");

  const def = MODULE_REGISTRY[moduleKey];
  if (!def) return notFound(res, `Module '${moduleKey}'`);
  if (!def.canDisable) return badRequest(res, `Module '${def.name}' không thể tắt`);

  const { enabled } = toggleSchema.parse(req.body);

  const enabledConfigs = await prisma.moduleConfig.findMany({
    where: { companyId, enabled: true },
    select: { moduleKey: true },
  });
  const enabledSet = new Set<ModuleKey>([
    "foundation", "admin",
    ...enabledConfigs.map(c => c.moduleKey as ModuleKey),
  ]);

  if (enabled) {
    const { allowed, missingDeps } = canEnableModule(moduleKey, enabledSet);
    if (!allowed) {
      const depNames = missingDeps.map(d => MODULE_REGISTRY[d]?.name ?? d).join(", ");
      return badRequest(res, `Cần bật trước: ${depNames}`);
    }
  } else {
    const { allowed, blockingDependents } = canDisableModule(moduleKey, enabledSet);
    if (!allowed) {
      const depNames = blockingDependents.map(d => MODULE_REGISTRY[d]?.name ?? d).join(", ");
      return badRequest(res, `Không thể tắt — đang được dùng bởi: ${depNames}`);
    }
  }

  const updated = await prisma.moduleConfig.upsert({
    where:  { companyId_moduleKey: { companyId, moduleKey } },
    update: {
      enabled,
      ...(enabled
        ? { enabledAt: new Date(), enabledBy: user.id, disabledAt: null, disabledBy: null }
        : { disabledAt: new Date(), disabledBy: user.id }),
    },
    create: {
      companyId, moduleKey, enabled,
      tier: def.tier as "core" | "extended" | "ai",
      enabledAt: enabled ? new Date() : null,
      enabledBy: enabled ? user.id    : null,
    },
  });

  invalidateModuleCache(companyId);

  await writeAuditLog({
    context: { companyId, userId: user.id, moduleKey: "admin" },
    action:     AuditAction.toggle_module,
    entityType: "ModuleConfig",
    entityId:   updated.id,
    dataAfter:  { moduleKey, enabled },
  });

  await publishEvent({
    companyId,
    eventType:    enabled ? "module.enabled" : "module.disabled",
    sourceModule: "admin",
    payload:      { moduleKey, enabledBy: user.id },
  }).catch(() => {});

  return ok(res, {
    moduleKey, enabled,
    message: `Module '${def.name}' đã ${enabled ? "bật" : "tắt"} thành công`,
  });
}));

export default router;
