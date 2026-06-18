// src/modules/projects/projects.router.ts
// GET  /projects        — danh sách dự án
// POST /projects        — tạo dự án mới
// GET  /projects/:id    — chi tiết dự án
// PATCH /projects/:id   — cập nhật dự án

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import { requireAuth } from "../../middleware/auth.js";
import { ok, created, notFound, badRequest, wrap } from "../../lib/response.js";
import { qs, qi, param } from "../../lib/query.js";
import type { WorkItemPriority, ProjectStatus } from "@vsme/db";

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createProjectSchema = z.object({
  title:       z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  managerId:   z.string().uuid().optional(), // mặc định = người tạo (xem handler)
  priority:    z.enum(["urgent","high","normal","low"]).default("normal"),
  startDate:   z.string().datetime().optional(),
  dueDate:     z.string().datetime().optional(),
});

const updateProjectSchema = z.object({
  title:       z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional(),
  managerId:   z.string().uuid().optional(),
  status:      z.enum(["planning","active","on_hold","completed","cancelled"]).optional(),
  priority:    z.enum(["urgent","high","normal","low"]).optional(),
  startDate:   z.string().datetime().nullable().optional(),
  dueDate:     z.string().datetime().nullable().optional(),
});

// ─── GET /projects ────────────────────────────────────────────────────────────

router.get("/", requireAuth, wrap(async (req, res) => {
  const user   = req.user!;
  const status = qs(req.query["status"]);
  const view   = qs(req.query["view"]) ?? "all";
  const page   = Math.max(1, qi(req.query["page"], 1));
  const limit  = Math.min(50, qi(req.query["limit"], 20));

  const where = {
    companyId: user.companyId,
    ...(status ? { status: status as ProjectStatus } : {}),
    ...(view === "mine"    ? { members:   { some: { userId: user.id } } } : {}),
    ...(view === "managed" ? { managerId: user.id }                       : {}),
  };

  const [total, projects] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        manager: { select: { id: true, name: true, avatarUrl: true } },
        creator: { select: { id: true, name: true } },
        _count:  { select: { workItems: true, members: true } },
      },
    }),
  ]);

  return ok(res, projects, { total, page, limit });
}));

// ─── POST /projects ───────────────────────────────────────────────────────────

router.post("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const data = createProjectSchema.parse(req.body);

  // Người tạo dự án mặc định là người phụ trách (quản lý). Có thể chỉ định
  // người khác qua managerId (vd: admin giao cho người khác).
  const managerId = data.managerId ?? user.id;

  const manager = await prisma.user.findFirst({
    where: { id: managerId, companyId: user.companyId, isActive: true },
  });
  if (!manager) return badRequest(res, "Người phụ trách không thuộc công ty bạn");

  const project = await prisma.project.create({
    data: {
      companyId:   user.companyId,
      title:       data.title,
      description: data.description,
      managerId,
      priority:    data.priority as WorkItemPriority,
      startDate:   data.startDate ? new Date(data.startDate) : undefined,
      dueDate:     data.dueDate   ? new Date(data.dueDate)   : undefined,
      createdBy:   user.id,
      status:      "planning" as ProjectStatus,
      members: {
        createMany: {
          data: [
            { userId: user.id, role: "manager" },
            ...(managerId !== user.id
              ? [{ userId: managerId, role: "manager" }]
              : []),
          ],
          skipDuplicates: true,
        },
      },
    },
    include: {
      manager: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      _count:  { select: { workItems: true, members: true } },
    },
  });

  return created(res, project);
}));

// ─── GET /projects/:id ────────────────────────────────────────────────────────

router.get("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;

  const project = await prisma.project.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId },
    include: {
      manager: { select: { id: true, name: true, avatarUrl: true } },
      creator: { select: { id: true, name: true } },
      members: {
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { addedAt: "asc" },
      },
      epics:   { orderBy: { order: "asc" }, include: { _count: { select: { workItems: true } } } },
      sprints: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], include: { _count: { select: { workItems: true } } } },
      _count:  { select: { workItems: true, members: true } },
    },
  });

  if (!project) return notFound(res, "Dự án");
  return ok(res, project);
}));

// ─── PATCH /projects/:id ──────────────────────────────────────────────────────

router.patch("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const id   = param(param(req.params["id"]));

  const project = await prisma.project.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!project) return notFound(res, "Dự án");

  const data = updateProjectSchema.parse(req.body);

  if (data.managerId) {
    const manager = await prisma.user.findFirst({
      where: { id: data.managerId, companyId: user.companyId, isActive: true },
    });
    if (!manager) return badRequest(res, "Người phụ trách không thuộc công ty bạn");
  }

  const updated = await prisma.project.update({
    where: { id },
    data: {
      ...(data.title       !== undefined && { title:       data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.managerId   !== undefined && { managerId:   data.managerId }),
      ...(data.status      !== undefined && { status:      data.status as ProjectStatus }),
      ...(data.priority    !== undefined && { priority:    data.priority as WorkItemPriority }),
      ...(data.startDate   !== undefined && { startDate:   data.startDate ? new Date(data.startDate) : null }),
      ...(data.dueDate     !== undefined && { dueDate:     data.dueDate   ? new Date(data.dueDate)   : null }),
    },
    include: {
      manager: { select: { id: true, name: true } },
      _count:  { select: { workItems: true, members: true } },
    },
  });

  return ok(res, updated);
}));

// ─── Helper: xác nhận dự án thuộc công ty user ─────────────────────────────────

async function ensureProject(companyId: string, projectId: string) {
  return prisma.project.findFirst({ where: { id: projectId, companyId } });
}

