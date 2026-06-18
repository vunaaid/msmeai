"use client";

// src/app/(dashboard)/documents/upload-modal.tsx
// Modal kéo-thả upload tài liệu hoặc template (multipart → /api/documents[/templates]/upload).

import { useState, useRef, useEffect } from "react";
import { X, UploadCloud, Loader2, FileStack } from "lucide-react";
import { RoleAccessPicker } from "./role-access-picker";

interface Props {
  kind: null | "document" | "template";
  folderId?: string | null; // thư mục đích khi tải tài liệu (không áp dụng cho template)
  folderName?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

const ACCEPT = ".docx,.xlsx,.pptx,.md,.markdown";

export function UploadModal({ kind, folderId, folderName, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [allowedRoles, setAllowedRoles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!kind) {
      setFile(null); setName(""); setCategory(""); setDescription(""); setAllowedRoles([]); setError(null);
    }
  }, [kind]);

  if (!kind) return null;
  const isTemplate = kind === "template";

  function pick(f: File | null) {
    if (!f) return;
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError("Hãy chọn file"); return; }
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (name) form.append("name", name);
      if (isTemplate) {
        if (category) form.append("category", category);
        if (description) form.append("description", description);
      } else {
        if (allowedRoles.length > 0) form.append("allowedRoleIds", JSON.stringify(allowedRoles));
        if (folderId) form.append("folderId", folderId);
      }
      const url = isTemplate ? "/api/documents/templates/upload" : "/api/documents/upload";
      const res = await fetch(url, { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error?.message ?? `Tải lên thất bại (${res.status})`);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi kết nối");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-cyan-500/10 rounded-lg"><FileStack size={16} className="text-cyan-400" /></div>
            <h2 className="text-base font-semibold text-white">{isTemplate ? "Tải lên template" : "Tải lên tài liệu"}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X size={16} /></button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">⚠ {error}</div>}

          {!isTemplate && folderName && (
            <div className="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700 text-xs text-slate-300">
              Lưu vào thư mục: <span className="text-cyan-300 font-medium">{folderName}</span>
            </div>
          )}

          {/* Dropzone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files?.[0] ?? null); }}
            className={`flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
              dragOver ? "border-cyan-500 bg-cyan-500/5" : "border-slate-700 hover:border-slate-500"
            }`}
          >
            <UploadCloud className="w-8 h-8 text-slate-500" />
            <p className="text-sm text-slate-300">{file ? file.name : "Kéo thả hoặc bấm để chọn file"}</p>
            <p className="text-[11px] text-slate-500">docx, xlsx, pptx, md (tối đa 50MB)</p>
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Tên</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên hiển thị"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
          </div>

          {isTemplate && (
            <>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">Phân loại</label>
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="VD: Hợp đồng, Báo cáo…"
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">Mô tả</label>
                <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none" />
              </div>
            </>
          )}

          {!isTemplate && <RoleAccessPicker value={allowedRoles} onChange={setAllowedRoles} />}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg disabled:opacity-50">Hủy</button>
            <button type="submit" disabled={busy || !file} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Đang tải…</> : "Tải lên"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
