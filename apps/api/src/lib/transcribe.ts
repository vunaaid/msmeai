// src/lib/transcribe.ts
// Bóc nội dung audio → text bằng Whisper service (FastAPI + faster-whisper).
//
// Hỗ trợ ghi âm DÀI (1-2h): tải audio từ MinIO → dùng ffmpeg cắt thành các đoạn
// (chunk) wav 16kHz mono → gọi Whisper tuần tự từng đoạn → ghép transcript dần
// và cập nhật % tiến độ vào DB. Lợi ích:
//   • Phản hồi tiến độ cho người dùng (audio 2h không "im lặng" hàng chục phút).
//   • Chịu lỗi: hỏng ở đoạn k vẫn giữ transcript 0..k-1.
//   • Bộ nhớ giới hạn theo từng đoạn thay vì nạp cả file lớn vào 1 request.
// Trên máy CPU-only, 1 instance Whisper đã dùng toàn bộ core (cpu_threads) nên chạy
// chunk tuần tự là nhanh & ổn định nhất.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@vsme/db/client";
import { getObjectBuffer } from "@vsme/storage";

const execFileAsync = promisify(execFile);

const WHISPER_API_URL = process.env["WHISPER_API_URL"] ?? "http://localhost:8001";
const WHISPER_LANGUAGE = process.env["WHISPER_LANGUAGE"] ?? "vi";
const FFMPEG = process.env["FFMPEG_PATH"] ?? "ffmpeg";
const FFPROBE = process.env["FFPROBE_PATH"] ?? "ffprobe";
// Độ dài mỗi đoạn (giây). 600s = 10 phút → audio 2h ≈ 12 đoạn.
const CHUNK_SECONDS = Number(process.env["AUDIO_CHUNK_SECONDS"] ?? 600);

export interface TranscribeResult {
  text: string;
  language: string;
  duration: number; // giây
}

/** Gửi 1 buffer audio tới Whisper service và nhận transcript. */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<TranscribeResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
  form.append("language", WHISPER_LANGUAGE);

  const res = await fetch(`${WHISPER_API_URL}/transcribe`, { method: "POST", body: form });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Whisper service ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as Partial<TranscribeResult>;
  return {
    text: (data.text ?? "").trim(),
    language: data.language ?? WHISPER_LANGUAGE,
    duration: Math.round(data.duration ?? 0),
  };
}

/** Đọc thời lượng audio (giây) bằng ffprobe. */
async function probeDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(FFPROBE, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const sec = parseFloat(stdout.trim());
    return Number.isFinite(sec) ? Math.round(sec) : 0;
  } catch {
    return 0;
  }
}

/** Cắt audio thành các đoạn wav 16kHz mono, trả về danh sách đường dẫn (đã sắp xếp). */
async function splitToChunks(inputPath: string, outDir: string): Promise<string[]> {
  await execFileAsync(FFMPEG, [
    "-hide_banner", "-loglevel", "error",
    "-i", inputPath,
    "-ar", "16000", "-ac", "1",          // 16kHz mono — định dạng Whisper ưa thích
    "-f", "segment",
    "-segment_time", String(CHUNK_SECONDS),
    "-reset_timestamps", "1",
    join(outDir, "chunk_%04d.wav"),
  ], { maxBuffer: 1024 * 1024 * 16 });

  const files = (await readdir(outDir))
    .filter(f => f.startsWith("chunk_") && f.endsWith(".wav"))
    .sort();
  return files.map(f => join(outDir, f));
}

/**
 * Bóc nội dung 1 NoteBlock dạng voice ở background (fire-and-forget).
 * Cắt đoạn → bóc tuần tự → cập nhật transcript + % dần. Tự bắt lỗi (không ném ra).
 */
export async function runBlockTranscription(blockId: string): Promise<void> {
  let workDir: string | null = null;
  try {
    const block = await prisma.noteBlock.findUnique({ where: { id: blockId } });
    if (!block || !block.audioBucket || !block.audioPath) return;

    await prisma.noteBlock.update({
      where: { id: blockId },
      data: { transcriptStatus: "processing", transcriptProgress: 0, text: "" },
    });

    const buffer = await getObjectBuffer(block.audioBucket, block.audioPath);

    workDir = await mkdtemp(join(tmpdir(), "vsme-whisper-"));
    const ext = block.audioPath.split(".").pop() ?? "webm";
    const inputPath = join(workDir, `input.${ext}`);
    await writeFile(inputPath, buffer);

    const duration = await probeDuration(inputPath);
    if (duration > 0 && duration !== block.audioDuration) {
      await prisma.noteBlock.update({ where: { id: blockId }, data: { audioDuration: duration } });
    }

    // Audio ngắn → 1 lần; audio dài → cắt đoạn
    const chunks = duration > 0 && duration <= CHUNK_SECONDS
      ? [await singleChunk(inputPath, workDir)]
      : await splitToChunks(inputPath, workDir);

    const parts: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkBuf = await readFile(chunks[i]!);
      const result = await transcribeAudio(chunkBuf, `chunk_${i}.wav`, "audio/wav");
      if (result.text) parts.push(result.text);
      await prisma.noteBlock.update({
        where: { id: blockId },
        data: {
          text: parts.join("\n"),
          transcriptProgress: Math.round(((i + 1) / chunks.length) * 100),
        },
      });
    }

    await prisma.noteBlock.update({
      where: { id: blockId },
      data: { transcriptStatus: "done", transcriptProgress: 100, text: parts.join("\n") },
    });
  } catch (err) {
    console.error(`[transcribe] block ${blockId} failed:`, err);
    await prisma.noteBlock
      .update({ where: { id: blockId }, data: { transcriptStatus: "failed" } })
      .catch(() => {});
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Chuẩn hoá audio ngắn về wav 16kHz mono (1 đoạn). */
async function singleChunk(inputPath: string, outDir: string): Promise<string> {
  const out = join(outDir, "chunk_0000.wav");
  await execFileAsync(FFMPEG, [
    "-hide_banner", "-loglevel", "error",
    "-i", inputPath, "-ar", "16000", "-ac", "1", out,
  ], { maxBuffer: 1024 * 1024 * 16 });
  return out;
}
