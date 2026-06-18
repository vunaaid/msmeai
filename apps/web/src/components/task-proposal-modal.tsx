"use client";

// src/components/task-proposal-modal.tsx
// Modal duyệt danh sách công việc AI đề xuất → chỉnh người nhận/theo dõi/hạn → Giao việc.
// Dùng chung: module Công Việc (create-work, work-assistant) & Trò Chuyện (chat-client).

import { useState } from "react";
import { X, Loader2, Trash2, Send } from "lucide-react";
import { apiSend } from "@/lib/api/client";

export interface Candidate { id: string; kind: "user" | "agent"; name: string; role: string }
export interface PlanTask {
  title: string;
  description: string;
  assigneeId: string | null;
  dueInDays: number;
  priority: "urgent" | "high" | "normal" | "low";
}
interface Row extends PlanTask { watcher: string }

const PRIO = ["urgent", "high", "normal", "low"] as const;
const PRIO_LABEL: Record<string, string> = { urgent: "Khẩn cấp", high: "Cao", normal: "Bình thường", low: "Thấp" };

export function TaskProposalModal({
  tasks, candidates, parentId, onClose, onDone,
}: {
  tasks: PlanTask[];
  candidates: Candidate[];
  /** Nếu có → các việc tạo ra là việc CON của công việc này. */
  parentId?: string;
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const [rows, setRows] = useState<Row[]>(tasks.map((t) => ({ ...t, watcher: "" })));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const users = candidates.filter((c) => c.kind === "user");

  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const drop = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const assign = async () => {
    if (rows.length === 0) return;
    setSaving(true); setErr(null);
    try {
      const payload = {
        ...(parentId ? { parentId } : {}),
        tasks: rows.map((r) => {
          const cand = candidates.find((c) => c.id === r.assigneeId);
          return {
            title: r.title,
            description: r.description || undefined,
            assigneeId: r.assigneeId || null,
            assigneeKind: cand?.kind === "agent" ? "agent" : "user",
            watchers: r.watcher ? [r.watcher] : undefined,
            dueInDays: r.dueInDays,
            priority: r.priority,
          };
        }),
      };
      const { data } = await apiSend<{ count: number }>("/api/work/batch", "POST", payload);
      onDone(data?.count ?? rows.length);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi giao việc");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-4xl max-h-[88vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-white">
              {parentId ? "Việc con đề xuất" : "Đề xuất công việc"} ({rows.length})
            </h2>
            <p className="text-xs text-slate-500">Kiểm tra người nhận, người theo dõi, thời hạn trước khi giao</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {err && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">⚠ {err}</div>}
          {rows.length === 0 && <p className="text-sm text-slate-500 text-center py-8">Không có công việc nào.</p>}
          {rows.map((r, i) => (
            <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded bg-cyan-600/20 text-cyan-300 text-xs flex items-center justify-center flex-shrink-0 mt-1">{i + 1}</span>
                <input value={r.title} onChange={(e) => patch(i, { title: e.target.value })}
                  className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500" />
                <button onClick={() => drop(i)} className="p-1.5 text-slate-500 hover:text-red-400" title="Bỏ"><Trash2 size={14} /></button>
              </div>
              {r.description && <p className="text-xs text-slate-500 pl-7">{r.description}</p>}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pl-7">
                <label className="text-[11px] text-slate-500">Giao cho
                  <select value={r.assigneeId ?? ""} onChange={(e) => patch(i, { assigneeId: e.target.value || null })}
                    className="w-full mt-0.5 bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-500">
                    <option value="">— Chưa giao —</option>
                    {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}{c.kind === "agent" ? " (AI)" : ` · ${c.role}`}</option>)}
                  </select>
                </label>
                <label className="text-[11px] text-slate-500">Người theo dõi
                  <select value={r.watcher} onChange={(e) => patch(i, { watcher: e.target.value })}
                    className="w-full mt-0.5 bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-500">
                    <option value="">— Không —</option>
                    {users.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="text-[11px] text-slate-500">Hạn (ngày)
                  <input type="number" min={0} max={365} value={r.dueInDays} onChange={(e) => patch(i, { dueInDays: parseInt(e.target.value) || 0 })}
                    className="w-full mt-0.5 bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-500" />
                </label>
                <label className="text-[11px] text-slate-500">Ưu tiên
                  <select value={r.priority} onChange={(e) => patch(i, { priority: e.target.value as Row["priority"] })}
                    className="w-full mt-0.5 bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-500">
                    {PRIO.map((p) => <option key={p} value={p}>{PRIO_LABEL[p]}</option>)}
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Hủy bỏ</button>
          <button onClick={assign} disabled={saving || rows.length === 0}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Giao việc
          </button>
        </div>
      </div>
    </div>
  );
}
