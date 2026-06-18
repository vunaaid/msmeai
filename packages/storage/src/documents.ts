// packages/storage/src/documents.ts
// Document & Template service dùng chung cho apps/api (router) và packages/ai-sdk (AI tools).
// Gồm: trích xuất nội dung, sinh/điền file Office & Markdown, và thao tác DB.

import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "@vsme/db/client";
import type { DocumentFileType } from "@vsme/db";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { parseOfficeAsync } from "officeparser";
import { Document as DocxDocument, Packer, Paragraph, HeadingLevel } from "docx";
import { BUCKETS, buildStoragePath, uploadBuffer, getObjectBuffer } from "./minio.js";

// ─── MIME helpers ───────────────────────────────────────────────────────────

export const MIME_BY_TYPE: Record<DocumentFileType, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  md: "text/markdown",
};

const EXT_BY_TYPE: Record<DocumentFileType, string> = {
  docx: ".docx",
  xlsx: ".xlsx",
  pptx: ".pptx",
  md: ".md",
};

/** Suy ra DocumentFileType từ tên file / mime. Trả null nếu không hỗ trợ. */
export function detectFileType(originalName: string, mimeType?: string): DocumentFileType | null {
  const lower = originalName.toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".pptx")) return "pptx";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "md";
  if (mimeType === MIME_BY_TYPE.docx) return "docx";
  if (mimeType === MIME_BY_TYPE.xlsx) return "xlsx";
  if (mimeType === MIME_BY_TYPE.pptx) return "pptx";
  if (mimeType === "text/markdown") return "md";
  return null;
}

// ─── Trích xuất nội dung dạng text ────────────────────────────────────────────

export async function extractText(buffer: Buffer, fileType: DocumentFileType): Promise<string> {
  switch (fileType) {
    case "md":
      return buffer.toString("utf8");
    case "docx": {
      const { value } = await mammoth.extractRawText({ buffer });
      return value;
    }
    case "xlsx": {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      const out: string[] = [];
      wb.eachSheet((sheet) => {
        out.push(`# ${sheet.name}`);
        sheet.eachRow((row) => {
          const cells: string[] = [];
          row.eachCell({ includeEmpty: false }, (cell) => cells.push(String(cell.value ?? "")));
          out.push(cells.join("\t"));
        });
      });
      return out.join("\n");
    }
    case "pptx": {
      // officeparser xử lý text cho pptx (và nhiều định dạng khác).
      return await parseOfficeAsync(buffer);
    }
  }
}

/** HTML preview cho docx (mammoth). Các loại khác trả null (dùng OnlyOffice/markdown viewer). */
export async function extractDocxHtml(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml({ buffer });
  return value;
}

// ─── Sinh file mới ────────────────────────────────────────────────────────────

