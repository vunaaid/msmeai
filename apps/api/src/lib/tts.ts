// src/lib/tts.ts
// Đọc văn bản → audio mp3 bằng edge-tts (giọng tiếng Việt online của Microsoft).
// Gọi nội bộ tới service Python (cùng tiến trình với Whisper, FastAPI cổng 8001).

const TTS_API_URL =
  process.env["TTS_API_URL"] ?? process.env["WHISPER_API_URL"] ?? "http://localhost:8001";
const TTS_VOICE = process.env["TTS_VOICE"] ?? "vi-VN-HoaiMyNeural";

/** Tổng hợp giọng đọc cho `text`, trả về Buffer mp3 (audio/mpeg). */
export async function synthesizeSpeech(text: string, voice?: string): Promise<Buffer> {
  const res = await fetch(`${TTS_API_URL}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: voice || TTS_VOICE }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`TTS service ${res.status}: ${detail.slice(0, 300)}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}
