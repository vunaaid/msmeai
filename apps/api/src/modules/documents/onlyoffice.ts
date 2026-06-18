// src/modules/documents/onlyoffice.ts
// OnlyOffice Document Server — ký/verify JWT và dựng editor config.
// Docs: https://api.onlyoffice.com/editors/config/

import jwt from "jsonwebtoken";
import type { DocumentFileType } from "@vsme/db";

const JWT_SECRET = process.env["ONLYOFFICE_JWT_SECRET"] ?? "";
// URL của API mà OnlyOffice container gọi callback được (server→server).
// Trong Docker thường là http://api:4000 hoặc http://<host-ip>:4000.
const CALLBACK_BASE = process.env["ONLYOFFICE_CALLBACK_BASE"] ?? "http://localhost:4000";

const DOC_TYPE: Record<DocumentFileType, "word" | "cell" | "slide"> = {
  docx: "word",
  xlsx: "cell",
  pptx: "slide",
  md: "word", // markdown không mở bằng OnlyOffice (dùng editor riêng)
};

export function isOnlyOfficeEnabled(): boolean {
  return Boolean(process.env["ONLYOFFICE_URL"]);
}

/** Ký payload bằng HS256 (OnlyOffice JWT). Trả "" nếu chưa cấu hình secret. */
export function signOnlyOffice(payload: Record<string, unknown>): string {
  if (!JWT_SECRET) return "";
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}

/** Verify token từ callback OnlyOffice. Trả payload hoặc null nếu sai. */
export function verifyOnlyOffice(token: string): Record<string, unknown> | null {
  if (!JWT_SECRET) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface EditorConfigParams {
  documentId: string;
  fileType: DocumentFileType;
  title: string;
  versionKey: string;     // duy nhất theo version → đổi khi nội dung đổi
  documentUrl: string;    // URL OnlyOffice tải file (presigned MinIO)
  user: { id: string; name: string };
  canEdit: boolean;
}

/** Dựng config truyền cho DocsAPI.DocEditor ở client (đã ký JWT). */
export function buildEditorConfig(p: EditorConfigParams) {
  const config: Record<string, unknown> = {
    document: {
      fileType: p.fileType,
      key: p.versionKey,
      title: p.title,
      url: p.documentUrl,
      permissions: { edit: p.canEdit, download: true },
    },
    documentType: DOC_TYPE[p.fileType],
    editorConfig: {
      callbackUrl: `${CALLBACK_BASE}/api/documents/${p.documentId}/callback`,
      mode: p.canEdit ? "edit" : "view",
      lang: "vi",
      user: { id: p.user.id, name: p.user.name },
    },
  };
  const token = signOnlyOffice(config);
  if (token) config["token"] = token;
  return config;
}
