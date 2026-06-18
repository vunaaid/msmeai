"use client";

// src/app/(dashboard)/work/[id]/work-detail-client.tsx
// Chi tiết một công việc: thông tin, việc con, bình luận, hành động trạng thái.

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Loader2, Calendar, User, FolderKanban, MessageSquare, Send,
  Play, CheckCircle2, ChevronRight, Sparkles, CornerDownRight, Plus, X,
  Pencil, Check, Paperclip, Upload, Trash2, Download,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useApi, apiFetch, apiSend } from "@/lib/api/client";
import { Markdown } from "@/components/markdown";

interface DetailUser { id: string; name: string; avatarUrl?: string | null }
interface SubTask { id: string; title: string; status: string; assignee: DetailUser | null }
interface Comment { id: string; content: string; createdAt: string; user: DetailUser }
interface Assignee { id: string; name: string; role: string | null; isSelf: boolean }

interface WorkDetail {
  id: string;
  title: string;
  description: string | null;
  note: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  workType: string;
  completionNote: string | null;
  aiBreakdown: unknown;
  creator: DetailUser;
  assignee: DetailUser | null;
  project: { id: string; title: string } | null;
  parent: { id: string; title: string } | null;
  children: SubTask[];
  comments: Comment[];
}

const STATUS: Record<string, { label: string; color: string }> = {
  draft:            { label: "Chưa thực hiện", color: "text-slate-400" },
  pending_approval: { label: "Chờ duyệt",      color: "text-amber-400" },
  active:           { label: "Chưa thực hiện", color: "text-blue-400" },
  in_progress:      { label: "Đang thực hiện", color: "text-cyan-400" },
  completed:        { label: "Hoàn thành",     color: "text-emerald-400" },
  cancelled:        { label: "Đã hủy",         color: "text-slate-500" },
};
const ST_DEFAULT = { label: "—", color: "text-slate-400" };
const ST_OVERDUE = { label: "Quá hạn", color: "text-red-400" };
const PRIORITY: Record<string, string> = {
  urgent: "Cao", high: "Cao", normal: "Trung bình", low: "Thấp",
};

