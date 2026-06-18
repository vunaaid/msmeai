// packages/ai-sdk/src/tools/document-tools.ts
// Document tools — ĐỘC LẬP (tool-only). Mỗi tool tự chứa: định nghĩa (schema) + hàm
// execute thuần. KHÔNG biết gì về agent-runner / authority / cách được gọi.
//
// "Dùng tool ở đâu và như thế nào" do nơi khác quyết định: chỉ cần import DOCUMENT_TOOLS
// (lấy schema) và gọi executeDocumentTool(name, input, ctx) khi muốn chạy.
//
// Ví dụ tích hợp vào agent-runner:
//   import { DOCUMENT_TOOLS, executeDocumentTool, isDocumentTool } from "@vsme/ai-sdk";
//   tools.push(...DOCUMENT_TOOLS.map(t => t.definition));
//   if (isDocumentTool(name)) return { result: await executeDocumentTool(name, input, ctx) };

import type { ToolDefinition } from "@vsme/llm";
import { prisma } from "@vsme/db/client";
import {
  readDocumentText, createDocumentFromTemplate, createDocument,
  saveDocumentVersion, generateDocx, generateXlsx, MIME_BY_TYPE,
} from "@vsme/storage";

/** Context tối thiểu mọi document tool cần — không phụ thuộc agent. */
export interface DocumentToolContext {
  companyId: string;
  userId: string;
}

/** Một tool độc lập = schema + hàm chạy. */
export interface StandaloneTool {
  definition: ToolDefinition;
  execute: (input: Record<string, unknown>, ctx: DocumentToolContext) => Promise<string>;
}

// ─── read_document ────────────────────────────────────────────────────────────

const readDocument: StandaloneTool = {
  definition: {
    name: "read_document",
    description: "Đọc/trích xuất nội dung text của một tài liệu (Word/Excel/PPTX/Markdown) đã lưu trong hệ thống để phân tích, tóm tắt, trả lời.",
    input_schema: {
      type: "object",
      properties: { documentId: { type: "string", description: "ID của tài liệu cần đọc" } },
      required: ["documentId"],
    },
  },
  async execute(input, ctx) {
    const { documentId } = input as { documentId: string };
    try {
      const text = await readDocumentText({ documentId, companyId: ctx.companyId });
      const trimmed = text.length > 12000 ? text.slice(0, 12000) + "\n…(đã cắt bớt)" : text;
      return JSON.stringify({ documentId, content: trimmed });
    } catch (err) {
      return `❌ Không đọc được tài liệu: ${err instanceof Error ? err.message : "lỗi"}`;
    }
  },
};

// ─── create_document_from_template ─────────────────────────────────────────────

const createFromTemplate: StandaloneTool = {
  definition: {
    name: "create_document_from_template",
    description: "Tạo tài liệu mới bằng cách điền dữ liệu vào template ({{placeholder}}). Dùng cho hợp đồng, báo giá, biên bản… từ mẫu có sẵn.",
    input_schema: {
      type: "object",
      properties: {
        templateId: { type: "string", description: "ID của template (hệ thống hoặc công ty)" },
        name: { type: "string", description: "Tên tài liệu tạo ra" },
        data: { type: "object", description: "Cặp key-value để điền vào các {{placeholder}} của template" },
      },
      required: ["templateId", "data"],
    },
  },
  async execute(input, ctx) {
    const { templateId, name, data = {} } = input as { templateId: string; name?: string; data?: Record<string, unknown> };
    try {
      const doc = await createDocumentFromTemplate({ companyId: ctx.companyId, userId: ctx.userId, templateId, name, data });
      return `✅ Đã tạo tài liệu "${doc.name}" từ template. ID: ${doc.id}`;
    } catch (err) {
      return `❌ Không tạo được tài liệu: ${err instanceof Error ? err.message : "lỗi"}`;
    }
  },
};

// ─── create_document ────────────────────────────────────────────────────────────

