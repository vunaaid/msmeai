// src/modules/work/work.router.ts
// GET  /work                  — danh sách công việc
// POST /work                  — tạo công việc
// GET  /work/:id              — chi tiết công việc
// PUT  /work/:id              — cập nhật công việc
// POST /work/:id/approve      — duyệt breakdown
// POST /work/:id/comments     — thêm bình luận
// GET  /work/:id/breakdown    — AI breakdown (xem)

import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { prisma } from "@vsme/db/client";
import { requireAuth } from "../../middleware/auth.js";
import {
  ok, created, notFound, badRequest, forbidden, wrap,
} from "../../lib/response.js";
import { qs, qi, param } from "../../lib/query.js";
import { getAssignableUsers } from "../../lib/hierarchy.js";
import { notifyUsers } from "../../lib/notify.js";
import { ensureQueueRunning } from "../../lib/agent-exec.js";
import {
  buildStoragePath, uploadBuffer, getPresignedUrl, removeObject,
} from "@vsme/storage";
import type { WorkItemStatus, WorkItemPriority, WorkType, Prisma } from "@vsme/db";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createWorkSchema = z.object({
  title:           z.string().min(2).max(200),
  description:     z.string().max(2000).optional(),
  note:            z.string().max(2000).optional(),
  workType:        z.enum(["operational", "project_task"]).default("operational"),
  projectId:       z.string().uuid().optional(),
  parentId:        z.string().uuid().optional(),
  assignedTo:      z.string().uuid().optional(),
  priority:        z.enum(["urgent", "high", "normal", "low"]).default("normal"),
  dueDate:         z.string().datetime().optional(),
  requireApproval: z.boolean().default(false),
  // Jira-style (tuỳ chọn — khi tạo việc trong dự án)
  epicId:          z.string().uuid().optional(),
  sprintId:        z.string().uuid().optional(),
  storyPoints:     z.number().int().min(0).max(999).optional(),
  status:          z.enum(["draft","active","in_progress","completed"]).optional(),
});

const updateSchema = z.object({
  title:          z.string().min(2).max(200).optional(),
  description:    z.string().max(2000).optional(),
  note:           z.string().max(2000).nullable().optional(),
  status:         z.enum(["draft","pending_approval","active","in_progress","completed","cancelled"]).optional(),
  priority:       z.enum(["urgent","high","normal","low"]).optional(),
  assignedTo:     z.string().uuid().nullable().optional(),
  dueDate:        z.string().datetime().nullable().optional(),
  completionNote: z.string().max(1000).optional(),
  // Jira-style — gán epic/sprint, ước lượng, thứ tự thẻ Kanban (kéo-thả)
  epicId:         z.string().uuid().nullable().optional(),
  sprintId:       z.string().uuid().nullable().optional(),
  storyPoints:    z.number().int().min(0).max(999).nullable().optional(),
  boardOrder:     z.number().int().optional(),
});

const approveSchema = z.object({
  breakdown: z.array(z.object({
    title:         z.string().min(1),
    description:   z.string().optional(),
    assignedTo:    z.string().uuid().optional(),
    priority:      z.enum(["urgent","high","normal","low"]).default("normal"),
    estimatedDays: z.number().int().min(1).optional(),
    dueDate:       z.string().datetime().optional(),
  })).optional(),
});

const commentSchema = z.object({
  content: z.string().min(1).max(1000),
});

// ─── GET /work ────────────────────────────────────────────────────────────────

// Nhóm trạng thái "đang xử lý" (đã giao/đang làm) — dùng để tách 3 nhóm tiến độ.
const ACTIVE_STATUSES: WorkItemStatus[] = ["active", "in_progress"];
type Bucket = "in_progress" | "overdue" | "completed";

// Điều kiện lọc theo nhóm tiến độ (sub-tab). "Quá hạn" suy ra từ dueDate < nay
// trên các việc đang xử lý (không tính việc đã hoàn thành/huỷ).
function bucketWhere(bucket: Bucket, now: Date) {
  switch (bucket) {
    case "completed":
      return { status: "completed" as WorkItemStatus };
    case "overdue":
      return { status: { in: ACTIVE_STATUSES }, dueDate: { lt: now } };
    case "in_progress":
    default:
      return {
        status: { in: ACTIVE_STATUSES },
        OR: [{ dueDate: null }, { dueDate: { gte: now } }],
      };
  }
}

