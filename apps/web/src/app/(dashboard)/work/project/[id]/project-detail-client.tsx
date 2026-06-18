"use client";

// src/app/(dashboard)/work/project/[id]/project-detail-client.tsx
// Chi tiết dự án kiểu Jira/OpenProject: Tổng quan · Bảng Kanban · Danh sách · Timeline.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2, FolderKanban, LayoutGrid, List as ListIcon, GanttChartSquare,
  Users, Plus, Trash2, X, Target, Layers,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useApi, apiSend } from "@/lib/api/client";
import { ProjectBoard } from "./project-board";
import {
  STATUS_CFG, PRIORITY_CFG,
  type ProjectDetail, type ProjectItem, type Sprint, type Epic,
} from "./types";

const PROJECT_STATUS: Record<string, { label: string; color: string }> = {
  planning:  { label: "Lập kế hoạch", color: "text-slate-300" },
  active:    { label: "Đang chạy",    color: "text-cyan-400" },
  on_hold:   { label: "Tạm dừng",     color: "text-amber-400" },
  completed: { label: "Hoàn thành",   color: "text-emerald-400" },
  cancelled: { label: "Đã hủy",       color: "text-slate-500" },
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type Tab = "overview" | "board" | "list" | "timeline";

export function ProjectDetailClient({ id, userId }: { id: string; userId: string }) {
  const proj = useApi<ProjectDetail>(`/api/projects/${id}`);
  const itemsApi = useApi<ProjectItem[]>(`/api/projects/${id}/items`);
  const [tab, setTab] = useState<Tab>("overview");
  const [sprintFilter, setSprintFilter] = useState<string>("all"); // "all" | sprintId | "none"

  const project = proj.data;
  const items = useMemo(() => itemsApi.data ?? [], [itemsApi.data]);

  const refreshAll = () => { proj.refresh(); itemsApi.refresh(); };

  const filteredItems = useMemo(() => {
    if (sprintFilter === "all") return items;
    if (sprintFilter === "none") return items.filter((i) => !i.sprintId);
    return items.filter((i) => i.sprintId === sprintFilter);
  }, [items, sprintFilter]);

  if (proj.loading) {
    return <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-cyan-500" /></div>;
  }
  if (proj.error || !project) {
    return (
      <div className="max-w-[1600px] mx-auto">
        <PageHeader backHref="/work" title="Chi tiết dự án" />
        <p className="text-sm text-red-400">{proj.error ?? "Không tìm thấy dự án"}</p>
      </div>
    );
  }

  const ps = PROJECT_STATUS[project.status] ?? { label: project.status, color: "text-slate-400" };
  const done = items.filter((i) => i.status === "completed").length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const activeSprintId = sprintFilter !== "all" && sprintFilter !== "none" ? sprintFilter : null;

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "overview", label: "Tổng quan", icon: FolderKanban },
    { key: "board",    label: "Bảng",      icon: LayoutGrid },
    { key: "list",     label: "Danh sách", icon: ListIcon },
    { key: "timeline", label: "Timeline",  icon: GanttChartSquare },
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <PageHeader
        backHref="/work"
        icon={FolderKanban}
        iconColor="text-blue-400"
        title={project.title}
        subtitle={
          <span className="flex items-center gap-3">
            <span className={ps.color}>{ps.label}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">{done}/{items.length} việc · {pct}%</span>
          </span>
        }
      />

      {/* Tabs + bộ lọc sprint */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-800">
        <div className="flex gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                  tab === t.key
                    ? "border-cyan-500 text-white"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
        {(tab === "board" || tab === "list" || tab === "timeline") && project.sprints.length > 0 && (
          <select value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 focus:border-cyan-500 text-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none">
            <option value="all">Tất cả sprint</option>
            {project.sprints.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
            <option value="none">Chưa gán sprint (Backlog)</option>
          </select>
        )}
      </div>

      {itemsApi.loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-cyan-500" /></div>
      ) : (
        <>
          {tab === "overview" && (
            <Overview project={project} items={items} pct={pct} done={done} onChanged={refreshAll} />
          )}
          {tab === "board" && (
            <ProjectBoard projectId={id} items={filteredItems} activeSprintId={activeSprintId} onChanged={refreshAll} />
          )}
          {tab === "list" && <ListView items={filteredItems} />}
          {tab === "timeline" && <TimelineView items={filteredItems} />}
        </>
      )}
    </div>
  );
}

