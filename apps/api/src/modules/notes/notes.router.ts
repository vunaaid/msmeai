// src/modules/notes/notes.router.ts
// Module Ghi Chép — ghi chép theo ngày, block (text/todo/voice), ghi âm + Whisper,
// tạo công việc từ note. Dữ liệu cá nhân: mọi truy vấn scope theo companyId + userId.
//
//  GET    /notes?date=YYYY-MM-DD   — danh sách note của 1 ngày (kèm blocks)
//  GET    /notes?month=YYYY-MM     — các ngày có note trong tháng (đếm) — cho lịch
//  GET    /notes/:id               — chi tiết 1 note
//  POST   /notes                   — tạo note cho 1 ngày
//  PUT    /notes/:id               — cập nhật title/content
//  DELETE /notes/:id               — xóa note (cascade blocks)
//  POST   /notes/:id/blocks        — thêm block (text/todo/voice)
//  POST   /notes/:id/audio         — upload audio → tạo voice block + bóc nội dung (multipart)
//  POST   /notes/:id/ocr           — upload/chụp ảnh → OCR → tạo block text (multipart)
//  PUT    /notes/blocks/:blockId   — cập nhật block (text / tick todo / vị trí)
//  DELETE /notes/blocks/:blockId   — xóa block
//  POST   /notes/blocks/:blockId/transcribe — bóc lại nội dung (retry)
//  POST   /notes/blocks/:blockId/standardize — Trợ lý tóm tắt (trả toàn văn + tách đoạn)
//  POST   /notes/tts               — đọc văn bản → audio mp3 (edge-tts)
//  POST   /notes/blocks/:blockId/to-work    — tạo công việc từ block

import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import { buildStoragePath, uploadBuffer, removeObject, getPresignedUrl } from "@vsme/storage";
import { requireAuth } from "../../middleware/auth.js";
import { ok, created, notFound, badRequest, noContent, wrap } from "../../lib/response.js";
import { qs, qi, param } from "../../lib/query.js";
import { runBlockTranscription } from "../../lib/transcribe.js";
import { runClaude } from "../../lib/claude.js";
import { synthesizeSpeech } from "../../lib/tts.js";
import { ocrImage } from "../../lib/ocr.js";
import type { NoteBlockType, WorkItemPriority, WorkItemStatus } from "@vsme/db";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 }, // 300MB — đủ cho ghi âm 1-2h
});

const blockInclude = {
  blocks: { orderBy: { position: "asc" } as const },
};

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createNoteSchema = z.object({
  noteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải dạng YYYY-MM-DD"),
  title:    z.string().max(200).optional(),
  content:  z.string().max(20000).optional(),
});

const updateNoteSchema = z.object({
  title:   z.string().max(200).nullable().optional(),
  content: z.string().max(20000).nullable().optional(),
});