router.get("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const view      = qs(req.query["view"]) ?? "assigned_to_me";
  const status    = qs(req.query["status"]);
  const projectId = qs(req.query["projectId"]);
  const workType  = qs(req.query["workType"]);
  const page      = Math.max(1, qi(req.query["page"], 1));
  const limit     = Math.min(50, qi(req.query["limit"], 20));

  const baseWhere = {
    companyId: user.companyId,
    parentId: null,
    ...(status    ? { status:   status as WorkItemStatus }   : {}),
    ...(projectId ? { projectId }                             : {}),
    ...(workType  ? { workType: workType as WorkType }        : {}),
  };

  // viewFilter có thể chứa OR (vd project_tasks) → gom mọi điều kiện vào AND
  // để không bị ghi đè key OR khi kết hợp với bucket.
  const viewFilter =
    view === "assigned_to_me"    ? { assignedTo: user.id } :
    view === "created_by_me"     ? { createdBy:  user.id } :
    view === "pending_approval"  ? { status: "pending_approval" as WorkItemStatus, createdBy: user.id } :
    view === "project_tasks"     ? { workType: "project_task" as WorkType, OR: [{ assignedTo: user.id }, { createdBy: user.id }] } :
    {};

  // Các view phân theo nhóm tiến độ (sub-tab) — Chờ duyệt/khác giữ danh sách phẳng.
  const BUCKET_VIEWS = ["assigned_to_me", "created_by_me", "project_tasks"];
  const supportsBuckets = BUCKET_VIEWS.includes(view);

  const now = new Date();
  const bucket: Bucket = ((): Bucket => {
    const b = qs(req.query["bucket"]);
    return b === "overdue" || b === "completed" || b === "in_progress" ? b : "in_progress";
  })();

  const where = supportsBuckets
    ? { ...baseWhere, AND: [viewFilter, bucketWhere(bucket, now)] }
    : { ...baseWhere, ...viewFilter };

  // Đếm 3 nhóm tiến độ (chỉ với view hỗ trợ) — tính trên toàn bộ scope, không phụ
  // thuộc bucket đang chọn hay phân trang, để hiển thị số trên từng sub-tab.
  const countWhere = (b: Bucket) => ({ ...baseWhere, AND: [viewFilter, bucketWhere(b, now)] });
  const countsP = supportsBuckets
    ? Promise.all([
        prisma.workItem.count({ where: countWhere("in_progress") }),
        prisma.workItem.count({ where: countWhere("overdue") }),
        prisma.workItem.count({ where: countWhere("completed") }),
      ])
    : Promise.resolve(null);

  const [total, items, countsArr] = await Promise.all([
    prisma.workItem.count({ where }),
    prisma.workItem.findMany({
      where,
      include: {
        creator:  { select: { id: true, name: true, avatarUrl: true } },
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        project:  { select: { id: true, title: true } },
        _count:   { select: { children: true, comments: true } },
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    countsP,
  ]);

  const counts = countsArr
    ? { in_progress: countsArr[0], overdue: countsArr[1], completed: countsArr[2] }
    : undefined;

  return ok(res, items, { total, page, limit, ...(counts ? { counts } : {}) });
}));

// ─── POST /work ───────────────────────────────────────────────────────────────

router.post("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const data = createWorkSchema.parse(req.body);

  if (data.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: data.projectId, companyId: user.companyId },
    });
    if (!project) return badRequest(res, "Dự án không tồn tại hoặc không thuộc công ty bạn");
  }

  if (data.assignedTo) {
    const assignee = await prisma.user.findFirst({
      where: { id: data.assignedTo, companyId: user.companyId, isActive: true },
    });
    if (!assignee) return badRequest(res, "Người nhận không tồn tại hoặc không thuộc công ty bạn");
  }

  const status: WorkItemStatus = data.status
    ? (data.status as WorkItemStatus)
    : data.requireApproval
      ? "pending_approval"
      : data.assignedTo ? "active" : "draft";

  const workItem = await prisma.workItem.create({
    data: {
      companyId:   user.companyId,
      title:       data.title,
      description: data.description,
      note:        data.note,
      workType:    data.workType as WorkType,
      projectId:   data.projectId,
      parentId:    data.parentId,
      assignedTo:  data.assignedTo,
      priority:    data.priority as WorkItemPriority,
      dueDate:     data.dueDate ? new Date(data.dueDate) : undefined,
      epicId:      data.epicId,
      sprintId:    data.sprintId,
      storyPoints: data.storyPoints,
      createdBy:   user.id,
      status,
    },
    include: {
      creator:  { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  });

  // Thông báo (in-app + realtime + web push) khi giao việc cho người khác
  if (data.assignedTo && data.assignedTo !== user.id) {
    void notifyUsers(user.companyId, [data.assignedTo], {
      type:  "work.assigned",
      title: "Bạn được giao việc mới",
      body:  `${user.name} giao cho bạn: ${workItem.title}`,
      url:   `/work/${workItem.id}`,
    });
  }

  return created(res, workItem);
}));

