// src/modules/chat/agent-data.ts
// Dữ liệu thật cho agent: liệt kê tài liệu hiện có (để trả lời đúng "có/chưa có"),
// đọc nội dung tài liệu liên quan (để tổng hợp), và tạo file markdown lưu MinIO
// (hiện trong mục Tài liệu) trả về link theo dõi.

import { prisma, Prisma } from "@vsme/db/client";
import type { DocumentFileType } from "@vsme/db";
import { createDocument, readDocumentText } from "@vsme/storage";

export interface DocRef { id: string; name: string; fileType: string }

// Quyền đọc theo role của agent: allowedRoleIds null = toàn công ty, hoặc chứa roleId.
function roleAccessWhere(roleId: string | null): Prisma.DocumentWhereInput {
  const or: Prisma.DocumentWhereInput[] = [{ allowedRoleIds: { equals: Prisma.DbNull } }];
  if (roleId) or.push({ allowedRoleIds: { array_contains: roleId } });
  return { OR: or };
}

// Danh sách tài liệu agent được phép đọc (mới nhất trước), giới hạn để prompt không quá dài.
export async function loadDocRoster(companyId: string, roleId: string | null): Promise<DocRef[]> {
  return prisma.document.findMany({
    where: { companyId, deletedAt: null, ...roleAccessWhere(roleId) },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, name: true, fileType: true },
  });
}

// Text liệt kê tài liệu cho prompt.
export function rosterText(roster: DocRef[]): string {
  if (roster.length === 0) return "(Chưa có tài liệu nào trong hệ thống)";
  return roster.map((d) => `- ${d.name} [${d.fileType}]`).join("\n");
}

// Đọc nội dung các tài liệu có tên khớp từ khoá trong "focus" (bounded) để agent tổng hợp/cung cấp.
export async function fetchRelevantDocText(
  companyId: string, focus: string, roster: DocRef[], limit = 3,
): Promise<{ name: string; text: string }[]> {
  const words = [...new Set(focus.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3))];
  if (words.length === 0) return [];
  const scored = roster
    .map((d) => {
      const n = d.name.toLowerCase();
      return { d, score: words.reduce((s, w) => s + (n.includes(w) ? 1 : 0), 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const out: { name: string; text: string }[] = [];
  for (const { d } of scored) {
    try {
      const text = await readDocumentText({ documentId: d.id, companyId });
      if (text.trim()) out.push({ name: d.name, text: text.slice(0, 4000) });
    } catch { /* bỏ qua tài liệu không đọc được */ }
  }
  return out;
}

// Gộp roster + nội dung liên quan thành 1 khối "dữ liệu thực tế" cho prompt (theo quyền role).
export async function buildDataContext(companyId: string, focus: string, roleId: string | null): Promise<string> {
  const roster = await loadDocRoster(companyId, roleId);
  const relevant = await fetchRelevantDocText(companyId, focus, roster);
  let ctx = `Tài liệu hiện có trong hệ thống:\n${rosterText(roster)}`;
  if (relevant.length > 0) {
    ctx += `\n\nNội dung tài liệu liên quan:\n` +
      relevant.map((r) => `### ${r.name}\n${r.text}`).join("\n\n");
  }
  return ctx;
}

// Tạo file markdown lưu MinIO (xuất hiện trong mục Tài liệu) → trả id + link theo dõi.
export async function createMarkdownReport(
  companyId: string, userId: string, name: string, markdown: string,
): Promise<{ id: string; link: string } | null> {
  try {
    const doc = await createDocument({
      companyId, userId,
      name: name.trim().slice(0, 200) || "Báo cáo",
      fileType: "md" as DocumentFileType,
      buffer: Buffer.from(markdown, "utf8"),
      mimeType: "text/markdown",
    });
    return { id: doc.id, link: `/documents/${doc.id}` };
  } catch (e) {
    console.error("[chat:agent] tạo tài liệu md lỗi:", e);
    return null;
  }
}