const createBlockSchema = z.object({
  type:     z.enum(["text", "todo", "voice"]).default("text"),
  text:     z.string().max(10000).optional(),
  checked:  z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

const updateBlockSchema = z.object({
  text:     z.string().max(10000).nullable().optional(),
  checked:  z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

// "Trợ lý tóm tắt" — MỘT lần gọi AI trả về 4 phần để user chọn cập nhật:
//   corrections — từ nghi bị Whisper nghe nhầm (đoán cụm đúng theo ngữ cảnh)
//   cleaned     — bản sửa chính tả/dấu câu, GIỮ NGUYÊN ý & từ ngữ gốc
//   structured  — bản biên tập lại mạch lạc (đoạn/tiêu đề/gạch đầu dòng)
//   keypoints   — ý chính & việc cần làm
const ASSIST_SYSTEM =
  "Bạn là trợ lý hiệu đính & tóm tắt bản bóc băng tiếng Việt cho doanh nghiệp SME. Bản ghi do công cụ " +
  "nhận dạng giọng nói (Whisper) tạo ra nên thường NGHE NHẦM từ — đặc biệt thuật ngữ kinh doanh, chiến " +
  "lược, tài chính, tên riêng — thành cụm phát âm gần giống nhưng vô nghĩa. Luôn trả về JSON object hợp " +
  "lệ, không markdown, không lời dẫn ngoài JSON.";
const ASSIST_INSTRUCTION =
  "Đọc bản bóc băng dưới đây và trả về DUY NHẤT một JSON object với 4 khóa:\n" +
  '{\n' +
  '  "corrections": [{"original": string, "suggested": string, "reason": string}],\n' +
  '  "cleaned": string,\n' +
  '  "structured": string,\n' +
  '  "keypoints": [string]\n' +
  '}\n' +
  "- corrections: các từ/cụm nghi bị nghe nhầm. 'original' SAO CHÉP CHÍNH XÁC y nguyên trong bản ghi " +
  "(để thay thế tự động được), 'suggested' là cụm đúng đề xuất, 'reason' lý do ngắn. Chỉ liệt kê chỗ " +
  "thực sự nghi ngờ, tối đa 20; nếu không có để [].\n" +
  "- cleaned: bản đã sửa chính tả, dấu câu, viết hoa, tách câu/đoạn và ĐÃ áp dụng các correction; " +
  "GIỮ NGUYÊN ý & từ ngữ gốc, KHÔNG tóm tắt.\n" +
  "- structured: bản biên tập lại cho mạch lạc — bố cục đoạn/tiêu đề/gạch đầu dòng, lược từ thừa, giữ đúng thông tin.\n" +
  "- keypoints: các ý chính & việc cần làm, mỗi mục một chuỗi ngắn; nếu không có để [].\n" +
  "Không bịa thông tin. Tuyệt đối không thêm chữ nào ngoài JSON object.";

const ttsSchema = z.object({
  text:  z.string().min(1).max(8000),
  voice: z.string().max(64).optional(),
});

const toWorkSchema = z.object({
  title:      z.string().min(2).max(200).optional(), // mặc định lấy từ block.text
  assignedTo: z.string().uuid().optional(),
  priority:   z.enum(["urgent", "high", "normal", "low"]).default("normal"),
  dueDate:    z.string().datetime().optional(),
  projectId:  z.string().uuid().optional(),
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Parse "YYYY-MM-DD" → Date (UTC midnight) cho cột @db.Date. */
function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /notes?date=... | ?month=...
router.get("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const date  = qs(req.query["date"]);
  const month = qs(req.query["month"]); // YYYY-MM

  // Lịch tháng — đếm note theo ngày
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to   = new Date(Date.UTC(y, m, 1));
    const grouped = await prisma.note.groupBy({
      by: ["noteDate"],
      where: { companyId: user.companyId, userId: user.id, noteDate: { gte: from, lt: to } },
      _count: { _all: true },
    });
    const days = grouped.map(g => ({
      date: g.noteDate.toISOString().slice(0, 10),
      count: g._count._all,
    }));
    return ok(res, days);
  }

  // Ghi chép gần nhất (mọi ngày) — dùng cho danh sách trên cùng trang Ghi Chép.
  const recent = qs(req.query["recent"]);
  if (recent !== undefined) {
    const take = Math.min(20, Math.max(1, Number.parseInt(recent || "8", 10) || 8));
    const rows = await prisma.note.findMany({
      where: { companyId: user.companyId, userId: user.id },
      include: {
        blocks: { orderBy: { position: "asc" }, take: 1, select: { text: true } },
        _count: { select: { blocks: true } },
      },
      orderBy: [{ noteDate: "desc" }, { createdAt: "desc" }],
      take,
    });
    return ok(res, rows.map((n) => ({
      id: n.id,
      noteDate: n.noteDate.toISOString().slice(0, 10),
      title: n.title,
      preview: n.content ?? n.blocks[0]?.text ?? null,
      blockCount: n._count.blocks,
    })));
  }

  // Danh sách note theo ngày (mặc định hôm nay)
  const target = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : new Date().toISOString().slice(0, 10);

  const notes = await prisma.note.findMany({
    where: { companyId: user.companyId, userId: user.id, noteDate: parseDate(target) },
    include: blockInclude,
    orderBy: { createdAt: "asc" },
  });
  return ok(res, notes);
}));

// GET /notes/:id
router.get("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const note = await prisma.note.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId, userId: user.id },
    include: blockInclude,
  });
  if (!note) return notFound(res, "Ghi chép");
  return ok(res, note);
}));