// ─── GET /work/assignees ──────────────────────────────────────────────────────
// Nhân sự mà user hiện tại được phép giao việc: chính mình + cấp dưới.
// Dùng cho dropdown "Giao cho" (không cần quyền admin như /users).

router.get("/assignees", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const list = await getAssignableUsers(user);
  return ok(res, list.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role?.name ?? null,
    isSelf: u.id === user.id,
  })));
}));

// ─── GET /work/:id ────────────────────────────────────────────────────────────

router.get("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;

  const item = await prisma.workItem.findFirst({
    where: { id: param(param(req.params["id"])), companyId: user.companyId },
    include: {
      creator:  { select: { id: true, name: true, avatarUrl: true } },
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      project:  { select: { id: true, title: true, status: true } },
      parent:   { select: { id: true, title: true, status: true } },
      children: {
        include: {
          creator:  { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      comments: {
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!item) return notFound(res, "Công việc");
  return ok(res, item);
}));

// ─── PUT /work/:id ────────────────────────────────────────────────────────────

router.put("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const id   = param(param(req.params["id"]));

  const item = await prisma.workItem.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!item) return notFound(res, "Công việc");

  const isCreator  = item.createdBy === user.id;
  const isAssignee = item.assignedTo === user.id;
  let allowed = isCreator || isAssignee;
  // Việc thuộc dự án: quản lý dự án hoặc thành viên cũng được sửa (để vận hành board)
  if (!allowed && item.projectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: item.projectId,
        companyId: user.companyId,
        OR: [{ managerId: user.id }, { members: { some: { userId: user.id } } }],
      },
      select: { id: true },
    });
    allowed = !!project;
  }
  if (!allowed) return forbidden(res, "Bạn không có quyền chỉnh sửa công việc này");

  const data = updateSchema.parse(req.body);

  if (data.assignedTo) {
    const assignee = await prisma.user.findFirst({
      where: { id: data.assignedTo, companyId: user.companyId, isActive: true },
    });
    if (!assignee) return notFound(res, "Người nhận");
  }

  const now = new Date();
  const updated = await prisma.workItem.update({
    where: { id },
    data: {
      ...(data.title          !== undefined && { title:          data.title }),
      ...(data.description    !== undefined && { description:    data.description }),
      ...(data.note           !== undefined && { note:           data.note }),
      ...(data.priority       !== undefined && { priority:       data.priority as WorkItemPriority }),
      ...(data.assignedTo     !== undefined && { assignedTo:     data.assignedTo }),
      ...(data.completionNote !== undefined && { completionNote: data.completionNote }),
      ...(data.dueDate        !== undefined && { dueDate:        data.dueDate ? new Date(data.dueDate) : null }),
      ...(data.epicId         !== undefined && { epicId:         data.epicId }),
      ...(data.sprintId       !== undefined && { sprintId:       data.sprintId }),
      ...(data.storyPoints    !== undefined && { storyPoints:    data.storyPoints }),
      ...(data.boardOrder     !== undefined && { boardOrder:     data.boardOrder }),
      ...(data.status !== undefined && {
        status: data.status as WorkItemStatus,
        ...(data.status === "in_progress" && !item.startedAt   && { startedAt:   now }),
        ...(data.status === "completed"                         && { completedAt: now }),
        // Mở lại việc đã hoàn thành → xóa mốc hoàn thành cũ (tránh completedAt lỗi thời).
        ...(data.status !== "completed" && item.completedAt     && { completedAt: null }),
      }),
    },
    include: {
      creator:  { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  });

  return ok(res, updated);
}));

