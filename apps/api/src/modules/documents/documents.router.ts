// src/modules/documents/documents.router.ts
// Module Tài Liệu — quản lý tài liệu + template (Word/Excel/PPTX/Markdown).
//
//  GET    /documents                     — danh sách tài liệu công ty
//  POST   /documents/upload              — upload file → tạo tài liệu (multipart)
//  POST   /documents                     — tạo tài liệu mới (từ template hoặc sinh mới)
//  GET    /documents/templates           — template hệ thống + template công ty
//  POST   /documents/templates/upload    — upload template công ty (multipart)
//  GET    /documents/templates/:id/download — presigned URL tải template
//  DELETE /documents/templates/:id       — xóa template (chặn template hệ thống)
//  GET    /documents/:id                 — chi tiết tài liệu
//  GET    /documents/:id/download        — presigned URL tải tài liệu
//  GET    /documents/:id/content         — trích text (AI / markdown editor)
//  PUT    /documents/:id/content         — lưu nội dung mới (chỉ markdown)
//  GET    /documents/:id/editor-config   — config OnlyOffice (đã ký JWT)
//  POST   /documents/:id/callback        — callback OnlyOffice lưu file (server→server)
//  DELETE /documents/:id                 — xóa mềm tài liệu

import { Router } from "express";
import type { Request } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma, Prisma } from "@vsme/db/client";
import { AuditAction } from "@vsme/db";
import type { SessionUser } from "../../lib/rbac.js";
import { writeAuditLog } from "@vsme/audit/audit-log";
import {
  buildStoragePath, uploadBuffer, getPresignedUrl, getPresignedUrlPublic, getObjectBuffer,
  detectFileType, MIME_BY_TYPE, createDocument, createDocumentFromTemplate,
  generateDocx, generateXlsx, saveDocumentVersion, convertToPdf, renderXlsxHtml,
} from "@vsme/storage";
import { requireAuth } from "../../middleware/auth.js";
import { ok, created, notFound, badRequest, forbidden, noContent, wrap } from "../../lib/response.js";
import { hasPermission } from "../../lib/rbac.js";
import { qs, qi, param } from "../../lib/query.js";
import { buildEditorConfig, verifyOnlyOffice, isOnlyOfficeEnabled } from "./onlyoffice.js";
import { resolveWritableFolder } from "../folders/folders.router.js";

// Where fragment: ẩn tài liệu nằm trong thư mục cá nhân của người khác.
// (folderId null = chưa phân loại; folder company = toàn công ty; personal = chủ sở hữu)
function folderScopeWhere(userId: string): Prisma.DocumentWhereInput {
  return {
    OR: [
      { folderId: null },
      { folder: { type: "company" } },
      { folder: { type: "personal", ownerId: userId } },
    ],
  };
}

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const FILE_TYPES = ["docx", "xlsx", "pptx", "md"] as const;

