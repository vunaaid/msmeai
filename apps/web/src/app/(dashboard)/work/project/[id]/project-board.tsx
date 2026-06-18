"use client";

// src/app/(dashboard)/work/project/[id]/project-board.tsx
// Bảng Kanban kéo-thả (HTML5 drag-and-drop gốc, không cần thư viện).
// Cột = trạng thái. Kéo thẻ sang cột khác → đổi trạng thái; thả đúng vị trí → đổi thứ tự.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Loader2, MessageSquare, GitBranch, CalendarDays } from "lucide-react";
import { apiSend } from "@/lib/api/client";
import {
  BOARD_COLUMNS, columnOf, PRIORITY_CFG,
  type ProjectItem,
} from "./types";

function initials(name?: string | null) {
  return (name ?? "?").trim().charAt(0).toUpperCase();
}

function dueInfo(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = d < today;
  return { text: d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }), overdue };
}

interface Props {
  projectId: string;
  items: ProjectItem[];
  activeSprintId: string | null; // sprint đang lọc — thẻ mới tạo gắn sprint này
  onChanged: () => void;
}

export function ProjectBoard({ projectId, items, activeSprintId, onChanged }: Props) {
  // Bản sao cục bộ để kéo-thả mượt (optimistic), đồng bộ lại khi props đổi.
  const [local, setLocal] = useState<ProjectItem[]>(items);
  useEffect(() => { setLocal(items); }, [items]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<string | null>(null); // colKey đang mở ô tạo
  const [newTitle, setNewTitle] = useState("");
  const addRef = useRef<HTMLInputElement>(null);

  const colItems = (colKey: string) =>
    local
      .filter((it) => it.status !== "cancelled" && columnOf(it.status) === colKey)
      .sort((a, b) => a.boardOrder - b.boardOrder || a.title.localeCompare(b.title));

  // Thả thẻ vào cột tại vị trí index (mặc định cuối cột).
  const handleDrop = async (colKey: string, index: number | null) => {
    const col = BOARD_COLUMNS.find((c) => c.key === colKey);
    const dragged = local.find((it) => it.id === dragId);
    setOverCol(null);
    if (!col || !dragged) { setDragId(null); return; }

    const target = colItems(colKey).filter((it) => it.id !== dragged.id);
    const at = index === null || index > target.length ? target.length : index;
    target.splice(at, 0, { ...dragged, status: col.status });

    // Gán lại boardOrder tuần tự cho cột đích
    const reordered = target.map((it, i) => ({ ...it, boardOrder: i, status: col.status }));
    const others = local.filter((it) => columnOf(it.status) !== colKey && it.id !== dragged.id);
    setLocal([...others, ...reordered]);
    setDragId(null);

    // Lưu: chỉ PUT các thẻ thay đổi (đổi cột hoặc đổi thứ tự)
    setSaving(true);
    try {
      const before = new Map(items.map((it) => [it.id, it]));
      await Promise.all(
        reordered
          .filter((it) => {
            const b = before.get(it.id);
            return !b || b.status !== it.status || b.boardOrder !== it.boardOrder;
          })
          .map((it) => apiSend(`/api/work/${it.id}`, "PUT", { status: it.status, boardOrder: it.boardOrder })),
      );
      onChanged();
    } catch {
      onChanged(); // lỗi → tải lại từ server
    } finally {
      setSaving(false);
    }
  };

  const quickCreate = async (colKey: string) => {
    const title = newTitle.trim();
    const col = BOARD_COLUMNS.find((c) => c.key === colKey);
    if (!title || !col) return;
    setNewTitle("");
    setAdding(null);
    try {
      await apiSend("/api/work", "POST", {
        title,
        workType: "project_task",
        projectId,
        status: col.status,
        ...(activeSprintId ? { sprintId: activeSprintId } : {}),
      });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lỗi tạo việc");
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {BOARD_COLUMNS.map((col) => {
        const list = colItems(col.key);
        const pts = list.reduce((s, it) => s + (it.storyPoints ?? 0), 0);
        return (
          <div
            key={col.key}
            onDragOver={(e) => { e.preventDefault(); setOverCol(col.key); }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCol(null); }}
            onDrop={() => handleDrop(col.key, null)}
            className={`flex-shrink-0 w-80 rounded-xl border bg-slate-900/60 ${
              overCol === col.key ? "border-cyan-500/60 bg-slate-800/40" : "border-slate-800"
            }`}
          >
            <div className="px-4 py-3 flex items-center justify-between border-b border-slate-800">
              <span className="text-sm font-medium text-slate-200">{col.label}</span>
              <span className="text-xs text-slate-500">
                {list.length}{pts > 0 ? ` · ${pts}đ` : ""}
              </span>
            </div>

            <div className="p-2 space-y-2 min-h-[60px]">
              {list.map((it, idx) => {
                const due = dueInfo(it.dueDate);
                const pr = PRIORITY_CFG[it.priority] ?? PRIORITY_CFG["normal"]!;
                return (
                  <div
                    key={it.id}
                    draggable
                    onDragStart={(e) => { setDragId(it.id); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOverCol(col.key); }}
                    onDrop={(e) => { e.stopPropagation(); handleDrop(col.key, idx); }}
                    className={`group rounded-lg border border-slate-700/70 bg-slate-800 hover:border-slate-600 p-3 cursor-grab active:cursor-grabbing ${
                      dragId === it.id ? "opacity-40" : ""
                    }`}
                  >
                    {it.epic && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded mb-1.5"
                        style={{ backgroundColor: `${it.epic.color}22`, color: it.epic.color }}
                      >
                        {it.epic.title}
                      </span>
                    )}
                    <Link
                      href={`/work/${it.id}`}
                      draggable={false}
                      onClick={(e) => e.stopPropagation()}
                      className="block text-sm text-slate-100 group-hover:text-white leading-snug"
                    >
                      {it.title}
                    </Link>
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400">
                      <span className={`w-2 h-2 rounded-full ${pr.dot}`} title={pr.label} />
                      {it.storyPoints != null && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-200">{it.storyPoints}đ</span>
                      )}
                      {it._count.children > 0 && (
                        <span className="flex items-center gap-0.5"><GitBranch size={11} /> {it._count.children}</span>
                      )}
                      {it._count.comments > 0 && (
                        <span className="flex items-center gap-0.5"><MessageSquare size={11} /> {it._count.comments}</span>
                      )}
                      {due && (
                        <span className={`flex items-center gap-0.5 ${due.overdue ? "text-red-400" : ""}`}>
                          <CalendarDays size={11} /> {due.text}
                        </span>
                      )}
                      <span className="flex-1" />
                      {it.assignee ? (
                        <span
                          title={it.assignee.name}
                          className="w-5 h-5 rounded-full bg-cyan-700 text-white flex items-center justify-center text-[10px] font-medium"
                        >
                          {initials(it.assignee.name)}
                        </span>
                      ) : (
                        <span className="w-5 h-5 rounded-full border border-dashed border-slate-600" title="Chưa giao" />
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Tạo việc nhanh */}
              {adding === col.key ? (
                <div className="rounded-lg border border-cyan-600/50 bg-slate-800 p-2">
                  <input
                    ref={addRef}
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") quickCreate(col.key);
                      if (e.key === "Escape") { setAdding(null); setNewTitle(""); }
                    }}
                    placeholder="Tiêu đề việc..."
                    className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 text-white placeholder-slate-500 rounded px-2 py-1.5 text-sm outline-none"
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => quickCreate(col.key)} disabled={!newTitle.trim()}
                      className="px-2.5 py-1 text-xs bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white rounded">
                      Thêm
                    </button>
                    <button onClick={() => { setAdding(null); setNewTitle(""); }}
                      className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200">
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAdding(col.key)}
                  className="w-full flex items-center gap-1.5 px-2 py-2 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 rounded-lg"
                >
                  <Plus size={13} /> Tạo việc
                </button>
              )}
            </div>
          </div>
        );
      })}

      {saving && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-300 text-xs px-3 py-2 rounded-lg shadow-lg">
          <Loader2 size={13} className="animate-spin" /> Đang lưu...
        </div>
      )}
    </div>
  );
}
