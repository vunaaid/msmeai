"use client";

// src/app/(dashboard)/work/create-work-modal.tsx

import { useState, useEffect, useTransition } from "react";
import { X, Loader2, ClipboardList, Sparkles, Wand2, ListTree } from "lucide-react";
import { apiFetch, apiSend } from "@/lib/api/client";
import { TaskProposalModal, type Candidate, type PlanTask } from "@/components/task-proposal-modal";

interface Assignee { id: string; name: string; role: string | null; isSelf: boolean }
interface Project { id: string; title: string }

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateWorkModal({ open, onClose, onSuccess }: Props) {
  const [title, setTitle]           = useState("");
  const [description, setDesc]      = useState("");
  const [note, setNote]             = useState("");
  const [workType, setWorkType]     = useState<"operational" | "project_task">("operational");
  const [projectId, setProjectId]   = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority]     = useState<"high"|"normal"|"low">("normal");
  const [dueDate, setDueDate]       = useState("");
  const [users, setUsers]           = useState<Assignee[]>([]);
  const [projects, setProjects]     = useState<Project[]>([]);
  const [error, setError]           = useState<string | null>(null);
  const [aiBusy, setAiBusy]         = useState<"describe" | "breakdown" | null>(null);
  const [proposal, setProposal]     = useState<{ tasks: PlanTask[]; candidates: Candidate[]; parentId: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    // Nhân sự được giao = cấp dưới (endpoint /work/assignees, không cần quyền admin).
    Promise.all([
      apiFetch<Assignee[]>("/api/work/assignees"),
      apiFetch<Project[]>("/api/projects?limit=100"),
    ]).then(([u, p]) => {
      setUsers(u.data ?? []);
      setProjects(p.data ?? []);
    }).catch(() => {/* ignore — dropdown trống nếu lỗi */});
  }, [open]);

  useEffect(() => {
    if (!open) {
      setTitle(""); setDesc(""); setNote(""); setWorkType("operational");
      setProjectId(""); setAssignedTo(""); setPriority("normal");
      setDueDate(""); setError(null); setAiBusy(null); setProposal(null);
    }
  }, [open]);

  const buildBaseWork = () => ({
    title,
    description: description || undefined,
    note: note || undefined,
    workType,
    projectId: workType === "project_task" && projectId ? projectId : undefined,
    priority,
    dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await apiSend("/api/work", "POST", {
          ...buildBaseWork(),
          assignedTo: assignedTo || undefined,
        });
        onSuccess();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi kết nối máy chủ");
      }
    });
  };

  // AI viết mô tả rõ hơn từ tiêu đề (+ mô tả thô nếu có).
  const describeWithAI = async () => {
    if (title.trim().length < 2) { setError("Nhập tiêu đề trước khi nhờ AI mô tả"); return; }
    setError(null); setAiBusy("describe");
    try {
      const { data } = await apiSend<{ description: string }>("/api/ai/describe-task", "POST", {
        title, description: description || undefined,
      });
      if (data?.description) setDesc(data.description);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi tạo mô tả");
    } finally { setAiBusy(null); }
  };

  // AI tách thành việc con + đề xuất người nhận (cấp dưới) → mở modal giao việc.
  const breakIntoSubtasks = async () => {
    if (title.trim().length < 2) { setError("Nhập tiêu đề trước khi tách việc con"); return; }
    setError(null); setAiBusy("breakdown");
    try {
      // 1. Tạo công việc cha
      const { data: parent } = await apiSend<{ id: string }>("/api/work", "POST", {
        ...buildBaseWork(),
        assignedTo: assignedTo || undefined,
      });
      if (!parent?.id) throw new Error("Không tạo được công việc cha");
      // 2. AI phân rã → đề xuất người nhận
      const { data } = await apiSend<{ tasks: PlanTask[]; candidates: Candidate[] }>(
        "/api/ai/plan-tasks", "POST",
        { content: `${title}${description ? `\n\n${description}` : ""}` }
      );
      if (!data?.tasks?.length) {
        // Cha đã tạo nhưng không tách được việc con → vẫn coi là thành công.
        setError("AI chưa tách được việc con. Công việc đã được tạo, bạn có thể tự thêm việc con sau.");
        onSuccess();
        return;
      }
      setProposal({ tasks: data.tasks, candidates: data.candidates ?? [], parentId: parent.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi phân tích việc con");
    } finally { setAiBusy(null); }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !proposal) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-cyan-500/10 rounded-lg">
              <ClipboardList size={16} className="text-cyan-400" />
            </div>
            <h2 className="text-base font-semibold text-white">Tạo công việc mới</h2>
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

          {/* Loại công việc */}
          <div className="grid grid-cols-2 gap-2">
            {([["operational", "🔄 Vận hành"], ["project_task", "📁 Theo dự án"]] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setWorkType(v)}
                className={`py-2.5 rounded-lg text-sm font-medium border transition-all ${
                  workType === v
                    ? "bg-cyan-600/20 border-cyan-500/50 text-cyan-300"
                    : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Dự án (nếu project_task) */}
          {workType === "project_task" && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Dự án</label>
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60"
              >
                <option value="">— Chọn dự án —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          )}

          {/* Tiêu đề */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Tiêu đề công việc <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Mô tả ngắn gọn công việc cần làm..."
              className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60"
            />
          </div>

          {/* Mô tả + nút AI mô tả rõ hơn */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-300">Mô tả chi tiết</label>
              <button
                type="button"
                onClick={describeWithAI}
                disabled={aiBusy !== null || title.trim().length < 2}
                title="Nhờ AI viết mô tả rõ ràng từ tiêu đề"
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-purple-300 bg-purple-600/15 border border-purple-700/40 hover:bg-purple-600/30 disabled:opacity-40"
              >
                {aiBusy === "describe" ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                AI mô tả rõ hơn
              </button>
            </div>
            <textarea
              rows={4}
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="Nội dung, yêu cầu, kết quả kỳ vọng... (hoặc bấm “AI mô tả rõ hơn”)"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 resize-none"
            />
          </div>

          {/* Ghi chú */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Ghi chú</label>
            <textarea
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Ghi chú thêm (không bắt buộc)..."
              className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 resize-none"
            />
          </div>

          {/* Giao cho + Ưu tiên */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Giao cho (cấp dưới)</label>
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60"
              >
                <option value="">— Chưa giao —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.isSelf ? `${u.name} (tôi)` : u.name}{u.role ? ` · ${u.role}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Ưu tiên</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as typeof priority)}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60"
              >
                <option value="high">🟠 Cao</option>
                <option value="normal">⚪ Trung bình</option>
                <option value="low">🔵 Thấp</option>
              </select>
            </div>
          </div>

          {/* Deadline */}
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

          {/* AI tách việc con & giao cho cấp dưới */}
          <button
            type="button"
            onClick={breakIntoSubtasks}
            disabled={aiBusy !== null || isPending || title.trim().length < 2}
            className="w-full flex items-center gap-3 p-3 bg-purple-900/10 border border-purple-800/30 rounded-lg hover:bg-purple-900/20 transition-colors text-left disabled:opacity-40"
          >
            <div className="p-1.5 bg-purple-500/10 rounded-lg flex-shrink-0">
              {aiBusy === "breakdown" ? <Loader2 size={16} className="text-purple-400 animate-spin" /> : <ListTree size={16} className="text-purple-400" />}
            </div>
            <div>
              <span className="text-sm text-white font-medium flex items-center gap-1.5">
                <Sparkles size={12} className="text-purple-400" /> Tách việc con & giao cho cấp dưới
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                AI phân rã thành các việc con và đề xuất người nhận là cấp dưới. Bạn duyệt trước khi giao.
              </p>
            </div>
          </button>

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
              disabled={isPending || aiBusy !== null}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? <><Loader2 size={14} className="animate-spin" />Đang tạo...</> : <>Tạo công việc</>}
            </button>
          </div>
        </form>
      </div>

      {proposal && (
        <TaskProposalModal
          tasks={proposal.tasks}
          candidates={proposal.candidates}
          parentId={proposal.parentId}
          // Cha đã được tạo trước khi mở đề xuất → đóng/hủy vẫn refresh + đóng để tránh tạo cha trùng.
          onClose={() => { setProposal(null); onSuccess(); onClose(); }}
          onDone={() => { setProposal(null); onSuccess(); onClose(); }}
        />
      )}
    </div>
  );
}