// POST /notes
router.post("/", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const data = createNoteSchema.parse(req.body);
  const note = await prisma.note.create({
    data: {
      companyId: user.companyId,
      userId:    user.id,
      noteDate:  parseDate(data.noteDate),
      title:     data.title,
      content:   data.content,
    },
    include: blockInclude,
  });
  return created(res, note);
}));

// PUT /notes/:id
router.put("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const data = updateNoteSchema.parse(req.body);
  const existing = await prisma.note.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId, userId: user.id },
  });
  if (!existing) return notFound(res, "Ghi chép");

  const note = await prisma.note.update({
    where: { id: existing.id },
    data: {
      ...(data.title   !== undefined ? { title: data.title } : {}),
      ...(data.content !== undefined ? { content: data.content } : {}),
    },
    include: blockInclude,
  });
  return ok(res, note);
}));

// DELETE /notes/:id
router.delete("/:id", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const existing = await prisma.note.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId, userId: user.id },
    include: { blocks: { where: { type: "voice" } } },
  });
  if (!existing) return notFound(res, "Ghi chép");

  // Dọn audio trên MinIO (best-effort)
  for (const b of existing.blocks) {
    if (b.audioBucket && b.audioPath) {
      await removeObject(b.audioBucket, b.audioPath).catch(() => {});
    }
  }
  await prisma.note.delete({ where: { id: existing.id } });
  return noContent(res);
}));

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCKS
// ═══════════════════════════════════════════════════════════════════════════════

/** Lấy block thuộc về user hiện tại (qua quan hệ note). */
async function findOwnedBlock(blockId: string, userId: string, companyId: string) {
  return prisma.noteBlock.findFirst({
    where: { id: blockId, note: { userId, companyId } },
  });
}

/** Vị trí tiếp theo trong note. */
async function nextPosition(noteId: string): Promise<number> {
  const last = await prisma.noteBlock.findFirst({
    where: { noteId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? -1) + 1;
}

// POST /notes/:id/blocks
router.post("/:id/blocks", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const data = createBlockSchema.parse(req.body);
  const note = await prisma.note.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId, userId: user.id },
  });
  if (!note) return notFound(res, "Ghi chép");

  const block = await prisma.noteBlock.create({
    data: {
      noteId:   note.id,
      type:     data.type as NoteBlockType,
      text:     data.text,
      checked:  data.checked ?? false,
      position: data.position ?? (await nextPosition(note.id)),
    },
  });
  return created(res, block);
}));

// PUT /notes/blocks/:blockId
router.put("/blocks/:blockId", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const data = updateBlockSchema.parse(req.body);
  const existing = await findOwnedBlock(param(req.params["blockId"]), user.id, user.companyId);
  if (!existing) return notFound(res, "Block");

  const block = await prisma.noteBlock.update({
    where: { id: existing.id },
    data: {
      ...(data.text     !== undefined ? { text: data.text } : {}),
      ...(data.checked  !== undefined ? { checked: data.checked } : {}),
      ...(data.position !== undefined ? { position: data.position } : {}),
    },
  });
  return ok(res, block);
}));

// DELETE /notes/blocks/:blockId
router.delete("/blocks/:blockId", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const existing = await findOwnedBlock(param(req.params["blockId"]), user.id, user.companyId);
  if (!existing) return notFound(res, "Block");

  if (existing.audioBucket && existing.audioPath) {
    await removeObject(existing.audioBucket, existing.audioPath).catch(() => {});
  }
  await prisma.noteBlock.delete({ where: { id: existing.id } });
  return noContent(res);
}));

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIO + TRANSCRIBE
// ═══════════════════════════════════════════════════════════════════════════════

