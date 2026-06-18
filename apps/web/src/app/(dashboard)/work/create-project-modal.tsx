"use client";

// src/app/(dashboard)/work/create-project-modal.tsx

import { useState, useEffect, useTransition } from "react";
import { X, Loader2, FolderKanban } from "lucide-react";
import { apiFetch, apiSend } from "@/lib/api/client";

interface User { id: string; name: string }

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateProjectModal({ open, onClose, onSuccess }: Props) {
  const [title, setTitle]         = useState("");
  const [description, setDesc]    = useState("");
  const [managerId, setManagerId] = useState("");
  const [priority, setPriority]   = useState<"urgent"|"high"|"normal"|"low">("normal");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate]     = useState("");
  const [users, setUsers]         = useState<User[]>([]);
  const [error, setError]         = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    apiFetch<User[]>("/api/users?limit=100")
      .then(({ data }) => setUsers(data ?? []))
      .catch(() => {/* ignore — dropdown trống nếu lỗi */});
  }, [open]);

  useEffect(() => {
    if (!open) {
      setTitle(""); setDesc(""); setManagerId(""); setPriority("normal");
      setStartDate(""); setDueDate(""); setError(null);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await apiSend("/api/projects", "POST", {
          title,
          description: description || undefined,
          // Không chọn → backend mặc định người tạo làm người phụ trách.
          managerId: managerId || undefined,
          priority,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          dueDate:   dueDate   ? new Date(dueDate).toISOString()   : undefined,
        });
        onSuccess();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi kết nối máy chủ");
      }
    });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-500/10 rounded-lg">
              <FolderKanban size={16} className="text-blue-400" />
            </div>
            <h2 className="text-base font-semibold text-white">Tạo dự án mới</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              ⚠ {error}
            </div>
          )}

          {/* Tên dự án */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Tên dự án <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="VD: Triển khai ERP Q3/2026"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60"
            />
          </div>

          {/* Mô tả */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Mô tả</label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="Mục tiêu, phạm vi của dự án..."
              className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 resize-none"
            />
          </div>

          {/* PM + Ưu tiên */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Người phụ trách
              </label>
              <select
                value={managerId}
                onChange={e => setManagerId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60"
              >
                <option value="">Tôi (người tạo)</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Ưu tiên</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as typeof priority)}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60"
              >
                <option value="urgent">🔴 Khẩn cấp</option>
                <option value="high">🟠 Cao</option>
                <option value="normal">⚪ Bình thường</option>
                <option value="low">🔵 Thấp</option>
              </select>
            </div>
          </div>

          {/* Ngày bắt đầu + kết thúc */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Ngày bắt đầu</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Hạn hoàn thành</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                min={startDate || new Date().toISOString().split("T")[0]}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? <><Loader2 size={14} className="animate-spin" />Đang tạo...</> : <>Tạo dự án</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