// ─── POST /work/:id/approve ───────────────────────────────────────────────────

router.post("/:id/approve", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const id   = param(param(req.params["id"]));

  const item = await prisma.workItem.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!item) return notFound(res, "Công việc");
  if (item.status !== "pending_approval") return badRequest(res, "Công việc không ở trạng thái chờ duyệt");

  const data = approveSchema.parse(req.body);

  type BreakdownItem = {
    title: string;
    description?: string;
    priority?: string;
    estimatedDays?: number;
    assignedTo?: string;
    dueDate?: string;
  };

  const breakdown: BreakdownItem[] =
    data.breakdown ?? (item.aiBreakdown as BreakdownItem[] | null ?? []);

  if (breakdown.length === 0) return badRequest(res, "Không có công việc con để duyệt");

  const assigneeIds = breakdown.map(b => b.assignedTo).filter((x): x is string => !!x);
  if (assigneeIds.length > 0) {
    const validCount = await prisma.user.count({
      where: { id: { in: assigneeIds }, companyId: user.companyId, isActive: true },
    });
    if (validCount < assigneeIds.length) return badRequest(res, "Một số người được giao không thuộc công ty bạn");
  }

  const [updatedParent, subtasks] = await prisma.$transaction(async (tx) => {
    const parent = await tx.workItem.update({
      where: { id },
      data: {
        status:      "active",
        approvedBy:  user.id,
        approvedAt:  new Date(),
        aiBreakdown: breakdown as unknown as Prisma.InputJsonValue,
      },
    });

    const createdItems = await Promise.all(
      breakdown.map(b => {
        const dueDate = b.dueDate
          ? new Date(b.dueDate)
          : b.estimatedDays
            ? new Date(Date.now() + b.estimatedDays * 86_400_000)
            : undefined;

        return tx.workItem.create({
          data: {
            companyId:   user.companyId,
            workType:    item.workType,
            projectId:   item.projectId,
            parentId:    id,
            title:       b.title,
            description: b.description,
            priority:    (b.priority as WorkItemPriority) ?? "normal",
            status:      b.assignedTo ? "active" : "draft",
            createdBy:   user.id,
            assignedTo:  b.assignedTo,
            dueDate,
          },
          include: { assignee: { select: { id: true, name: true } } },
        });
      })
    );

    return [parent, createdItems];
  });

  return ok(res, { parent: updatedParent, subtasks, total: subtasks.length });
}));

// ─── POST /work/:id/reject ────────────────────────────────────────────────────
// Người nhận / quản lý từ chối công việc kèm lý do → cancelled + báo lại người giao.
const rejectSchema = z.object({ reason: z.string().min(1).max(1000) });