// ─── GET /projects/:id/items ───────────────────────────────────────────────────
// Toàn bộ công việc của dự án (mọi cấp) — phục vụ Kanban / Danh sách / Timeline.

router.get("/:id/items", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const projectId = param(req.params["id"]);

  const project = await ensureProject(user.companyId, projectId);
  if (!project) return notFound(res, "Dự án");

  const items = await prisma.workItem.findMany({
    where: { projectId, companyId: user.companyId },
    orderBy: [{ boardOrder: "asc" }, { createdAt: "asc" }],
    include: {
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      creator:  { select: { id: true, name: true } },
      epic:     { select: { id: true, title: true, color: true } },
      sprint:   { select: { id: true, name: true } },
      _count:   { select: { children: true, comments: true } },
    },
  });

  return ok(res, items);
}));

// ─── Sprints ───────────────────────────────────────────────────────────────────

const sprintSchema = z.object({
  name:      z.string().min(1).max(120),
  goal:      z.string().max(500).optional(),
  status:    z.enum(["planned", "active", "completed"]).optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate:   z.string().datetime().nullable().optional(),
  order:     z.number().int().optional(),
});

router.post("/:id/sprints", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const projectId = param(req.params["id"]);
  const project = await ensureProject(user.companyId, projectId);
  if (!project) return notFound(res, "Dự án");

  const data = sprintSchema.parse(req.body);
  const sprint = await prisma.sprint.create({
    data: {
      companyId: user.companyId,
      projectId,
      name:      data.name,
      goal:      data.goal,
      status:    data.status ?? "planned",
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate:   data.endDate ? new Date(data.endDate) : undefined,
      order:     data.order ?? 0,
    },
  });
  return created(res, sprint);
}));

router.patch("/:id/sprints/:sid", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const projectId = param(req.params["id"]);
  const sid = param(req.params["sid"]);
  const project = await ensureProject(user.companyId, projectId);
  if (!project) return notFound(res, "Dự án");

  const data = sprintSchema.partial().parse(req.body);
  const result = await prisma.sprint.updateMany({
    where: { id: sid, projectId, companyId: user.companyId },
    data: {
      ...(data.name      !== undefined && { name:      data.name }),
      ...(data.goal      !== undefined && { goal:      data.goal }),
      ...(data.status    !== undefined && { status:    data.status }),
      ...(data.order     !== undefined && { order:     data.order }),
      ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
      ...(data.endDate   !== undefined && { endDate:   data.endDate ? new Date(data.endDate) : null }),
    },
  });
  if (result.count === 0) return notFound(res, "Sprint");
  const sprint = await prisma.sprint.findUnique({ where: { id: sid } });
  return ok(res, sprint);
}));

router.delete("/:id/sprints/:sid", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const projectId = param(req.params["id"]);
  const sid = param(req.params["sid"]);
  const project = await ensureProject(user.companyId, projectId);
  if (!project) return notFound(res, "Dự án");

  // Gỡ việc khỏi sprint trước khi xoá (không xoá việc)
  await prisma.workItem.updateMany({ where: { sprintId: sid, companyId: user.companyId }, data: { sprintId: null } });
  const result = await prisma.sprint.deleteMany({ where: { id: sid, projectId, companyId: user.companyId } });
  if (result.count === 0) return notFound(res, "Sprint");
  return ok(res, { id: sid });
}));

// ─── Epics ───────────────────────────────────────────────────────────────────

const epicSchema = z.object({
  title:       z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  color:       z.string().max(20).optional(),
  status:      z.enum(["open", "done"]).optional(),
  order:       z.number().int().optional(),
});

router.post("/:id/epics", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const projectId = param(req.params["id"]);
  const project = await ensureProject(user.companyId, projectId);
  if (!project) return notFound(res, "Dự án");

  const data = epicSchema.parse(req.body);
  const epic = await prisma.epic.create({
    data: {
      companyId:   user.companyId,
      projectId,
      title:       data.title,
      description: data.description,
      color:       data.color ?? "#6366f1",
      status:      data.status ?? "open",
      order:       data.order ?? 0,
      createdBy:   user.id,
    },
  });
  return created(res, epic);
}));

router.patch("/:id/epics/:eid", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const projectId = param(req.params["id"]);
  const eid = param(req.params["eid"]);
  const project = await ensureProject(user.companyId, projectId);
  if (!project) return notFound(res, "Dự án");

  const data = epicSchema.partial().parse(req.body);
  const result = await prisma.epic.updateMany({
    where: { id: eid, projectId, companyId: user.companyId },
    data: {
      ...(data.title       !== undefined && { title:       data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.color       !== undefined && { color:       data.color }),
      ...(data.status      !== undefined && { status:      data.status }),
      ...(data.order       !== undefined && { order:       data.order }),
    },
  });
  if (result.count === 0) return notFound(res, "Epic");
  const epic = await prisma.epic.findUnique({ where: { id: eid } });
  return ok(res, epic);
}));

router.delete("/:id/epics/:eid", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const projectId = param(req.params["id"]);
  const eid = param(req.params["eid"]);
  const project = await ensureProject(user.companyId, projectId);
  if (!project) return notFound(res, "Dự án");

  await prisma.workItem.updateMany({ where: { epicId: eid, companyId: user.companyId }, data: { epicId: null } });
  const result = await prisma.epic.deleteMany({ where: { id: eid, projectId, companyId: user.companyId } });
  if (result.count === 0) return notFound(res, "Epic");
  return ok(res, { id: eid });
}));

export default router;