/** Sinh .docx đơn giản từ tiêu đề + các đoạn văn. */
export async function generateDocx(opts: { title?: string; paragraphs: string[] }): Promise<Buffer> {
  const children: Paragraph[] = [];
  if (opts.title) children.push(new Paragraph({ text: opts.title, heading: HeadingLevel.HEADING_1 }));
  for (const p of opts.paragraphs) children.push(new Paragraph({ text: p }));
  const doc = new DocxDocument({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

/** Sinh .xlsx từ danh sách sheet (mảng dòng, mỗi dòng là mảng ô). */
export async function generateXlsx(opts: { sheets: Array<{ name: string; rows: (string | number)[][] }> }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const s of opts.sheets.length ? opts.sheets : [{ name: "Sheet1", rows: [] }]) {
    const ws = wb.addWorksheet(s.name || "Sheet1");
    for (const row of s.rows) ws.addRow(row);
  }
  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr as ArrayBuffer);
}

// ─── Convert sang PDF (LibreOffice headless) — phục vụ xem trong trình duyệt ───

const SOFFICE_BIN = process.env["SOFFICE_BIN"] ?? "soffice";

/**
 * Convert docx/xlsx/pptx → PDF bằng LibreOffice headless.
 * Mỗi lần dùng UserInstallation riêng (tmp) để chạy song song không kẹt lock.
 * (md không hỗ trợ — markdown render riêng ở client.)
 */
export async function convertToPdf(buffer: Buffer, fileType: DocumentFileType): Promise<Buffer> {
  if (fileType === "md") throw new Error("Markdown không convert PDF qua LibreOffice");
  const dir = await mkdtemp(join(tmpdir(), "vsme-pdf-"));
  try {
    const inPath = join(dir, `in${EXT_BY_TYPE[fileType]}`);
    await writeFile(inPath, buffer);
    await new Promise<void>((resolve, reject) => {
      execFile(
        SOFFICE_BIN,
        [
          "--headless", "--nologo", "--nofirststartwizard", "--norestore",
          `-env:UserInstallation=file://${join(dir, "profile")}`,
          "--convert-to", "pdf", "--outdir", dir, inPath,
        ],
        { timeout: 90_000 },
        (err) => (err ? reject(err) : resolve()),
      );
    });
    return await readFile(join(dir, "in.pdf"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ─── Render xlsx → HTML (bảng cuộn được) — đọc dễ hơn PDF nhiều ────────────────

const XLSX_MAX_ROWS = 10000; // chặn payload khổng lồ; có thông báo nếu cắt

function htmlEscape(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toLocaleDateString("vi-VN");
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if (Array.isArray((v as { richText?: unknown }).richText)) {
      return ((v as { richText: Array<{ text: string }> }).richText).map((r) => r.text).join("");
    }
    if ("text" in v) return String(v["text"]);
    if ("result" in v) return String(v["result"]);
    if ("hyperlink" in v) return String(v["text"] ?? v["hyperlink"]);
    return "";
  }
  return String(value);
}

/** Render workbook xlsx thành 1 trang HTML tự chứa (mỗi sheet 1 bảng, cuộn ngang/dọc). */
export async function renderXlsxHtml(buffer: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sections: string[] = [];

  wb.eachSheet((sheet) => {
    const rows: string[] = [];
    let count = 0;
    let truncated = false;
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (count >= XLSX_MAX_ROWS) { truncated = true; return; }
      count++;
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const isNum = typeof cell.value === "number";
        const tag = rowNumber === 1 ? "th" : "td";
        const cls = isNum ? ' class="num"' : "";
        cells.push(`<${tag}${cls}>${htmlEscape(cellToString(cell.value))}</${tag}>`);
      });
      rows.push(`<tr>${cells.join("")}</tr>`);
    });
    const note = truncated ? `<p class="note">⚠ Chỉ hiển thị ${XLSX_MAX_ROWS.toLocaleString("vi-VN")} dòng đầu. Tải về để xem đầy đủ.</p>` : "";
    sections.push(`<section><h2>${htmlEscape(sheet.name)}</h2><div class="wrap"><table>${rows.join("")}</table></div>${note}</section>`);
  });

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}
body{margin:0;padding:0;font:13px/1.45 system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;background:#fff}
#content{padding:16px 16px 64px}
h2{font-size:14px;margin:18px 0 8px;color:#0369a1}
#content section:first-child h2{margin-top:0}
.wrap{overflow:auto;border:1px solid #e2e8f0;border-radius:8px}
table{border-collapse:collapse;white-space:nowrap;font-variant-numeric:tabular-nums}
th,td{border:1px solid #e2e8f0;padding:4px 9px;text-align:left;max-width:480px;overflow:hidden;text-overflow:ellipsis}
th{background:#f1f5f9;font-weight:600;position:sticky;top:0;z-index:1}
td.num,th.num{text-align:right}
tr:nth-child(even) td{background:#f8fafc}
.note{color:#b45309;font-size:12px;margin:6px 2px}
#zoombar{position:fixed;bottom:16px;right:16px;z-index:30;display:flex;align-items:center;gap:2px;background:#0f172a;color:#fff;border-radius:10px;padding:4px;box-shadow:0 4px 14px rgba(0,0,0,.3);font:600 12px/1 system-ui,sans-serif}
#zoombar button{width:30px;height:30px;border:0;background:transparent;color:#fff;font-size:17px;line-height:1;cursor:pointer;border-radius:7px}
#zoombar button:hover{background:#1e293b}
#zoombar span{min-width:48px;text-align:center;user-select:none}
</style></head><body>
<div id="content">${sections.join("") || "<p style='padding:16px'>Bảng tính trống.</p>"}</div>
<div id="zoombar"><button id="zo" title="Thu nhỏ (Ctrl -)">−</button><span id="zv">100%</span><button id="zi" title="Phóng to (Ctrl +)">+</button><button id="zr" title="Đặt lại (Ctrl 0)" style="font-size:14px">⟲</button></div>
<script>
(function(){
  var z=100, el=document.getElementById('content'), lbl=document.getElementById('zv');
  function apply(){ el.style.zoom=z/100; lbl.textContent=z+'%'; }
  function set(v){ z=Math.min(300,Math.max(50,Math.round(v/10)*10)); apply(); }
  document.getElementById('zi').onclick=function(){set(z+10);};
  document.getElementById('zo').onclick=function(){set(z-10);};
  document.getElementById('zr').onclick=function(){set(100);};
  addEventListener('keydown',function(e){ if(!e.ctrlKey&&!e.metaKey)return;
    if(e.key==='='||e.key==='+'){e.preventDefault();set(z+10);}
    else if(e.key==='-'||e.key==='_'){e.preventDefault();set(z-10);}
    else if(e.key==='0'){e.preventDefault();set(100);} });
  addEventListener('wheel',function(e){ if(e.ctrlKey){e.preventDefault();set(z+(e.deltaY<0?10:-10));} },{passive:false});
})();
</script>
</body></html>`;
}

// ─── Điền template ({{placeholder}}) ──────────────────────────────────────────

const HBS = /\{\{\s*([\w.]+)\s*\}\}/g;

function fillString(text: string, data: Record<string, unknown>): string {
  return text.replace(HBS, (_m, key: string) => {
    const v = key.split(".").reduce<unknown>((acc, k) => (acc == null ? acc : (acc as Record<string, unknown>)[k]), data);
    return v == null ? "" : String(v);
  });
}

/** Điền dữ liệu vào template theo loại file; trả buffer file kết quả. */
export async function fillTemplate(templateBuffer: Buffer, fileType: DocumentFileType, data: Record<string, unknown>): Promise<Buffer> {
  switch (fileType) {
    case "md":
      return Buffer.from(fillString(templateBuffer.toString("utf8"), data), "utf8");
    case "docx": {
      const zip = new PizZip(templateBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: "{{", end: "}}" },
      });
      doc.render(data);
      return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
    }
    case "xlsx": {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(templateBuffer as unknown as ArrayBuffer);
      wb.eachSheet((sheet) => {
        sheet.eachRow((row) => {
          row.eachCell({ includeEmpty: false }, (cell) => {
            if (typeof cell.value === "string" && HBS.test(cell.value)) {
              HBS.lastIndex = 0;
              cell.value = fillString(cell.value, data);
            }
          });
        });
      });
      const arr = await wb.xlsx.writeBuffer();
      return Buffer.from(arr as ArrayBuffer);
    }
    case "pptx":
      // Điền pptx phức tạp — chưa hỗ trợ; trả nguyên bản template.
      return templateBuffer;
  }
}

// ─── Thao tác DB: Document + Version ──────────────────────────────────────────

export interface StoredDoc {
  id: string;
  name: string;
  fileType: DocumentFileType;
}

/** Lưu buffer thành 1 version mới của document (tạo document nếu chưa có). */
export async function saveDocumentVersion(params: {
  documentId: string;
  userId: string;
  buffer: Buffer;
  mimeType: string;
  companyId: string;
}): Promise<{ versionId: string; versionNo: number }> {
  const last = await prisma.documentVersion.findFirst({
    where: { documentId: params.documentId },
    orderBy: { versionNo: "desc" },
  });
  const versionNo = (last?.versionNo ?? 0) + 1;

  const doc = await prisma.document.findUnique({ where: { id: params.documentId } });
  if (!doc || doc.companyId !== params.companyId) throw new Error("Document not found");

  const ext = EXT_BY_TYPE[doc.fileType];
  const storagePath = buildStoragePath(`${params.companyId}/documents/${params.documentId}`, `v${versionNo}${ext}`);
  const { bucket, size } = await uploadBuffer({ storagePath, buffer: params.buffer, mimeType: params.mimeType });

  const version = await prisma.documentVersion.create({
    data: { documentId: params.documentId, versionNo, bucket, storagePath, mimeType: params.mimeType, size, createdBy: params.userId },
  });
  await prisma.document.update({ where: { id: params.documentId }, data: { currentVersionId: version.id } });
  return { versionId: version.id, versionNo };
}

/** Tạo document mới từ buffer (upload hoặc sinh sẵn). */
export async function createDocument(params: {
  companyId: string;
  userId: string;
  name: string;
  fileType: DocumentFileType;
  buffer: Buffer;
  mimeType: string;
  templateId?: string | null;
}): Promise<StoredDoc> {
  const doc = await prisma.document.create({
    data: {
      companyId: params.companyId,
      name: params.name,
      fileType: params.fileType,
      templateId: params.templateId ?? null,
      createdBy: params.userId,
    },
  });
  await saveDocumentVersion({
    documentId: doc.id,
    userId: params.userId,
    buffer: params.buffer,
    mimeType: params.mimeType,
    companyId: params.companyId,
  });
  return { id: doc.id, name: doc.name, fileType: doc.fileType };
}

/** Tạo document từ template: tải file mẫu → điền data → lưu thành document mới. */
export async function createDocumentFromTemplate(params: {
  companyId: string;
  userId: string;
  templateId: string;
  name?: string;
  data: Record<string, unknown>;
}): Promise<StoredDoc> {
  const tpl = await prisma.documentTemplate.findFirst({
    where: {
      id: params.templateId,
      deletedAt: null,
      OR: [{ companyId: params.companyId }, { companyId: null }],
    },
  });
  if (!tpl) throw new Error("Template không tồn tại hoặc không thuộc công ty");

  const templateBuffer = await getObjectBuffer(tpl.bucket, tpl.storagePath);
  const filled = await fillTemplate(templateBuffer, tpl.fileType, params.data);

  return createDocument({
    companyId: params.companyId,
    userId: params.userId,
    name: params.name ?? `${tpl.name} - ${new Date().toISOString().slice(0, 10)}`,
    fileType: tpl.fileType,
    buffer: filled,
    mimeType: MIME_BY_TYPE[tpl.fileType],
    templateId: tpl.id,
  });
}

/** Đọc nội dung text của document (version hiện tại). */
export async function readDocumentText(params: { documentId: string; companyId: string }): Promise<string> {
  const doc = await prisma.document.findUnique({
    where: { id: params.documentId },
    include: { currentVersion: true },
  });
  if (!doc || doc.companyId !== params.companyId || doc.deletedAt) throw new Error("Document not found");
  if (!doc.currentVersion) return "";
  const buffer = await getObjectBuffer(doc.currentVersion.bucket, doc.currentVersion.storagePath);
  return extractText(buffer, doc.fileType);
}

export { BUCKETS };