// POST /notes/:id/audio — upload audio → tạo voice block → bóc nội dung (Whisper)
router.post("/:id/audio", requireAuth, upload.single("file"), wrap(async (req, res) => {
  const user = req.user!;
  const file = req.file;
  if (!file) return badRequest(res, "Thiếu file ghi âm");
  if (!file.mimetype.startsWith("audio/")) return badRequest(res, "File không phải audio");

  const note = await prisma.note.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId, userId: user.id },
  });
  if (!note) return notFound(res, "Ghi chép");

  const ext = file.mimetype.includes("webm") ? "audio.webm"
            : file.mimetype.includes("ogg")  ? "audio.ogg"
            : file.mimetype.includes("mp4")  ? "audio.m4a"
            : "audio.bin";
  const storagePath = buildStoragePath(`notes-audio/${user.companyId}`, ext);
  const { bucket } = await uploadBuffer({
    storagePath,
    buffer: file.buffer,
    mimeType: file.mimetype,
  });

  const durationRaw = qi(req.body?.duration, 0);
  const block = await prisma.noteBlock.create({
    data: {
      noteId:           note.id,
      type:             "voice",
      transcriptStatus: "pending",
      audioBucket:      bucket,
      audioPath:        storagePath,
      audioDuration:    durationRaw > 0 ? durationRaw : null,
      position:         await nextPosition(note.id),
    },
  });

  // Bóc nội dung ở background — không block response
  void runBlockTranscription(block.id);

  return created(res, block);
}));

// POST /notes/:id/ocr — upload/chụp ảnh → OCR (Tesseract) → tạo block text với nội dung.
router.post("/:id/ocr", requireAuth, upload.single("file"), wrap(async (req, res) => {
  const user = req.user!;
  const file = req.file;
  if (!file) return badRequest(res, "Thiếu file ảnh");
  if (!file.mimetype.startsWith("image/")) return badRequest(res, "File không phải ảnh");

  const note = await prisma.note.findFirst({
    where: { id: param(req.params["id"]), companyId: user.companyId, userId: user.id },
  });
  if (!note) return notFound(res, "Ghi chép");

  let text = "";
  try {
    text = await ocrImage(file.buffer, file.originalname || "image.png", file.mimetype);
  } catch (err) {
    return badRequest(res, `OCR thất bại: ${err instanceof Error ? err.message : "lỗi không rõ"}`);
  }
  if (!text) return badRequest(res, "Không nhận được chữ nào từ ảnh");

  const block = await prisma.noteBlock.create({
    data: {
      noteId:   note.id,
      type:     "text",
      text:     text.slice(0, 10000),
      position: await nextPosition(note.id),
    },
  });
  return created(res, block);
}));

// GET /notes/blocks/:blockId/audio-url — presigned URL để phát lại
router.get("/blocks/:blockId/audio-url", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const block = await findOwnedBlock(param(req.params["blockId"]), user.id, user.companyId);
  if (!block || !block.audioBucket || !block.audioPath) return notFound(res, "Audio");
  const url = await getPresignedUrl(block.audioBucket, block.audioPath, 3600);
  return ok(res, { url });
}));

// POST /notes/blocks/:blockId/transcribe — bóc lại (retry)
router.post("/blocks/:blockId/transcribe", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const block = await findOwnedBlock(param(req.params["blockId"]), user.id, user.companyId);
  if (!block || !block.audioPath) return notFound(res, "Audio");
  void runBlockTranscription(block.id);
  return ok(res, { status: "processing" });
}));

