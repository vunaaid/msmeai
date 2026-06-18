"use client";

// src/app/(dashboard)/notes/voice-recorder.tsx
// Ghi âm bằng MediaRecorder → upload audio cho 1 note → backend bóc nội dung (Whisper).

import { useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api/client";

interface Props {
  noteId: string;
  onUploaded: () => void;
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? "";
}

export function VoiceRecorder({ noteId, onUploaded }: Props) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const mimeType = pickMimeType();
      // 32kbps opus mono đủ cho giọng nói → ghi âm 2h chỉ ~28MB, upload nhanh.
      const rec = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 32000,
      });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        void upload(rec.mimeType || mimeType || "audio/webm");
      };
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(
        () => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)),
        500,
      );
      rec.start(5000); // flush mỗi 5s → ghi âm dài (1-2h) không mất dữ liệu nếu tab gặp sự cố
      setRecording(true);
    } catch {
      setError("Không truy cập được micro. Hãy cấp quyền và dùng HTTPS/localhost.");
    }
  };

  const stop = () => {
    stopTimer();
    setRecording(false);
    recorderRef.current?.stop();
  };

  const upload = async (mimeType: string) => {
    const blob = new Blob(chunksRef.current, { type: mimeType });
    if (blob.size === 0) return;
    const durationSec = Math.round((Date.now() - startedAtRef.current) / 1000);
    setUploading(true);
    setError(null);
    try {
      const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
      const form = new FormData();
      form.append("file", blob, `ghi-am.${ext}`);
      form.append("duration", String(durationSec));
      await apiFetch(`/api/notes/${noteId}/audio`, { method: "POST", body: form });
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tải ghi âm thất bại");
    } finally {
      setUploading(false);
    }
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="inline-flex items-center gap-2">
      {!recording ? (
        <button
          type="button"
          onClick={start}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:border-rose-500/60 hover:text-rose-300 transition-colors disabled:opacity-50"
        >
          {uploading
            ? <><Loader2 size={13} className="animate-spin" /> Đang tải & bóc nội dung…</>
            : <><Mic size={13} /> Ghi âm</>}
        </button>
      ) : (
        <button
          type="button"
          onClick={stop}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-rose-600/20 border border-rose-500/60 text-rose-300 hover:bg-rose-600/30 transition-colors"
        >
          <Square size={12} className="animate-pulse" /> Dừng • {fmt(elapsed)}
        </button>
      )}
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </div>
  );
}