const createNew: StandaloneTool = {
  definition: {
    name: "create_document",
    description: "Tạo file tài liệu mới từ đầu. Hỗ trợ Markdown/Word (nội dung text) và Excel (các dòng dữ liệu).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Tên tài liệu" },
        fileType: { type: "string", enum: ["docx", "xlsx", "md"], description: "Loại file cần tạo" },
        content: { type: "string", description: "Nội dung text (docx/md). Mỗi dòng là một đoạn." },
        rows: {
          type: "array",
          description: "Dữ liệu Excel: mảng các dòng, mỗi dòng là mảng ô.",
          items: { type: "array", items: { type: "string" } },
        },
      },
      required: ["name", "fileType"],
    },
  },
  async execute(input, ctx) {
    const { name, fileType, content, rows } = input as {
      name: string; fileType: "docx" | "xlsx" | "md"; content?: string; rows?: (string | number)[][];
    };
    try {
      let buffer: Buffer;
      if (fileType === "md") buffer = Buffer.from(content ?? `# ${name}\n`, "utf8");
      else if (fileType === "docx") buffer = await generateDocx({ title: name, paragraphs: (content ?? "").split("\n") });
      else buffer = await generateXlsx({ sheets: [{ name: "Sheet1", rows: rows ?? [] }] });
      const doc = await createDocument({ companyId: ctx.companyId, userId: ctx.userId, name, fileType, buffer, mimeType: MIME_BY_TYPE[fileType] });
      return `✅ Đã tạo tài liệu "${doc.name}" (${fileType}). ID: ${doc.id}`;
    } catch (err) {
      return `❌ Không tạo được tài liệu: ${err instanceof Error ? err.message : "lỗi"}`;
    }
  },
};

// ─── edit_document ────────────────────────────────────────────────────────────

const editDocument: StandaloneTool = {
  definition: {
    name: "edit_document",
    description: "Cập nhật nội dung tài liệu (lưu thành version mới). Hiện hỗ trợ tốt nhất cho Markdown; file Office nên chỉnh bằng trình soạn thảo.",
    input_schema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "ID tài liệu cần sửa" },
        content: { type: "string", description: "Nội dung mới (text/markdown) để lưu thành version mới" },
      },
      required: ["documentId", "content"],
    },
  },
  async execute(input, ctx) {
    const { documentId, content } = input as { documentId: string; content: string };
    try {
      const doc = await prisma.document.findFirst({ where: { id: documentId, companyId: ctx.companyId, deletedAt: null } });
      if (!doc) return "❌ Tài liệu không tồn tại";
      if (doc.fileType !== "md") return "⚠️ Hiện chỉ sửa được tài liệu Markdown qua tool; file Office vui lòng dùng trình soạn thảo OnlyOffice.";
      const v = await saveDocumentVersion({
        documentId, userId: ctx.userId, buffer: Buffer.from(content, "utf8"), mimeType: MIME_BY_TYPE.md, companyId: ctx.companyId,
      });
      return `✅ Đã lưu version ${v.versionNo} cho tài liệu "${doc.name}"`;
    } catch (err) {
      return `❌ Không sửa được tài liệu: ${err instanceof Error ? err.message : "lỗi"}`;
    }
  },
};

// ─── Registry độc lập ───────────────────────────────────────────────────────────

/** Tất cả document tool dạng độc lập. Nơi khác tự quyết định khi nào/cho ai dùng. */
export const DOCUMENT_TOOLS: StandaloneTool[] = [
  readDocument,
  createFromTemplate,
  createNew,
  editDocument,
];

const BY_NAME = new Map(DOCUMENT_TOOLS.map((t) => [t.definition.name, t]));

/** Chỉ lấy phần schema (truyền cho LLM). */
export const DOCUMENT_TOOL_DEFINITIONS: ToolDefinition[] = DOCUMENT_TOOLS.map((t) => t.definition);

/** true nếu name thuộc bộ document tools. */
export function isDocumentTool(name: string): boolean {
  return BY_NAME.has(name);
}

export function getDocumentTool(name: string): StandaloneTool | undefined {
  return BY_NAME.get(name);
}

/** Chạy một document tool theo tên. Throw nếu không tồn tại. */
export async function executeDocumentTool(
  name: string,
  input: Record<string, unknown>,
  ctx: DocumentToolContext
): Promise<string> {
  const tool = BY_NAME.get(name);
  if (!tool) throw new Error(`Document tool không tồn tại: ${name}`);
  return tool.execute(input, ctx);
}