// ─── Tổng quan ─────────────────────────────────────────────────────────────────

function Overview({
  project, items, pct, done, onChanged,
}: { project: ProjectDetail; items: ProjectItem[]; pct: number; done: number; onChanged: () => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Cột trái: thông tin + tiến độ */}
      <div className="lg:col-span-2 space-y-5">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-slate-400">Ưu tiên: <span className="text-slate-200">{PRIORITY_CFG[project.priority]?.label ?? project.priority}</span></span>
            <span className="text-slate-400">Phụ trách: <span className="text-cyan-400">{project.manager?.name}</span></span>
            <span className="text-slate-400">Bắt đầu: <span className="text-slate-200">{fmt(project.startDate)}</span></span>
            <span className="text-slate-400">Hạn: <span className="text-slate-200">{fmt(project.dueDate)}</span></span>
          </div>
          {project.description && <p className="text-sm text-slate-300 whitespace-pre-wrap border-t border-slate-800 pt-3">{project.description}</p>}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Tiến độ</span><span>{done}/{items.length} · {pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        <SprintManager project={project} onChanged={onChanged} />
        <EpicManager project={project} onChanged={onChanged} />
      </div>

      {/* Cột phải: thành viên */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-fit">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
          <Users size={15} /> Thành viên ({project.members.length})
        </div>
        <div className="space-y-2">
          {project.members.map((m) => {
            const name = m.user?.name ?? "Không rõ";
            return (
              <div key={m.userId} className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs">
                  {name.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm text-slate-200 flex-1 truncate">{name}</span>
                <span className="text-xs text-slate-500">{m.role === "manager" ? "Quản lý" : "Thành viên"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Quản lý Sprint ──────────────────────────────────────────────────────────

function SprintManager({ project, onChanged }: { project: ProjectDetail; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await apiSend(`/api/projects/${project.id}/sprints`, "POST", { name: name.trim() });
      setName(""); setAdding(false); onChanged();
    } catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); } finally { setBusy(false); }
  };
  const cycle = async (s: Sprint) => {
    const next = s.status === "planned" ? "active" : s.status === "active" ? "completed" : "planned";
    try { await apiSend(`/api/projects/${project.id}/sprints/${s.id}`, "PATCH", { status: next }); onChanged(); }
    catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); }
  };
  const remove = async (s: Sprint) => {
    if (!confirm(`Xóa sprint "${s.name}"? Việc trong sprint sẽ được gỡ về Backlog.`)) return;
    try { await apiSend(`/api/projects/${project.id}/sprints/${s.id}`, "DELETE"); onChanged(); }
    catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); }
  };

  const SP_CFG: Record<string, { label: string; color: string }> = {
    planned:   { label: "Chưa bắt đầu", color: "text-slate-400 bg-slate-700/40" },
    active:    { label: "Đang chạy",    color: "text-cyan-300 bg-cyan-900/30" },
    completed: { label: "Hoàn thành",   color: "text-emerald-300 bg-emerald-900/30" },
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-300"><Target size={15} /> Sprint ({project.sprints.length})</span>
        <button onClick={() => setAdding((v) => !v)} className="text-xs flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
          {adding ? <X size={13} /> : <Plus size={13} />} {adding ? "Đóng" : "Thêm sprint"}
        </button>
      </div>
      {adding && (
        <div className="flex gap-2 mb-3">
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") create(); }}
            placeholder="Tên sprint (vd: Sprint 1)"
            className="flex-1 bg-slate-800 border border-slate-700 focus:border-cyan-500 text-white placeholder-slate-500 rounded-lg px-3 py-1.5 text-sm outline-none" />
          <button onClick={create} disabled={busy || !name.trim()}
            className="px-3 py-1.5 text-sm bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white rounded-lg">Tạo</button>
        </div>
      )}
      {project.sprints.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có sprint nào.</p>
      ) : (
        <div className="space-y-1.5">
          {project.sprints.map((s) => {
            const cfg = SP_CFG[s.status] ?? SP_CFG["planned"]!;
            return (
              <div key={s.id} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg hover:bg-slate-800/50 group">
                <span className="text-slate-200 flex-1 truncate">{s.name}</span>
                <span className="text-xs text-slate-500">{s._count?.workItems ?? 0} việc</span>
                <button onClick={() => cycle(s)} className={`text-[11px] px-2 py-0.5 rounded ${cfg.color}`}>{cfg.label}</button>
                <button onClick={() => remove(s)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100">
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Quản lý Epic ──────────────────────────────────────────────────────────────

const EPIC_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444"];

function EpicManager({ project, onChanged }: { project: ProjectDetail; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(EPIC_COLORS[0]!);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await apiSend(`/api/projects/${project.id}/epics`, "POST", { title: title.trim(), color });
      setTitle(""); setAdding(false); onChanged();
    } catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); } finally { setBusy(false); }
  };
  const remove = async (ep: Epic) => {
    if (!confirm(`Xóa epic "${ep.title}"? Việc thuộc epic sẽ được gỡ nhãn.`)) return;
    try { await apiSend(`/api/projects/${project.id}/epics/${ep.id}`, "DELETE"); onChanged(); }
    catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-300"><Layers size={15} /> Epic ({project.epics.length})</span>
        <button onClick={() => setAdding((v) => !v)} className="text-xs flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
          {adding ? <X size={13} /> : <Plus size={13} />} {adding ? "Đóng" : "Thêm epic"}
        </button>
      </div>
      {adding && (
        <div className="space-y-2 mb-3">
          <div className="flex gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") create(); }}
              placeholder="Tên epic (vd: Đăng nhập)"
              className="flex-1 bg-slate-800 border border-slate-700 focus:border-cyan-500 text-white placeholder-slate-500 rounded-lg px-3 py-1.5 text-sm outline-none" />
            <button onClick={create} disabled={busy || !title.trim()}
              className="px-3 py-1.5 text-sm bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white rounded-lg">Tạo</button>
          </div>
          <div className="flex gap-1.5">
            {EPIC_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} style={{ backgroundColor: c }}
                className={`w-6 h-6 rounded-full ${color === c ? "ring-2 ring-offset-2 ring-offset-slate-900 ring-white" : ""}`} />
            ))}
          </div>
        </div>
      )}
      {project.epics.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có epic nào.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {project.epics.map((ep) => (
            <div key={ep.id} className="group flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg"
              style={{ backgroundColor: `${ep.color}22`, color: ep.color }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ep.color }} />
              <span>{ep.title}</span>
              <span className="text-xs opacity-70">{ep._count?.workItems ?? 0}</span>
              <button onClick={() => remove(ep)} className="opacity-0 group-hover:opacity-100 hover:text-red-400 ml-0.5">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Danh sách ─────────────────────────────────────────────────────────────────

function ListView({ items }: { items: ProjectItem[] }) {
  if (items.length === 0) return <p className="text-sm text-slate-500 py-10 text-center">Chưa có công việc.</p>;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
            <th className="px-4 py-2.5 font-medium">Công việc</th>
            <th className="px-4 py-2.5 font-medium">Epic</th>
            <th className="px-4 py-2.5 font-medium">Sprint</th>
            <th className="px-4 py-2.5 font-medium">Người nhận</th>
            <th className="px-4 py-2.5 font-medium">Ưu tiên</th>
            <th className="px-4 py-2.5 font-medium">Điểm</th>
            <th className="px-4 py-2.5 font-medium">Hạn</th>
            <th className="px-4 py-2.5 font-medium">Trạng thái</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {items.map((it) => {
            const st = STATUS_CFG[it.status] ?? STATUS_CFG["draft"]!;
            const pr = PRIORITY_CFG[it.priority] ?? PRIORITY_CFG["normal"]!;
            return (
              <tr key={it.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-2.5">
                  <Link href={`/work/${it.id}`} className="text-slate-200 hover:text-white">{it.title}</Link>
                </td>
                <td className="px-4 py-2.5">
                  {it.epic ? (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${it.epic.color}22`, color: it.epic.color }}>{it.epic.title}</span>
                  ) : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-4 py-2.5 text-slate-400">{it.sprint?.name ?? <span className="text-slate-600">—</span>}</td>
                <td className="px-4 py-2.5 text-slate-300">{it.assignee?.name ?? <span className="text-slate-600">Chưa giao</span>}</td>
                <td className="px-4 py-2.5"><span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${pr.dot}`} />{pr.label}</span></td>
                <td className="px-4 py-2.5 text-slate-400">{it.storyPoints ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-400">{it.dueDate ? fmt(it.dueDate) : "—"}</td>
                <td className={`px-4 py-2.5 ${st.color}`}>{st.label}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Timeline (Gantt đơn giản) ──────────────────────────────────────────────────

function TimelineView({ items }: { items: ProjectItem[] }) {
  const withDates = items.filter((i) => i.dueDate);
  if (withDates.length === 0) {
    return <p className="text-sm text-slate-500 py-10 text-center">Chưa có công việc nào có hạn để hiển thị timeline.</p>;
  }

  const starts = withDates.map((i) => new Date(i.startedAt ?? i.createdAt).getTime());
  const ends = withDates.map((i) => new Date(i.dueDate!).getTime());
  let min = Math.min(...starts, ...ends);
  let max = Math.max(...starts, ...ends);
  if (max - min < 86400000) max = min + 86400000; // tối thiểu 1 ngày
  const span = max - min;
  const pos = (t: number) => ((t - min) / span) * 100;

  const monthMarks: { left: number; label: string }[] = [];
  {
    const d = new Date(min); d.setDate(1);
    while (d.getTime() <= max) {
      monthMarks.push({ left: pos(d.getTime()), label: d.toLocaleDateString("vi-VN", { month: "short", year: "2-digit" }) });
      d.setMonth(d.getMonth() + 1);
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Mốc tháng */}
        <div className="relative h-5 mb-2 ml-48 border-b border-slate-800">
          {monthMarks.map((m, i) => (
            <span key={i} className="absolute text-[10px] text-slate-500 -translate-x-1/2" style={{ left: `${m.left}%` }}>{m.label}</span>
          ))}
        </div>
        <div className="space-y-1.5">
          {withDates
            .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
            .map((it) => {
              const start = new Date(it.startedAt ?? it.createdAt).getTime();
              const end = new Date(it.dueDate!).getTime();
              const left = pos(Math.min(start, end));
              const width = Math.max(1.5, pos(Math.max(start, end)) - left);
              const st = STATUS_CFG[it.status] ?? STATUS_CFG["draft"]!;
              return (
                <div key={it.id} className="flex items-center gap-2">
                  <Link href={`/work/${it.id}`} className="w-48 shrink-0 text-xs text-slate-300 hover:text-white truncate">{it.title}</Link>
                  <div className="relative flex-1 h-5">
                    <div className={`absolute h-3.5 top-0.5 rounded ${st.dot} opacity-80`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${it.title} · hạn ${fmt(it.dueDate)}`} />
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