router.post("/:id/reject", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const id = param(param(req.params["id"]));
  const { reason } = rejectSchema.parse(req.body);

  const item = await prisma.workItem.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true, title: true, status: true, createdBy: true, assignedTo: true, description: true },
  });
  if (!item) return notFound(res, "Công việc");
  if (item.status === "completed" || item.status === "cancelled") {
    return badRequest(res, "Công việc đã hoàn thành/huỷ — không thể từ chối");
  }
  // Chỉ người nhận, người giao, hoặc admin được từ chối.
  const isAdmin = user.accountType === "company_admin" || user.accountType === "system_admin" || user.isSuperAdmin;
  if (!isAdmin && user.id !== item.assignedTo && user.id !== item.createdBy) {
    return badRequest(res, "Bạn không có quyền từ chối công việc này");
  }

  const updated = await prisma.workItem.update({
    where: { id },
    data: { status: "cancelled", completionNote: `[Từ chối] ${reason}`.slice(0, 2000) },
    select: { id: true, status: true },
  });

  // Báo cho người giao (nếu không phải chính họ từ chối).
  if (item.createdBy && item.createdBy !== user.id) {
    await prisma.notification.create({
      data: {
        companyId: user.companyId, userId: item.createdBy, channel: "inapp", type: "work.rejected",
        title: "Công việc bị từ chối", body: `"${item.title}" — Lý do: ${reason}`.slice(0, 500),
      },
    }).catch(() => {});
  }
  return ok(res, updated);
}));

// ─── POST /work/:id/comments ──────────────────────────────────────────────────

router.post("/:id/comments", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const id   = param(param(req.params["id"]));

  const item = await prisma.workItem.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!item) return notFound(res, "Công việc");

  const { content } = commentSchema.parse(req.body);

  const comment = await prisma.workComment.create({
    data: { workItemId: id, userId: user.id, content },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });

  return created(res, comment);
}));

// ─── File đính kèm ────────────────────────────────────────────────────────────
// Dùng model FileRecord chung: moduleKey="work", entityType="attachment", entityId=workItemId.

// GET /work/:id/attachments — danh sách file đính kèm (kèm link tải tạm thời)
router.get("/:id/attachments", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const id   = param(param(req.params["id"]));

  const item = await prisma.workItem.findFirst({
    where: { id, companyId: user.companyId }, select: { id: true },
  });
  if (!item) return notFound(res, "Công việc");

  const files = await prisma.fileRecord.findMany({
    where: { companyId: user.companyId, moduleKey: "work", entityType: "attachment", entityId: id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { uploader: { select: { id: true, name: true } } },
  });

  const list = await Promise.all(files.map(async (f) => ({
    id: f.id,
    name: f.originalName,
    size: f.size,
    mimeType: f.mimeType,
    createdAt: f.createdAt,
    uploader: f.uploader,
    url: await getPresignedUrl(f.bucket, f.storagePath).catch(() => null),
  })));

  return ok(res, list);
}));

// POST /work/:id/attachments — upload file đính kèm (multipart, field "file")
router.post("/:id/attachments", requireAuth, upload.single("file"), wrap(async (req, res) => {
  const user = req.user!;
  const id   = param(param(req.params["id"]));
  const file = req.file;
  if (!file) return badRequest(res, "Thiếu file upload");

  const item = await prisma.workItem.findFirst({
    where: { id, companyId: user.companyId }, select: { id: true },
  });
  if (!item) return notFound(res, "Công việc");

  const storagePath = buildStoragePath(`${user.companyId}/work/${id}`, file.originalname);
  const { bucket, size } = await uploadBuffer({ storagePath, buffer: file.buffer, mimeType: file.mimetype });

  const record = await prisma.fileRecord.create({
    data: {
      companyId:    user.companyId,
      moduleKey:    "work",
      entityType:   "attachment",
      entityId:     id,
      filename:     storagePath.split("/").pop() ?? file.originalname,
      originalName: file.originalname,
      mimeType:     file.mimetype,
      size,
      storagePath,
      bucket,
      uploadedBy:   user.id,
    },
    include: { uploader: { select: { id: true, name: true } } },
  });

  return created(res, {
    id: record.id,
    name: record.originalName,
    size: record.size,
    mimeType: record.mimeType,
    createdAt: record.createdAt,
    uploader: record.uploader,
    url: await getPresignedUrl(record.bucket, record.storagePath).catch(() => null),
  });
}));