// ─── Quyền đọc tài liệu theo role ──────────────────────────────────────────────
function isDocAdmin(user: SessionUser): boolean {
  return user.accountType === "company_admin" || user.accountType === "system_admin" || user.isSuperAdmin;
}
// Where fragment: chỉ tài liệu user được phép xem (allowedRoleIds null = toàn công ty,
// hoặc chứa roleId của user, hoặc do chính user tạo). Admin xem tất cả.
function docAccessWhere(user: SessionUser): Prisma.DocumentWhereInput {
  if (isDocAdmin(user)) return {};
  const or: Prisma.DocumentWhereInput[] = [
    { allowedRoleIds: { equals: Prisma.DbNull } },
    { createdBy: user.id },
  ];
  // Vai trò chính + các vai trò bổ sung (HĐQT, ban...) đều được tính quyền đọc.
  for (const rid of [user.roleId, ...(user.extraRoleIds ?? [])]) {
    if (rid) or.push({ allowedRoleIds: { array_contains: rid } });
  }
  return { OR: or };
}
// Chuẩn hoá allowedRoleIds từ input: mảng roleId không rỗng → lưu mảng; còn lại → null (toàn công ty).
function normalizeAllowedRoles(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const ids = input.filter((x): x is string => typeof x === "string" && x.length > 0);
  return ids.length > 0 ? [...new Set(ids)] : null;
}
// Upload (multipart) gửi allowedRoleIds dạng chuỗi JSON → parse an toàn.
function parseMaybeJson(v: string | undefined): unknown {
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES (định nghĩa trước /:id để không bị param nuốt "templates")
// ═══════════════════════════════════════════════════════════════════════════

// GET /documents/templates — template hệ thống (companyId null) + template công ty
router.get("/templates", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const fileType = qs(req.query["fileType"]);
  const templates = await prisma.documentTemplate.findMany({
    where: {
      deletedAt: null,
      OR: [{ companyId: null }, { companyId: user.companyId }],
      ...(fileType && (FILE_TYPES as readonly string[]).includes(fileType)
        ? { fileType: fileType as (typeof FILE_TYPES)[number] }
        : {}),
    },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  return ok(res, templates);
}));

// POST /documents/templates/upload — upload template công ty
router.post("/templates/upload", requireAuth, upload.single("file"), wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPerm(req, "documents", "write")) return forbidden(res, "Không có quyền tạo template");
  const file = req.file;
  if (!file) return badRequest(res, "Thiếu file upload");

  const fileType = detectFileType(file.originalname, file.mimetype);
  if (!fileType) return badRequest(res, "Định dạng không hỗ trợ (chỉ docx/xlsx/pptx/md)");

  const name = (qs(req.body?.name) ?? file.originalname).trim();
  const storagePath = buildStoragePath(`${user.companyId}/templates`, file.originalname);
  const { bucket, size } = await uploadBuffer({ storagePath, buffer: file.buffer, mimeType: file.mimetype });

  const tpl = await prisma.documentTemplate.create({
    data: {
      companyId: user.companyId,
      name,
      description: qs(req.body?.description) ?? null,
      category: qs(req.body?.category) ?? null,
      fileType,
      bucket,
      storagePath,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size,
      isSystem: false,
      createdBy: user.id,
    },
  });
  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "documents" },
    action: AuditAction.create,
    entityType: "DocumentTemplate",
    entityId: tpl.id,
  });
  return created(res, tpl);
}));

// GET /documents/templates/:id/download
router.get("/templates/:id/download", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const tpl = await prisma.documentTemplate.findFirst({
    where: { id: param(req.params["id"]), deletedAt: null, OR: [{ companyId: null }, { companyId: user.companyId }] },
  });
  if (!tpl) return notFound(res, "Template");
  const url = await getPresignedUrl(tpl.bucket, tpl.storagePath);
  return ok(res, { url, filename: tpl.originalName });
}));

// DELETE /documents/templates/:id — chặn template hệ thống
router.delete("/templates/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPerm(req, "documents", "delete")) return forbidden(res, "Không có quyền xóa template");
  const tpl = await prisma.documentTemplate.findUnique({ where: { id: param(req.params["id"]) } });
  if (!tpl || tpl.deletedAt) return notFound(res, "Template");

  // Template hệ thống KHÔNG được xóa.
  if (tpl.isSystem || tpl.companyId === null) {
    return forbidden(res, "Không thể xóa template hệ thống");
  }
  if (tpl.companyId !== user.companyId) return forbidden(res, "Template không thuộc công ty của bạn");

  await prisma.documentTemplate.update({ where: { id: tpl.id }, data: { deletedAt: new Date() } });
  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "documents" },
    action: AuditAction.delete,
    entityType: "DocumentTemplate",
    entityId: tpl.id,
  });
  return noContent(res);
}));

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /documents/role-options — danh sách role công ty (để chọn quyền xem khi tạo/upload)
router.get("/role-options", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const roles = await prisma.role.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true, level: true },
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });
  return ok(res, roles);
}));