function isOverdue(status: string, dueDate: string | null): boolean {
  if (!dueDate || status === "completed" || status === "cancelled") return false;
  return new Date(dueDate).getTime() < Date.now();
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ISO → "YYYY-MM-DD" (giờ địa phương) cho <input type="date">
function toDateInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

type EditPriority = "high" | "normal" | "low";
type EditStatus = "draft" | "pending_approval" | "active" | "in_progress" | "completed" | "cancelled";

export function WorkDetailClient({ id, userId }: { id: string; userId: string }) {
  const { data: item, loading, error, refresh } = useApi<WorkDetail>(`/api/work/${id}`);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Form tạo việc con ngay trong trang chi tiết
  const [subOpen, setSubOpen] = useState(false);
  const [subTitle, setSubTitle] = useState("");
  const [subAssignee, setSubAssignee] = useState("");
  const [subPriority, setSubPriority] = useState<"high" | "normal" | "low">("normal");
  const [subDue, setSubDue] = useState("");
  const [users, setUsers] = useState<Assignee[]>([]);

  // Chế độ chỉnh sửa công việc tại chỗ
  const [editMode, setEditMode] = useState(false);
  const [eTitle, setETitle] = useState("");
  const [eDescription, setEDescription] = useState("");
  const [eNote, setENote] = useState("");
  const [ePriority, setEPriority] = useState<EditPriority>("normal");
  const [eStatus, setEStatus] = useState<EditStatus>("draft");
  const [eAssignee, setEAssignee] = useState("");
  const [eDue, setEDue] = useState("");

  // Nạp danh sách người có thể giao khi mở form tạo việc con hoặc form sửa.
  useEffect(() => {
    if ((!subOpen && !editMode) || users.length > 0) return;
    apiFetch<Assignee[]>("/api/work/assignees")
      .then((r) => setUsers(r.data ?? []))
      .catch(() => {/* ignore — dropdown trống nếu lỗi */});
  }, [subOpen, editMode, users.length]);

  const act = async (fn: () => Promise<unknown>, key: string) => {
    setBusy(key);
    try { await fn(); refresh(); } catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); }
    finally { setBusy(null); }
  };

  const createSubtask = async () => {
    if (!item || !subTitle.trim()) return;
    await act(async () => {
      await apiSend("/api/work", "POST", {
        title: subTitle.trim(),
        workType: item.workType,
        parentId: item.id,
        projectId: item.project?.id ?? undefined,
        assignedTo: subAssignee || undefined,
        priority: subPriority,
        dueDate: subDue ? new Date(subDue).toISOString() : undefined,
      });
      setSubTitle(""); setSubAssignee(""); setSubPriority("normal"); setSubDue("");
      setSubOpen(false);
    }, "subtask");
  };

  // Mở form sửa: nạp giá trị hiện tại của công việc vào state.
  const openEdit = () => {
    if (!item) return;
    setETitle(item.title);
    setEDescription(item.description ?? "");
    setENote(item.note ?? "");
    setEPriority((item.priority === "urgent" ? "high" : item.priority) as EditPriority || "normal");
    setEStatus((item.status === "draft" ? "active" : item.status) as EditStatus || "active");
    setEAssignee(item.assignee?.id ?? "");
    setEDue(toDateInput(item.dueDate));
    setEditMode(true);
  };

  const saveEdit = async () => {
    if (!item || !eTitle.trim()) return;
    await act(async () => {
      await apiSend(`/api/work/${id}`, "PUT", {
        title:      eTitle.trim(),
        description: eDescription,
        note:       eNote || null,
        priority:   ePriority,
        status:     eStatus,
        assignedTo: eAssignee || null,
        dueDate:    eDue ? new Date(eDue).toISOString() : null,
      });
      setEditMode(false);
    }, "edit");
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-cyan-500" /></div>;
  }
  if (error || !item) {
    return (
      <div className="max-w-[1600px] mx-auto">
        <PageHeader backHref="/work" title="Chi tiết công việc" />
        <p className="text-sm text-red-400">{error ?? "Không tìm thấy công việc"}</p>
      </div>
    );
  }

  const st = isOverdue(item.status, item.dueDate) ? ST_OVERDUE : (STATUS[item.status] ?? ST_DEFAULT);
  const isAssignee = item.assignee?.id === userId;
  const isCreator = item.creator?.id === userId;
  const bd = Array.isArray(item.aiBreakdown) ? (item.aiBreakdown as { title?: string; description?: string }[]) : null;

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <PageHeader
        backHref="/work"
        actions={
          <>
            {(isCreator || isAssignee) && !editMode && (
              <button onClick={openEdit}
                disabled={busy !== null}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg disabled:opacity-50">
                <Pencil size={14} /> Sửa
              </button>
            )}
            {isAssignee && item.status === "active" && (
              <button onClick={() => act(() => apiSend(`/api/work/${id}`, "PUT", { status: "in_progress" }), "start")}
                disabled={busy !== null}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50">
                {busy === "start" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Bắt đầu
              </button>
            )}
            {isAssignee && item.status === "in_progress" && (
              <button onClick={() => act(() => apiSend(`/api/work/${id}`, "PUT", { status: "completed" }), "done")}
                disabled={busy !== null}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg disabled:opacity-50">
                {busy === "done" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Hoàn thành
              </button>
            )}
            {isCreator && item.status === "pending_approval" && bd && bd.length > 0 && (
              <button onClick={() => act(() => apiSend(`/api/work/${id}/approve`, "POST", {}), "approve")}
                disabled={busy !== null}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg disabled:opacity-50">
                {busy === "approve" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Duyệt & giao việc con
              </button>
            )}
          </>
        }
      />

      {/* Form sửa công việc tại chỗ */}
      {editMode ? (
        <div className="bg-slate-900 border border-cyan-800/50 rounded-xl p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Tiêu đề</label>
            <input value={eTitle} onChange={(e) => setETitle(e.target.value)} autoFocus
              className="w-full bg-slate-800 border border-slate-700 focus:border-cyan-500 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Mô tả</label>
            <textarea value={eDescription} onChange={(e) => setEDescription(e.target.value)} rows={4}
              placeholder="Mô tả công việc (hỗ trợ Markdown)..."
              className="w-full bg-slate-800 border border-slate-700 focus:border-cyan-500 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm outline-none resize-y" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ghi chú</label>
            <textarea value={eNote} onChange={(e) => setENote(e.target.value)} rows={2}
              placeholder="Ghi chú thêm (không bắt buộc)..."
              className="w-full bg-slate-800 border border-slate-700 focus:border-cyan-500 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm outline-none resize-y" />
          </div>
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Trạng thái</label>
              <select value={eStatus} onChange={(e) => setEStatus(e.target.value as EditStatus)}
                className="bg-slate-800 border border-slate-700 focus:border-cyan-500 text-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                <option value="active">Chưa thực hiện</option>
                <option value="in_progress">Đang thực hiện</option>
                <option value="completed">Hoàn thành</option>
                <option value="pending_approval">Chờ duyệt</option>
                <option value="cancelled">Đã hủy</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ưu tiên</label>
              <select value={ePriority} onChange={(e) => setEPriority(e.target.value as EditPriority)}
                className="bg-slate-800 border border-slate-700 focus:border-cyan-500 text-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                <option value="high">Cao</option>
                <option value="normal">Trung bình</option>
                <option value="low">Thấp</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Người được giao</label>
              <select value={eAssignee} onChange={(e) => setEAssignee(e.target.value)}
                className="bg-slate-800 border border-slate-700 focus:border-cyan-500 text-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                <option value="">Chưa giao</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}{u.isSelf ? " (Tôi)" : ""}{u.role ? ` · ${u.role}` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Hạn</label>
              <input type="date" value={eDue} onChange={(e) => setEDue(e.target.value)}
                className="bg-slate-800 border border-slate-700 focus:border-cyan-500 text-slate-200 rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={saveEdit} disabled={!eTitle.trim() || busy === "edit"}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg">
              {busy === "edit" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Lưu
            </button>
            <button onClick={() => setEditMode(false)} disabled={busy === "edit"}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-400 hover:text-slate-200">
              <X size={14} /> Hủy
            </button>
          </div>
        </div>
      ) : (
      /* Thông tin */
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
        {/* Tên công việc + trạng thái (đưa từ header xuống) */}
        <div className="pb-3 border-b border-slate-800">
          <h1 className="text-lg sm:text-2xl font-bold text-white leading-snug">{item.title}</h1>
          <span className={`text-sm font-medium ${st.color}`}>{st.label}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="text-slate-400">Ưu tiên: <span className="text-slate-200">{PRIORITY[item.priority] ?? item.priority}</span></span>
          <span className="text-slate-400 flex items-center gap-1.5"><Calendar size={13} /> Hạn: <span className="text-slate-200">{fmt(item.dueDate)}</span></span>
          <span className="text-slate-400 flex items-center gap-1.5"><User size={13} /> Giao: <span className="text-slate-200">{item.creator?.name}</span> <ChevronRight size={12} /> <span className="text-cyan-400">{item.assignee?.name ?? "Chưa giao"}</span></span>
          {item.project && (
            <Link href={`/work/project/${item.project.id}`} className="text-blue-400 flex items-center gap-1.5 hover:underline">
              <FolderKanban size={13} /> {item.project.title}
            </Link>
          )}
        </div>
        {item.parent && (
          <Link href={`/work/${item.parent.id}`} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
            <CornerDownRight size={12} /> Thuộc: {item.parent.title}
          </Link>
        )}
        {item.description && (
          <div className="pt-1 border-t border-slate-800 mt-1">
            <Markdown className="text-sm">{item.description}</Markdown>
          </div>
        )}
        {item.note && (
          <div className="pt-2 border-t border-slate-800 mt-1">
            <p className="text-xs text-slate-500 mb-1">Ghi chú</p>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{item.note}</p>
          </div>
        )}
        {item.completionNote && (
          <p className="text-sm text-emerald-300 bg-emerald-900/15 border border-emerald-800/40 rounded-lg p-3">
            Ghi chú hoàn thành: {item.completionNote}
          </p>
        )}
      </div>
      )}

      {/* AI breakdown đề xuất (nếu có & chưa giao) */}
      {bd && bd.length > 0 && item.children.length === 0 && (
        <div className="bg-slate-900 border border-purple-800/40 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-purple-300">
            <Sparkles size={15} /> AI đề xuất {bd.length} việc con
          </div>
          <div className="space-y-2">
            {bd.map((s, i) => (
              <div key={i} className="text-sm text-slate-300 flex gap-2">
                <span className="text-slate-600">{i + 1}.</span>
                <div><span className="text-slate-200">{s.title}</span>{s.description && <p className="text-xs text-slate-500">{s.description}</p>}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Việc con */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-300">Việc con ({item.children.length})</span>
          <button onClick={() => setSubOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg">
            {subOpen ? <><X size={13} /> Đóng</> : <><Plus size={13} /> Tạo việc con</>}
          </button>
        </div>

        {/* Form tạo việc con */}
        {subOpen && (
          <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/60 space-y-3">
            <input value={subTitle} onChange={(e) => setSubTitle(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") createSubtask(); }}
              placeholder="Tiêu đề việc con..."
              className="w-full bg-slate-800 border border-slate-700 focus:border-cyan-500 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm outline-none" />
            <div className="flex flex-wrap gap-2">
              <select value={subAssignee} onChange={(e) => setSubAssignee(e.target.value)}
                className="bg-slate-800 border border-slate-700 focus:border-cyan-500 text-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                <option value="">Chưa giao</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}{u.isSelf ? " (Tôi)" : ""}{u.role ? ` · ${u.role}` : ""}</option>
                ))}
              </select>
              <select value={subPriority} onChange={(e) => setSubPriority(e.target.value as typeof subPriority)}
                className="bg-slate-800 border border-slate-700 focus:border-cyan-500 text-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                <option value="high">Cao</option>
                <option value="normal">Trung bình</option>
                <option value="low">Thấp</option>
              </select>
              <input type="date" value={subDue} onChange={(e) => setSubDue(e.target.value)}
                className="bg-slate-800 border border-slate-700 focus:border-cyan-500 text-slate-200 rounded-lg px-3 py-2 text-sm outline-none" />
              <button onClick={createSubtask} disabled={!subTitle.trim() || busy === "subtask"}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg">
                {busy === "subtask" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Thêm
              </button>
            </div>
          </div>
        )}

        {item.children.length === 0 ? (
          !subOpen && <p className="px-5 py-4 text-sm text-slate-500">Chưa có việc con. Nhấn “Tạo việc con” để thêm.</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {item.children.map((c) => (
              <Link key={c.id} href={`/work/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/40 group">
                <span className={`text-xs ${(STATUS[c.status] ?? ST_DEFAULT).color}`}>●</span>
                <span className="text-sm text-slate-200 flex-1 min-w-0 truncate group-hover:text-white">{c.title}</span>
                <span className="text-xs text-slate-500">{c.assignee?.name ?? "Chưa giao"}</span>
                <span className={`text-xs ${(STATUS[c.status] ?? ST_DEFAULT).color}`}>{(STATUS[c.status] ?? ST_DEFAULT).label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* File đính kèm */}
      <Attachments workId={id} canDelete={isAssignee || isCreator} />

      {/* Bình luận */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 text-sm font-medium text-slate-300 flex items-center gap-2">
          <MessageSquare size={14} /> Bình luận ({item.comments.length})
        </div>
        <div className="p-5 space-y-3">
          {item.comments.length === 0 && <p className="text-sm text-slate-500">Chưa có bình luận.</p>}
          {item.comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs text-white flex-shrink-0">
                {c.user?.name?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-xs text-slate-500">{c.user?.name} · {new Date(c.createdAt).toLocaleString("vi-VN")}</div>
                <div className="text-sm text-slate-200 whitespace-pre-wrap">{c.content}</div>
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <input value={comment} onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && comment.trim()) { act(() => apiSend(`/api/work/${id}/comments`, "POST", { content: comment.trim() }), "comment"); setComment(""); } }}
              placeholder="Viết bình luận..."
              className="flex-1 bg-slate-800 border border-slate-700 focus:border-cyan-500 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm outline-none" />
            <button onClick={() => { if (comment.trim()) { act(() => apiSend(`/api/work/${id}/comments`, "POST", { content: comment.trim() }), "comment"); setComment(""); } }}
              disabled={!comment.trim() || busy === "comment"}
              className="px-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg flex items-center">
              {busy === "comment" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Attachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
  uploader: { id: string; name: string } | null;
  url: string | null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Attachments({ workId, canDelete }: { workId: string; canDelete: boolean }) {
  const { data, loading, refresh } = useApi<Attachment[]>(`/api/work/${workId}/attachments`);
  const [busy, setBusy] = useState(false);
  const files = data ?? [];

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset để chọn lại cùng file vẫn kích hoạt
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiFetch(`/api/work/${workId}/attachments`, { method: "POST", body: fd });
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi tải file lên");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (fileId: string) => {
    if (!confirm("Gỡ file đính kèm này?")) return;
    setBusy(true);
    try {
      await apiSend(`/api/work/${workId}/attachments/${fileId}`, "DELETE");
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi gỡ file");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <Paperclip size={14} /> File đính kèm ({files.length})
        </span>
        <label className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer ${busy ? "bg-slate-700 text-slate-400" : "bg-cyan-600 hover:bg-cyan-500 text-white"}`}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Tải lên
          <input type="file" className="hidden" onChange={onUpload} disabled={busy} />
        </label>
      </div>
      {loading ? (
        <p className="px-5 py-4 text-sm text-slate-500">Đang tải...</p>
      ) : files.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">Chưa có file đính kèm.</p>
      ) : (
        <div className="divide-y divide-slate-800">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-5 py-3">
              <Paperclip size={14} className="text-slate-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-200 truncate">{f.name}</div>
                <div className="text-xs text-slate-500">
                  {formatBytes(f.size)}{f.uploader ? ` · ${f.uploader.name}` : ""} · {new Date(f.createdAt).toLocaleDateString("vi-VN")}
                </div>
              </div>
              {f.url && (
                <a href={f.url} target="_blank" rel="noopener noreferrer" download={f.name}
                  className="p-1.5 text-slate-400 hover:text-cyan-400" title="Tải xuống">
                  <Download size={15} />
                </a>
              )}
              {canDelete && (
                <button onClick={() => onDelete(f.id)} disabled={busy}
                  className="p-1.5 text-slate-400 hover:text-red-400 disabled:opacity-40" title="Gỡ file">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