// DELETE /work/:id/attachments/:fileId — gỡ file đính kèm (soft delete + xóa object)
router.delete("/:id/attachments/:fileId", requireAuth, wrap(async (req, res) => {
  const user   = req.user!;
  const id     = param(param(req.params["id"]));
  const fileId = param(param(req.params["fileId"]));

  const record = await prisma.fileRecord.findFirst({
    where: { id: fileId, companyId: user.companyId, moduleKey: "work", entityType: "attachment", entityId: id, deletedAt: null },
  });
  if (!record) return notFound(res, "File đính kèm");
  // Chỉ người tải lên hoặc người giao/nhận việc được gỡ.
  const item = await prisma.workItem.findFirst({
    where: { id, companyId: user.companyId }, select: { createdBy: true, assignedTo: true },
  });
  const canDelete = record.uploadedBy === user.id || item?.createdBy === user.id || item?.assignedTo === user.id;
  if (!canDelete) return forbidden(res, "Bạn không có quyền gỡ file này");

  await prisma.fileRecord.update({ where: { id: fileId }, data: { deletedAt: new Date() } });
  await removeObject(record.bucket, record.storagePath).catch(() => {/* object có thể đã mất — vẫn soft delete */});

  return ok(res, { id: fileId });
}));

// ─── GET /work/:id/breakdown ──────────────────────────────────────────────────

router.get("/:id/breakdown", requireAuth, wrap(async (req, res) => {
  const user = req.user!;

  const item = await prisma.workItem.findFirst({
    where: { id: param(param(req.params["id"])), companyId: user.companyId },
    select: {
      id: true, title: true, status: true, aiBreakdown: true,
      creator:  { select: { id: true, name: true } },
    },
  });

  if (!item) return notFound(res, "Công việc");
  return ok(res, { id: item.id, title: item.title, status: item.status, breakdown: item.aiBreakdown });
}));

// ─── POST /work/batch ────────────────────────────────────────────────────────
// Tạo nhiều công việc cùng lúc (từ đề xuất AI). Người nhận có thể là user hoặc trợ lý AI.
const batchSchema = z.object({
  parentId: z.string().uuid().optional(),   // nếu có → các việc tạo ra là việc con của công việc này
  tasks: z.array(z.object({
    title:        z.string().min(1).max(200),
    description:  z.string().max(2000).optional(),
    assigneeId:   z.string().nullable().optional(),                 // userId hoặc agentId
    assigneeKind: z.enum(["user", "agent"]).default("user"),
    watchers:     z.array(z.string().uuid()).max(20).optional(),    // userId theo dõi
    dueInDays:    z.number().int().min(0).max(365).optional(),
    priority:     z.enum(["urgent", "high", "normal", "low"]).default("normal"),
  })).min(1).max(30),
});