// POST /notes/blocks/:blockId/standardize — "Trợ lý tóm tắt": MỘT lần gọi AI, sửa từ
// nghe nhầm + chính tả/dấu câu (giữ nguyên ý), trả về toàn văn (cleaned) và bản tách
// theo đoạn (paragraphs) để user chọn cập nhật. KHÔNG tự ghi đè (apply qua PUT ở client).
router.post("/blocks/:blockId/standardize", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const block = await findOwnedBlock(param(req.params["blockId"]), user.id, user.companyId);
  if (!block) return notFound(res, "Block");

  const source = (block.text ?? "").trim();
  if (source.length < 2) return badRequest(res, "Chưa có nội dung để xử lý");

  try {
    const r = await runClaude({
      prompt: `${ASSIST_INSTRUCTION}\n\n--- BẢN GHI ---\n${source.slice(0, 12_000)}`,
      model: "sonnet",
      systemPrompt: ASSIST_SYSTEM,
      noTools: true,
      timeout: 120_000,
    });
    const text = r.result.trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    let obj: Record<string, unknown> = {};
    if (start >= 0 && end > start) obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;

    const cleaned = typeof obj["cleaned"] === "string" ? (obj["cleaned"] as string).trim().slice(0, 20_000) : "";

    const rawPara = Array.isArray(obj["paragraphs"]) ? (obj["paragraphs"] as unknown[]) : [];
    let paragraphs = rawPara.map((p) => String(p ?? "").trim().slice(0, 4_000)).filter(Boolean).slice(0, 100);
    // Dự phòng: nếu AI không tách đoạn, tự tách 'cleaned' theo dòng trống.
    if (paragraphs.length === 0 && cleaned) {
      paragraphs = cleaned.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    }

    if (!cleaned && paragraphs.length === 0) return badRequest(res, "AI không trả về nội dung");
    return ok(res, { cleaned: cleaned || paragraphs.join("\n\n"), paragraphs });
  } catch (err) {
    return badRequest(res, `Xử lý thất bại: ${err instanceof Error ? err.message : "lỗi không rõ"}`);
  }
}));

// POST /notes/tts — đọc văn bản → audio mp3 (edge-tts). Trả thẳng audio/mpeg.
router.post("/tts", requireAuth, wrap(async (req, res) => {
  const { text, voice } = ttsSchema.parse(req.body);
  try {
    const audio = await synthesizeSpeech(text, voice);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", String(audio.length));
    return res.send(audio);
  } catch (err) {
    return badRequest(res, `Đọc văn bản thất bại: ${err instanceof Error ? err.message : "lỗi không rõ"}`);
  }
}));

// ═══════════════════════════════════════════════════════════════════════════════
// TẠO CÔNG VIỆC TỪ BLOCK
// ═══════════════════════════════════════════════════════════════════════════════

// POST /notes/blocks/:blockId/to-work
router.post("/blocks/:blockId/to-work", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const data = toWorkSchema.parse(req.body);
  const block = await findOwnedBlock(param(req.params["blockId"]), user.id, user.companyId);
  if (!block) return notFound(res, "Block");
  if (block.workItemId) return badRequest(res, "Block này đã tạo công việc rồi");

  const title = (data.title ?? block.text ?? "").trim();
  if (title.length < 2) return badRequest(res, "Nội dung quá ngắn để tạo công việc");

  if (data.assignedTo) {
    const assignee = await prisma.user.findFirst({
      where: { id: data.assignedTo, companyId: user.companyId, isActive: true },
    });
    if (!assignee) return badRequest(res, "Người nhận không tồn tại hoặc không thuộc công ty bạn");
  }
  if (data.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: data.projectId, companyId: user.companyId },
    });
    if (!project) return badRequest(res, "Dự án không tồn tại hoặc không thuộc công ty bạn");
  }

  const status: WorkItemStatus = data.assignedTo ? "active" : "draft";

  const workItem = await prisma.$transaction(async (tx) => {
    const wi = await tx.workItem.create({
      data: {
        companyId:   user.companyId,
        title:       title.slice(0, 200),
        workType:    data.projectId ? "project_task" : "operational",
        projectId:   data.projectId,
        assignedTo:  data.assignedTo,
        priority:    data.priority as WorkItemPriority,
        dueDate:     data.dueDate ? new Date(data.dueDate) : undefined,
        createdBy:   user.id,
        status,
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
    await tx.noteBlock.update({
      where: { id: block.id },
      data: { workItemId: wi.id, ...(block.type === "text" ? { type: "todo" } : {}) },
    });
    return wi;
  });

  return created(res, workItem);
}));

export default router;