// GET /documents — danh sách tài liệu công ty
router.get("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const page = qi(req.query["page"], 1);
  const limit = Math.min(qi(req.query["limit"], 50), 100);
  const fileType = qs(req.query["fileType"]);
  const folderId = qs(req.query["folderId"]); // uuid = trong thư mục đó; "none" = chưa phân loại; bỏ trống = tất cả

  const where: Prisma.DocumentWhereInput = {
    companyId: user.companyId,
    deletedAt: null,
    // Quyền đọc theo role VÀ phạm vi thư mục (ẩn personal của người khác).
    AND: [docAccessWhere(user), folderScopeWhere(user.id)],
    ...(fileType && (FILE_TYPES as readonly string[]).includes(fileType)
      ? { fileType: fileType as (typeof FILE_TYPES)[number] }
      : {}),
    ...(folderId === "none" ? { folderId: null } : folderId ? { folderId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        currentVersion: true,
        template: { select: { id: true, name: true } },
        folder: { select: { id: true, name: true, type: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.document.count({ where }),
  ]);
  return ok(res, items, { total, page, limit });
}));

// POST /documents/upload — upload file → tạo tài liệu
router.post("/upload", requireAuth, upload.single("file"), wrap(async (req, res) => {
  const user = req.user!;
  // Thư mục đích (tùy chọn). Upload vào thư mục CÁ NHÂN của chính mình thì KHÔNG cần
  // quyền documents:write (không gian riêng); còn lại (company / chưa phân loại) cần write.
  const folderId = qs(req.body?.folderId);
  const folder = folderId ? await resolveWritableFolder(user, folderId) : null;
  if (folderId && !folder) return forbidden(res, "Thư mục không tồn tại hoặc không có quyền");
  const ownsPersonal = folder?.type === "personal" && folder.ownerId === user.id;
  if (!ownsPersonal && !hasPerm(req, "documents", "write")) return forbidden(res, "Không có quyền tạo tài liệu");
  const file = req.file;
  if (!file) return badRequest(res, "Thiếu file upload");

  const fileType = detectFileType(file.originalname, file.mimetype);
  if (!fileType) return badRequest(res, "Định dạng không hỗ trợ (chỉ docx/xlsx/pptx/md)");

  const name = (qs(req.body?.name) ?? file.originalname).trim();

  // TRÙNG TÊN trong cùng thư mục + cùng loại file → thêm VERSION mới thay vì tạo tài liệu mới.
  const existing = await prisma.document.findFirst({
    where: { companyId: user.companyId, deletedAt: null, name, fileType, folderId: folder ? folder.id : null },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    const v = await saveDocumentVersion({
      documentId: existing.id, userId: user.id,
      buffer: file.buffer, mimeType: file.mimetype, companyId: user.companyId,
    });
    await writeAuditLog({
      context: { companyId: user.companyId, userId: user.id, moduleKey: "documents" },
      action: AuditAction.update, entityType: "Document", entityId: existing.id,
    });
    return ok(res, { id: existing.id, name: existing.name, fileType: existing.fileType, versionNo: v.versionNo, versioned: true });
  }

  const doc = await createDocument({
    companyId: user.companyId,
    userId: user.id,
    name,
    fileType,
    buffer: file.buffer,
    mimeType: file.mimetype,
  });
  // Quyền xem theo role (gửi kèm dạng JSON string trong field "allowedRoleIds") + thư mục
  const allowed = normalizeAllowedRoles(parseMaybeJson(qs(req.body?.allowedRoleIds)));
  if (allowed || folder) {
    await prisma.document.update({
      where: { id: doc.id },
      data: { ...(allowed ? { allowedRoleIds: allowed } : {}), ...(folder ? { folderId: folder.id } : {}) },
    }).catch(() => {});
  }
  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "documents" },
    action: AuditAction.create,
    entityType: "Document",
    entityId: doc.id,
  });
  return created(res, doc);
}));

// POST /documents — tạo tài liệu mới (từ template hoặc sinh mới)
const createSchema = z.object({
  name: z.string().min(1).max(200),
  fileType: z.enum(FILE_TYPES).optional(),
  templateId: z.string().uuid().optional(),
  data: z.record(z.unknown()).optional(),   // dữ liệu điền template
  content: z.string().optional(),           // markdown / nội dung text
  allowedRoleIds: z.array(z.string()).optional(), // quyền xem theo role
  folderId: z.string().uuid().optional(),   // thư mục đích (tùy chọn)
});

