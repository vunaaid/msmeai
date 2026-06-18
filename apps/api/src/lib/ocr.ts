// src/lib/ocr.ts
// Ảnh → text bằng OCR (Tesseract, offline). Gọi nội bộ tới service Python
// (cùng tiến trình FastAPI với Whisper/TTS, cổng 8001).

const OCR_API_URL =
  process.env["OCR_API_URL"] ?? process.env["WHISPER_API_URL"] ?? "http://localhost:8001";
const OCR_LANG = process.env["OCR_LANG"] ?? "vie+eng";

/** Trích xuất text từ 1 ảnh. Trả về chuỗi đã gom khoảng trắng (giữ xuống dòng). */
export async function ocrImage(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
  form.append("language", OCR_LANG);

  const res = await fetch(`${OCR_API_URL}/ocr`, { method: "POST", body: form });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OCR service ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
