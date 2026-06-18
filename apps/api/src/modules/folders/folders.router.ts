// src/modules/folders/folders.router.ts
// Thư mục ảo lưu tài liệu. 2 loại:
//   - company  : chia sẻ toàn công ty (mọi user trong công ty xem được)
//   - personal : chỉ chủ sở hữu (ownerId) xem được
// Mỗi user tự động có 1 thư mục gốc cá nhân; công ty có 1 thư mục gốc chung.
// Thư mục con không giới hạn cấp; có thể gắn moduleKey để phân loại theo module.

import { Router } from "express";
import { z } from "zod";
import { prisma, Prisma } from "@vsme/db/client";
import { AuditAction } from "@vsme/db";
import type { SessionUser } from "../../lib/rbac.js";
import { hasPermission } from "../../lib/rbac.js";
import { writeAuditLog } from "@vsme/audit/audit-log";
import { requireAuth } from "../../middleware/auth.js";
import { ok, created, notFound, badRequest, forbidden, noContent, wrap } from "../../lib/response.js";
import { param } from "../../lib/query.js";

const router = Router();

const PERSONAL_ROOT_NAME = "Tài liệu của tôi";
const COMPANY_ROOT_NAME = "Tài liệu công ty";

// ─── Quyền xem thư mục ──────────────────────────────────────────────────────
// company → toàn công ty; personal → chỉ chủ sở hữu. (Admin KHÔNG xem personal
// của người khác — đúng nghĩa "không gian riêng".)
function folderAccessWhere(user: SessionUser): Prisma.FolderWhereInput {
  return {
    companyId: user.companyId,
    deletedAt: null,
    OR: [{ type: "company" }, { type: "personal", ownerId: user.id }],
  };
}

// Thao tác trên thư mục company cần quyền ghi tài liệu; personal thì chủ sở hữu tự do.
function canMutate(user: SessionUser, folder: { type: string; ownerId: string | null }): boolean {
  if (folder.type === "personal") return folder.ownerId === user.id;
  return hasPermission(user, "documents", "write");
}

// Đảm bảo có thư mục gốc cá nhân của user + thư mục gốc công ty (idempotent).
async function ensureRoots(user: SessionUser) {
  let personalRoot = await prisma.folder.findFirst({
    where: { companyId: user.companyId, ownerId: user.id, type: "personal", isRoot: true, deletedAt: null },
  });
  if (!personalRoot) {
    personalRoot = await prisma.folder.create({
      data: {
        companyId: user.companyId, name: PERSONAL_ROOT_NAME, type: "personal",
        ownerId: user.id, isRoot: true, createdBy: user.id,
      },
    });
  }
  let companyRoot = await prisma.folder.findFirst({
    where: { companyId: user.companyId, type: "company", isRoot: true, deletedAt: null },
  });
  if (!companyRoot) {
    companyRoot = await prisma.folder.create({
      data: { companyId: user.companyId, name: COMPANY_ROOT_NAME, type: "company", isRoot: true, createdBy: user.id },
    });
  }
  return { personalRoot, companyRoot };
}

// Lấy thư mục theo id trong phạm vi user được phép.
async function getAccessibleFolder(user: SessionUser, id: string) {
  return prisma.folder.findFirst({ where: { id, ...folderAccessWhere(user) } });
}

// GET /folders — danh sách phẳng mọi thư mục user xem được (UI tự dựng cây),
// kèm số tài liệu trong từng thư mục. Tự tạo thư mục gốc nếu chưa có.
router.get("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  await ensureRoots(user);
  const folders = await prisma.folder.findMany({
    where: folderAccessWhere(user),
    orderBy: [{ isRoot: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, type: true, ownerId: true, parentId: true,
      moduleKey: true, isRoot: true, createdBy: true, createdAt: true,
      _count: { select: { documents: { where: { deletedAt: null } } } },
    },
  });
  const items = folders.map(f => ({ ...f, docCount: f._count.documents, _count: undefined }));
  return ok(res, items);
}));