router.post("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const body = createSchema.parse(req.body);
  // Thư mục cá nhân của chính mình → miễn quyền documents:write (không gian riêng).
  const folder = body.folderId ? await resolveWritableFolder(user, body.folderId) : null;
  if (body.folderId && !folder) return forbidden(res, "Thư mục không tồn tại hoặc không có quyền");
  const ownsPersonal = folder?.type === "personal" && folder.ownerId === user.id;
  if (!ownsPersonal && !hasPerm(req, "documents", "write")) return forbidden(res, "Không có quyền tạo tài liệu");

  let doc;
  if (body.templateId) {
    doc = await createDocumentFromTemplate({
      companyId: user.companyId,
      userId: user.id,
      templateId: body.templateId,
      name: body.name,
      data: body.data ?? {},
    });
  } else {
    const fileType = body.fileType ?? "md";
    let buffer: Buffer;
    if (fileType === "md") buffer = Buffer.from(body.content ?? `# ${body.name}\n`, "utf8");
    else if (fileType === "docx") buffer = await generateDocx({ title: body.name, paragraphs: (body.content ?? "").split("\n") });
    else if (fileType === "xlsx") buffer = await generateXlsx({ sheets: [{ name: "Sheet1", rows: [] }] });
    else return badRequest(res, "Tạo mới pptx cần dùng template");
    doc = await createDocument({
      companyId: user.companyId, userId: user.id, name: body.name, fileType, buffer, mimeType: MIME_BY_TYPE[fileType],
    });
  }
  const allowed = normalizeAllowedRoles(body.allowedRoleIds);
  if (allowed || folder) {
    await prisma.document.update({
      where: { id: doc.id },
      data: { ...(allowed ? { allowedRoleIds: allowed } : {}), ...(folder ? { folderId: folder.id } : {}) },
    }).catch(() => {});
  }
  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "documents" },
    action: AuditAction.create, entityType: "Document", entityId: doc.id,
  });
  return created(res, doc);
}));

// POST /documents/:id/callback — OnlyOffice lưu file (server→server, KHÔNG requireAuth)
router.post("/:id/callback", wrap(async (req, res) => {
  const documentId = param(req.params["id"]);
  const body = req.body as { status?: number; url?: string; token?: string; users?: string[] };

  // Verify JWT nếu OnlyOffice bật JWT.
  const token = body.token ?? (req.headers["authorization"]?.toString().replace(/^Bearer\s+/i, ""));
  let payload: Record<string, unknown> | null = null;
  if (token) payload = verifyOnlyOffice(token);
  // payload có thể bọc body trong { payload: {...} } tùy phiên bản.
  const data = (payload?.["payload"] as typeof body) ?? (payload as typeof body | null) ?? body;

  const status = data.status ?? body.status;
  const fileUrl = data.url ?? body.url;

  // status 2 = MustSave, 6 = ForceSave → lưu version mới.
  if ((status === 2 || status === 6) && fileUrl) {
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (doc && !doc.deletedAt) {
      const resp = await fetch(fileUrl);
      const buffer = Buffer.from(await resp.arrayBuffer());
      const editorUser = body.users?.[0] ?? doc.createdBy;
      await saveDocumentVersion({
        documentId, userId: editorUser, buffer, mimeType: MIME_BY_TYPE[doc.fileType], companyId: doc.companyId,
      });
    }
  }
  // OnlyOffice yêu cầu trả { error: 0 }.
  return res.json({ error: 0 });
}));

// GET /documents/:id — chi tiết
router.get("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const doc = await prisma.document.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId, deletedAt: null, ...docAccessWhere(user) },
    include: { currentVersion: true, versions: { orderBy: { versionNo: "desc" } }, template: { select: { id: true, name: true } } },
  });
  if (!doc) return notFound(res, "Tài liệu");
  return ok(res, doc);
}));

const EXT_BY_FT: Record<string, string> = { docx: ".docx", xlsx: ".xlsx", pptx: ".pptx", md: ".md" };

// GET /documents/:id/download — stream file gốc về trình duyệt (qua API, không lộ MinIO)
router.get("/:id/download", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const doc = await prisma.document.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId, deletedAt: null, ...docAccessWhere(user) },
    include: { currentVersion: true },
  });
  if (!doc || !doc.currentVersion) return notFound(res, "Tài liệu");
  const buffer = await getObjectBuffer(doc.currentVersion.bucket, doc.currentVersion.storagePath);
  const ext = EXT_BY_FT[doc.fileType] ?? "";
  const filename = doc.name.toLowerCase().endsWith(ext) ? doc.name : `${doc.name}${ext}`;
  res.setHeader("Content-Type", doc.currentVersion.mimeType || MIME_BY_TYPE[doc.fileType]);
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader("Content-Length", String(buffer.length));
  res.end(buffer);
}));

