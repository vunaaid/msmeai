"use client";

// src/app/(dashboard)/notes/image-ocr.tsx
// Chụp ảnh (camera trực tiếp qua getUserMedia — chạy cả desktop & mobile) hoặc tải ảnh
// → upload cho 1 note → backend OCR (Tesseract) → tạo block text với nội dung trích xuất.

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, ImagePlus, Loader2, X, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/api/client";

interface Props {
  noteId: string;
  onUploaded: () => void;
}

export function ImageOcr({ noteId, onUploaded }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [showCam, setShowCam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Gắn stream vào <video> khi modal mở; dọn dẹp khi đóng/unmount.
  useEffect(() => {
    if (showCam && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {});
    }
  }, [showCam]);
  useEffect(() => () => stopStream(), []);

  const upload = async (file: Blob, filename: string) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file, filename);
      await apiFetch(`/api/notes/${noteId}/ocr`, { method: "POST", body: form });
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR thất bại");
    } finally {
      setBusy(false);
    }
  };

  // ─── Tải ảnh từ máy / thư viện ─────────────────────────────
  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await upload(file, file.name || "image.jpg");
  };

  // ─── Camera trực tiếp ──────────────────────────────────────
  const openCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Trình duyệt không hỗ trợ camera. Hãy dùng 'Tải ảnh'.");
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }, // camera sau trên điện thoại
        audio: false,
      });
      setShowCam(true);
    } catch {
      setError("Không mở được camera. Cấp quyền camera + dùng HTTPS/localhost, hoặc dùng 'Tải ảnh'.");
    }
  };

  const closeCamera = () => {
    stopStream();
    setShowCam(false);
  };

  const snap = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        closeCamera();
        if (blob) void upload(blob, "chup-anh.jpg");
      },
      "image/jpeg",
      0.92,
    );
  };

  const btn =
    "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:border-sky-500/60 hover:text-sky-300 transition-colors disabled:opacity-50";

  return (
    <div className="inline-flex items-center gap-2">
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />

      {busy ? (
        <span className={btn}>
          <Loader2 size={13} className="animate-spin" /> Đang OCR…
        </span>
      ) : (
        <>
          <button type="button" onClick={() => void openCamera()} className={btn}>
            <Camera size={13} /> Chụp ảnh
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className={btn}>
            <ImagePlus size={13} /> Tải ảnh
          </button>
        </>
      )}
      {error && <span className="text-xs text-rose-400">{error}</span>}

      {/* Modal camera trực tiếp */}
      {showCam && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4">
          <div className="relative w-full max-w-lg">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full rounded-xl bg-black aspect-[3/4] object-cover"
            />
            <button
              type="button"
              onClick={closeCamera}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70"
              aria-label="Đóng"
            >
              <X size={18} />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={snap}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-full bg-sky-600 text-white hover:bg-sky-500"
            >
              <Camera size={16} /> Chụp
            </button>
            <button
              type="button"
              onClick={closeCamera}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm rounded-full border border-slate-600 text-slate-200 hover:bg-slate-800"
            >
              <RotateCcw size={15} /> Hủy
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-400">Đưa văn bản vào khung rồi bấm Chụp để OCR</p>
        </div>
      )}
    </div>
  );
}