// POST /folders — tạo thư mục (con). Body: { name, type, parentId?, moduleKey? }
const createSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["company", "personal"]),
  parentId: z.string().uuid().optional().nullable(),
  moduleKey: z.string().min(1).max(40).optional().nullable(),
});
router.post("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Dữ liệu không hợp lệ", parsed.error.flatten());
  const { name, type, parentId, moduleKey } = parsed.data;

  // Quyền tạo: company cần documents:write; personal thì tự do.
  if (type === "company" && !hasPermission(user, "documents", "write")) {
    return forbidden(res, "Không có quyền tạo thư mục công ty");
  }

  // Validate parent: phải tồn tại, user xem được, và CÙNG loại (không trộn company/personal).
  if (parentId) {
    const parent = await getAccessibleFolder(user, parentId);
    if (!parent) return badRequest(res, "Thư mục cha không tồn tại hoặc không có quyền");
    if (parent.type !== type) return badRequest(res, "Thư mục con phải cùng loại với thư mục cha");
    if (type === "personal" && parent.ownerId !== user.id) return forbidden(res, "Không phải thư mục cá nhân của bạn");
  }

  const folder = await prisma.folder.create({
    data: {
      companyId: user.companyId, name: name.trim(), type,
      ownerId: type === "personal" ? user.id : null,
      parentId: parentId ?? null, moduleKey: moduleKey ?? null,
      isRoot: false, createdBy: user.id,
    },
  });
  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "documents" },
    action: AuditAction.create, entityType: "Folder", entityId: folder.id,
  });
  return created(res, folder);
}));

// PATCH /folders/:id — đổi tên / di chuyển (parentId) / đổi moduleKey
const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  parentId: z.string().uuid().nullable().optional(),
  moduleKey: z.string().min(1).max(40).nullable().optional(),
});
router.patch("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const id = param(req.params["id"]);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Dữ liệu không hợp lệ", parsed.error.flatten());

  const folder = await getAccessibleFolder(user, id);
  if (!folder) return notFound(res, "Thư mục");
  if (folder.isRoot) return badRequest(res, "Không thể sửa thư mục gốc");
  if (!canMutate(user, folder)) return forbidden(res, "Không có quyền sửa thư mục này");

  const { name, parentId, moduleKey } = parsed.data;

  if (parentId !== undefined && parentId !== null) {
    if (parentId === id) return badRequest(res, "Không thể đặt thư mục làm cha của chính nó");
    const parent = await getAccessibleFolder(user, parentId);
    if (!parent) return badRequest(res, "Thư mục cha không tồn tại hoặc không có quyền");
    if (parent.type !== folder.type) return badRequest(res, "Thư mục con phải cùng loại với thư mục cha");
    // Chặn vòng lặp: parent không được là con cháu của folder.
    let cursor: string | null = parent.parentId;
    while (cursor) {
      if (cursor === id) return badRequest(res, "Di chuyển không hợp lệ (tạo vòng lặp)");
      const up: { parentId: string | null } | null = await prisma.folder.findUnique({
        where: { id: cursor }, select: { parentId: true },
      });
      cursor = up?.parentId ?? null;
    }
  }

  const updated = await prisma.folder.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
      ...(moduleKey !== undefined ? { moduleKey } : {}),
    },
  });
  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "documents" },
    action: AuditAction.update, entityType: "Folder", entityId: id,
  });
  return ok(res, updated);
}));

// DELETE /folders/:id — xóa mềm. Chặn nếu là gốc hoặc còn thư mục con / tài liệu.
router.delete("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const id = param(req.params["id"]);
  const folder = await getAccessibleFolder(user, id);
  if (!folder) return notFound(res, "Thư mục");
  if (folder.isRoot) return badRequest(res, "Không thể xóa thư mục gốc");
  if (!canMutate(user, folder)) return forbidden(res, "Không có quyền xóa thư mục này");

  const [childCount, docCount] = await Promise.all([
    prisma.folder.count({ where: { parentId: id, deletedAt: null } }),
    prisma.document.count({ where: { folderId: id, deletedAt: null } }),
  ]);
  if (childCount > 0 || docCount > 0) {
    return badRequest(res, "Thư mục không rỗng — hãy xóa/di chuyển nội dung bên trong trước");
  }

  await prisma.folder.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "documents" },
    action: AuditAction.delete, entityType: "Folder", entityId: id,
  });
  return noContent(res);
}));

export default router;

// Cho documents router dùng chung: kiểm tra user có quyền dùng 1 thư mục để lưu tài liệu.
// Trả về folder nếu hợp lệ, null nếu không (không tồn tại / không có quyền).
export async function resolveWritableFolder(user: SessionUser, folderId: string) {
  const folder = await prisma.folder.findFirst({ where: { id: folderId, ...folderAccessWhere(user) } });
  if (!folder) return null;
  return folder;
}

export { folderAccessWhere };