// GET /documents/:id/preview — xem trong trình duyệt: xlsx → bảng HTML (dễ đọc),
// docx/pptx → PDF (phân trang đẹp). Stream qua API (cùng origin).
router.get("/:id/preview", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const doc = await prisma.document.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId, deletedAt: null, ...docAccessWhere(user) },
    include: { currentVersion: true },
  });
  if (!doc || !doc.currentVersion) return notFound(res, "Tài liệu");
  if (doc.fileType === "md") return badRequest(res, "Markdown xem ở trình soạn thảo, không có bản xem PDF");
  const src = await getObjectBuffer(doc.currentVersion.bucket, doc.currentVersion.storagePath);
  // no-store: bản xem phản ánh nội dung + cách render hiện tại, tránh kẹt cache cũ.
  res.setHeader("Cache-Control", "no-store");

  if (doc.fileType === "xlsx") {
    const html = await renderXlsxHtml(src);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(html);
  }

  const pdf = await convertToPdf(src, doc.fileType);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "inline; filename=preview.pdf");
  res.setHeader("Content-Length", String(pdf.length));
  res.end(pdf);
}));

// GET /documents/:id/content — trích text
router.get("/:id/content", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const doc = await prisma.document.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId, deletedAt: null, ...docAccessWhere(user) },
    include: { currentVersion: true },
  });
  if (!doc) return notFound(res, "Tài liệu");
  if (!doc.currentVersion) return ok(res, { content: "", fileType: doc.fileType });
  const buffer = await getObjectBuffer(doc.currentVersion.bucket, doc.currentVersion.storagePath);
  // Markdown trả raw để chỉnh sửa; loại khác trả text trích xuất.
  const { extractText } = await import("@vsme/storage");
  const content = await extractText(buffer, doc.fileType);
  return ok(res, { content, fileType: doc.fileType });
}));

// PUT /documents/:id/content — lưu nội dung (chỉ markdown)
const contentSchema = z.object({ content: z.string() });
router.put("/:id/content", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPerm(req, "documents", "write")) return forbidden(res, "Không có quyền sửa tài liệu");
  const doc = await prisma.document.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId, deletedAt: null, ...docAccessWhere(user) },
  });
  if (!doc) return notFound(res, "Tài liệu");
  if (doc.fileType !== "md") return badRequest(res, "Chỉ tài liệu Markdown sửa được qua API này; file Office dùng trình soạn thảo OnlyOffice");

  const { content } = contentSchema.parse(req.body);
  const result = await saveDocumentVersion({
    documentId: doc.id, userId: user.id, buffer: Buffer.from(content, "utf8"),
    mimeType: MIME_BY_TYPE.md, companyId: user.companyId,
  });
  return ok(res, result);
}));

// GET /documents/:id/editor-config — config OnlyOffice
router.get("/:id/editor-config", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!isOnlyOfficeEnabled()) return badRequest(res, "OnlyOffice chưa được cấu hình (ONLYOFFICE_URL)");
  const doc = await prisma.document.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId, deletedAt: null, ...docAccessWhere(user) },
    include: { currentVersion: true },
  });
  if (!doc || !doc.currentVersion) return notFound(res, "Tài liệu");
  if (doc.fileType === "md") return badRequest(res, "Markdown không dùng OnlyOffice");

  // OnlyOffice container tải file → ký theo endpoint công khai (MINIO_PUBLIC_ENDPOINT).
  const documentUrl = await getPresignedUrlPublic(doc.currentVersion.bucket, doc.currentVersion.storagePath, 3600);
  const canEdit = hasPerm(req, "documents", "write");
  const config = buildEditorConfig({
    documentId: doc.id,
    fileType: doc.fileType,
    title: `${doc.name}`,
    versionKey: `${doc.id}_${doc.currentVersion.versionNo}`,
    documentUrl,
    user: { id: user.id, name: user.name },
    canEdit,
  });
  return ok(res, { config, documentServerUrl: process.env["ONLYOFFICE_URL"] });
}));

// DELETE /documents/:id — xóa mềm
router.delete("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  if (!hasPerm(req, "documents", "delete")) return forbidden(res, "Không có quyền xóa tài liệu");
  const doc = await prisma.document.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId, deletedAt: null, ...docAccessWhere(user) },
  });
  if (!doc) return notFound(res, "Tài liệu");
  await prisma.document.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
  await writeAuditLog({
    context: { companyId: user.companyId, userId: user.id, moduleKey: "documents" },
    action: AuditAction.delete, entityType: "Document", entityId: doc.id,
  });
  return noContent(res);
}));

// ─── Helper quyền (không throw — trả boolean để dùng forbidden()) ──────────────
function hasPerm(req: Request, moduleKey: string, action: string): boolean {
  return hasPermission(req.user, moduleKey, action);
}

export default router;
