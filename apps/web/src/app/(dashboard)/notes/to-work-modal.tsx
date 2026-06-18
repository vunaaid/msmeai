"use client";

// src/app/(dashboard)/notes/to-work-modal.tsx
// Tạo công việc từ một block ghi chép.

import { useState, useEffect, useTransition } from "react";
import { X, Loader2, ClipboardList } from "lucide-react";
import { apiFetch, apiSend } from "@/lib/api/client";

interface User { id: string; name: string }

interface Props {
  blockId: string | null;
  defaultTitle: string;
  canAssign: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ToWorkModal({ blockId, defaultTitle, canAssign, onClose, onSuccess }: Props) {
  const [title, setTitle]           = useState(defaultTitle);
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority]     = useState<"urgent"|"high"|"normal"|"low">("normal");
  const [dueDate, setDueDate]       = useState("");
  const [users, setUsers]           = useState<User[]>([]);
  const [error, setError]           = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setTitle(defaultTitle.slice(0, 200));
    setAssignedTo(""); setPriority("normal"); setDueDate(""); setError(null);
  }, [blockId, defaultTitle]);

  useEffect(() => {
    if (!blockId || !canAssign) return;
    apiFetch<User[]>("/api/users?limit=100")
      .then(u => setUsers(u.data ?? []))
      .catch(() => {/* dropdown trống nếu lỗi */});
  }, [blockId, canAssign]);

  if (!blockId) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await apiSend(`/api/notes/blocks/${blockId}/to-work`, "POST", {
          title: title.trim(),
          assignedTo: assignedTo || undefined,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        });
        onSuccess();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi kết nối máy chủ");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-cyan-500/10 rounded-lg">
              <ClipboardList size={16} className="text-cyan-400" />
            </div>
            <h2 className="text-base font-semibold text-white">Tạo công việc từ ghi chép</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              ⚠ {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Tiêu đề công việc <span className="text-red-400">*</span>
            </label>
            <input
              type="text" required minLength={2} maxLength={200}
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {canAssign && (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">Giao cho</label>
                <select
                  value={assignedTo}
                  onChange={e => setAssignedTo(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60"
                >
                  <option value="">— Chưa giao —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}
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

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Hạn hoàn thành</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button" onClick={onClose} disabled={isPending}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit" disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? <><Loader2 size={14} className="animate-spin" />Đang tạo…</> : <>Tạo công việc</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
