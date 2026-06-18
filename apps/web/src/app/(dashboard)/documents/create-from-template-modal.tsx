"use client";

// src/app/(dashboard)/documents/create-from-template-modal.tsx
// Tạo tài liệu mới từ template: điền dữ liệu cho các {{placeholder}}.

import { useState, useEffect } from "react";
import { X, Loader2, FilePlus2 } from "lucide-react";
import { apiSend } from "@/lib/api/client";
import { RoleAccessPicker } from "./role-access-picker";

interface TemplateLike {
  id: string;
  name: string;
  fileType: string;
  variables?: unknown;
}

interface Props {
  template: TemplateLike | null;
  onClose: () => void;
  onSuccess: () => void;
}

/** Trích danh sách key biến từ trường `variables` của template (hỗ trợ nhiều dạng). */
function extractKeys(variables: unknown): string[] {
  if (!variables) return [];
  if (Array.isArray(variables)) {
    return variables.map((v) => (typeof v === "string" ? v : (v as { key?: string; name?: string })?.key ?? (v as { name?: string })?.name ?? "")).filter(Boolean);
  }
  if (typeof variables === "object") return Object.keys(variables as Record<string, unknown>);
  return [];
}

export function CreateFromTemplateModal({ template, onClose, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [allowedRoles, setAllowedRoles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keys = template ? extractKeys(template.variables) : [];

  useEffect(() => {
    if (template) {
      setName(`${template.name} - ${new Date().toLocaleDateString("vi-VN")}`);
      setValues({});
      setAllowedRoles([]);
      setError(null);
    }
  }, [template]);

  if (!template) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await apiSend("/api/documents", "POST", {
        name, templateId: template!.id, data: values,
        ...(allowedRoles.length > 0 ? { allowedRoleIds: allowedRoles } : {}),
      });
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
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 sticky top-0 bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-cyan-500/10 rounded-lg"><FilePlus2 size={16} className="text-cyan-400" /></div>
            <h2 className="text-base font-semibold text-white">Tạo từ template</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X size={16} /></button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">⚠ {error}</div>}
          <p className="text-xs text-slate-500">Mẫu: <span className="text-slate-300">{template.name}</span></p>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Tên tài liệu <span className="text-red-400">*</span></label>
            <input required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
          </div>

          {keys.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-medium text-slate-300">Dữ liệu điền</p>
              {keys.map((k) => (
                <div key={k} className="space-y-1">
                  <label className="block text-[11px] text-slate-400 font-mono">{`{{${k}}}`}</label>
                  <input value={values[k] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [k]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Template này chưa khai báo biến — tài liệu sẽ được tạo theo nội dung mẫu.</p>
          )}

          <RoleAccessPicker value={allowedRoles} onChange={setAllowedRoles} />

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg disabled:opacity-50">Hủy</button>
            <button type="submit" disabled={busy} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Đang tạo…</> : "Tạo tài liệu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