router.post("/batch", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const { tasks, parentId } = batchSchema.parse(req.body);
  const now = Date.now();

  // Nếu tạo việc con: kiểm tra công việc cha thuộc công ty, thừa kế loại việc + dự án.
  let parent: { id: string; workType: WorkType; projectId: string | null; epicId: string | null; sprintId: string | null } | null = null;
  if (parentId) {
    parent = await prisma.workItem.findFirst({
      where: { id: parentId, companyId: user.companyId },
      select: { id: true, workType: true, projectId: true, epicId: true, sprintId: true },
    });
    if (!parent) return badRequest(res, "Công việc cha không tồn tại hoặc không thuộc công ty bạn");
  }

  const validUsers = new Set(
    (await prisma.user.findMany({ where: { companyId: user.companyId }, select: { id: true } })).map(u => u.id)
  );

  // Trợ lý AI của công ty: agentId (slug) hợp lệ + ánh xạ user-agent → agentId.
  // Cần cả 2 vì UI có thể giao việc cho agent dạng kind="agent" (gửi agentId)
  // HOẶC chọn agent trong danh sách người dùng (gửi userId của persona).
  const agents = await prisma.companyAgent.findMany({
    where: { companyId: user.companyId, isActive: true },
    select: { agentId: true, persona: { select: { id: true } } },
  });
  const agentIdSet = new Set(agents.map(a => a.agentId));
  const userIdToAgentId = new Map<string, string>();
  for (const a of agents) if (a.persona) userIdToAgentId.set(a.persona.id, a.agentId);

  const items = await prisma.$transaction(async (tx) => {
    const created_ = await Promise.all(tasks.map((t) => {
      // Xác định người nhận là trợ lý AI hay người thật → bật agentJob để worker tự thực thi.
      let aiAssignee: string | null = null;
      if (t.assigneeId) {
        if (t.assigneeKind === "agent" && agentIdSet.has(t.assigneeId)) aiAssignee = t.assigneeId;
        else if (userIdToAgentId.has(t.assigneeId)) aiAssignee = userIdToAgentId.get(t.assigneeId)!;
      }
      const assignedTo = !aiAssignee && t.assigneeId && validUsers.has(t.assigneeId) ? t.assigneeId : null;
      const watchers = (t.watchers ?? []).filter(w => validUsers.has(w));
      return tx.workItem.create({
        data: {
          companyId:   user.companyId,
          workType:    parent?.workType ?? "operational",
          projectId:   parent?.projectId ?? undefined,
          parentId:    parent?.id ?? undefined,
          epicId:      parent?.epicId ?? undefined,
          sprintId:    parent?.sprintId ?? undefined,
          title:       t.title,
          description: t.description ?? null,
          status:      "active",
          priority:    t.priority as WorkItemPriority,
          createdBy:   user.id,
          assignedTo,
          aiAssignee,
          agentJob:    aiAssignee != null,   // worker (agent-exec) chỉ nhặt việc agentJob=true
          watchers:    watchers.length ? (watchers as unknown as Prisma.InputJsonValue) : undefined,
          dueDate:     t.dueInDays != null ? new Date(now + t.dueInDays * 86_400_000) : null,
        },
      });
    }));

    // Lưu breakdown vào công việc cha để xem lại (BreakdownModal).
    if (parent) {
      const aiBreakdown = tasks.map((t) => ({
        title: t.title, description: t.description ?? "",
        priority: t.priority, estimatedDays: t.dueInDays ?? null,
      }));
      await tx.workItem.update({
        where: { id: parent.id },
        data: { aiBreakdown: aiBreakdown as unknown as Prisma.InputJsonValue },
      });
    }

    return created_;
  });

  const notifs: { companyId: string; userId: string; channel: "inapp"; type: string; title: string; body: string }[] = [];
  for (const w of items) {
    const targets = new Set<string>();
    if (w.assignedTo) targets.add(w.assignedTo);
    (Array.isArray(w.watchers) ? (w.watchers as string[]) : []).forEach(id => targets.add(id));
    targets.delete(user.id);
    for (const uid of targets) {
      notifs.push({
        companyId: user.companyId, userId: uid, channel: "inapp", type: "work.assigned",
        title: uid === w.assignedTo ? "Bạn được giao việc mới" : "Bạn đang theo dõi một công việc",
        body: w.title,
      });
    }
  }
  if (notifs.length) await prisma.notification.createMany({ data: notifs });

  // Có việc giao cho agent → kéo hàng đợi ngay trong process API (không chờ poller).
  if (items.some(i => i.agentJob)) ensureQueueRunning();

  return created(res, { count: items.length, ids: items.map(i => i.id) });
}));

// ─── POST /work/:id/append-note ──────────────────────────────────────────────
// Ghi nội dung mới vào MÔ TẢ công việc theo ngày (markdown). Dùng khi chat trợ lý về việc này.
const noteSchema = z.object({
  content: z.string().min(1).max(8_000),
  heading: z.string().max(120).optional(),
});

router.post("/:id/append-note", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const id = param(req.params["id"]);
  const { content, heading } = noteSchema.parse(req.body);

  const item = await prisma.workItem.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true, description: true },
  });
  if (!item) return notFound(res, "Công việc");

  const date = new Date().toLocaleDateString("vi-VN");
  const section = `## ${heading ?? "Cập nhật"} — ${date}\n\n${content.trim()}`;
  const base = (item.description ?? "").trim();
  const newDesc = base ? `${base}\n\n${section}` : section;

  const updated = await prisma.workItem.update({
    where: { id },
    data: { description: newDesc },
    select: { id: true, description: true },
  });
  return ok(res, updated);
}));

export default router;
