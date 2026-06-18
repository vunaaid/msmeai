"use client";

// src/app/(dashboard)/work/work-assistant.tsx
// Panel Trợ lý AI (1/4) trong trang Công Việc.
// - Tự nạp agent (skill) theo ROLE của user.
// - Mỗi tin trợ lý có nút: "Tạo công việc" (phân rã → modal giao việc) & "Cập nhật"
//   (ghi nội dung vào mô tả công việc ngữ cảnh theo ngày).

import { useState, useEffect, useRef, useCallback } from "react";
import { Bot, Send, Loader2, Sparkles, ClipboardList, FileEdit, Save } from "lucide-react";
import { apiFetch, apiSend } from "@/lib/api/client";
import { streamAgentChat } from "@/lib/ai/agent-chat";
import { Markdown } from "@/components/markdown";
import { TaskProposalModal, type Candidate, type PlanTask } from "@/components/task-proposal-modal";

interface AgentOpt { agentId: string; displayName: string; level: string }
interface Msg { id: string; role: "user" | "assistant"; content: string }

interface Props {
  roleName: string | null;
  roleLevel: string | null;
  /** Câu hỏi đẩy từ bên ngoài (bấm AI trên 1 công việc) → tự gửi. */
  prompt?: string | null;
  onPromptConsumed?: () => void;
  /** Công việc ngữ cảnh (khi mở trợ lý từ 1 công việc) → "Cập nhật" ghi vào mô tả việc này. */
  contextWork?: { id: string; title: string } | null;
  /** Gọi sau khi tạo/cập nhật việc để workboard refresh. */
  onChanged?: () => void;
}

export function WorkAssistant({ roleName, roleLevel, prompt, onPromptConsumed, contextWork, onChanged }: Props) {
  const [agentId, setAgentId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ msg: string; err?: boolean } | null>(null);
  const [proposal, setProposal] = useState<{ tasks: PlanTask[]; candidates: Candidate[]; parentId?: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const title = roleName ? `Trợ lý ${roleName}` : "Trợ lý AI";

  const showFlash = (msg: string, err = false) => { setFlash({ msg, err }); setTimeout(() => setFlash(null), 3500); };

  useEffect(() => {
    apiFetch<AgentOpt[]>("/api/ai/agents/company")
      .then(({ data }) => {
        const list = data ?? [];
        const rn = (roleName ?? "").toLowerCase().trim();
        const match =
          (rn ? list.find((a) => a.displayName?.toLowerCase().includes(rn)) : undefined) ??
          (roleLevel ? list.find((a) => a.level === roleLevel) : undefined) ??
          list[0];
        if (match) setAgentId(match.agentId);
      })
      .catch(() => {});
  }, [roleName, roleLevel]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // Tải lại lịch sử: session gần nhất của agent này (chỉ khi panel đang trống).
  useEffect(() => {
    if (!agentId || messages.length > 0 || prompt) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: sessions } = await apiFetch<{ id: string }[]>(`/api/ai/sessions?agentId=${agentId}&limit=1`);
        const sid = sessions?.[0]?.id;
        if (!sid || cancelled) return;
        const { data: msgs } = await apiFetch<{ id: string; role: string; content: string }[]>(`/api/ai/sessions/${sid}/messages?limit=100`);
        if (cancelled) return;
        setSessionId(sid);
        setMessages((msgs ?? [])
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content })));
      } catch { /* ignore — bắt đầu phiên trống nếu lỗi */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const sendText = useCallback(async (text: string) => {
    const userMsg = text.trim();
    if (!userMsg || loading || !agentId) return;
    setError(null);
    const tempId = `u_${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, role: "user", content: userMsg }]);
    setLoading(true);
    const aId = `a_${Date.now()}`;
    let added = false;
    try {
      await streamAgentChat(agentId, userMsg, sessionId, {
        onSession: (sid, isNew) => { if (sid && (isNew || !sessionId)) setSessionId(sid); },
        onText: (chunk) => {
          if (!added) { added = true; setMessages((prev) => [...prev, { id: aId, role: "assistant", content: chunk }]); }
          else setMessages((prev) => prev.map((m) => (m.id === aId ? { ...m, content: m.content + chunk } : m)));
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi không xác định");
      setMessages((prev) => prev.filter((m) => m.id !== tempId && m.id !== aId));
    } finally {
      setLoading(false);
    }
  }, [loading, agentId, sessionId]);

  const send = useCallback(() => {
    const t = input.trim();
    if (!t) return;
    setInput("");
    void sendText(t);
  }, [input, sendText]);

  useEffect(() => {
    if (prompt && agentId && !loading) {
      void sendText(prompt);
      onPromptConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, agentId]);

  // Nút "Tạo công việc": phân rã nội dung tin AI → modal đề xuất
  const createFromMessage = async (m: Msg) => {
    setActing(`create_${m.id}`);
    try {
      const { data } = await apiSend<{ tasks: PlanTask[]; candidates: Candidate[] }>(
        "/api/ai/plan-tasks", "POST", { content: m.content }
      );
      if (!data?.tasks?.length) { showFlash("AI không tách được công việc nào", true); return; }
      // Nếu mở trợ lý từ 1 công việc → các việc tạo ra là việc con của công việc đó.
      setProposal({ tasks: data.tasks, candidates: data.candidates ?? [], parentId: contextWork?.id });
    } catch (e) {
      showFlash(e instanceof Error ? e.message : "Lỗi phân tích", true);
    } finally { setActing(null); }
  };

  // Nút "Lưu tài liệu": lưu nội dung tin AI thành file .md trong mục Tài liệu.
  const saveDoc = async (m: Msg) => {
    setActing(`save_${m.id}`);
    try {
      await apiSend<{ id: string; link: string }>("/api/ai/save-document", "POST", { content: m.content });
      showFlash("Đã lưu tài liệu (.md) vào mục Tài liệu");
    } catch (e) {
      showFlash(e instanceof Error ? e.message : "Lỗi lưu tài liệu", true);
    } finally { setActing(null); }
  };

  // Nút "Cập nhật": ghi nội dung tin AI vào mô tả công việc ngữ cảnh (theo ngày)
  const updateContextWork = async (m: Msg) => {
    if (!contextWork) { showFlash("Hãy mở trợ lý từ một công việc để cập nhật", true); return; }
    setActing(`update_${m.id}`);
    try {
      await apiSend(`/api/work/${contextWork.id}/append-note`, "POST", { content: m.content, heading: "Trao đổi với trợ lý" });
      showFlash(`Đã cập nhật vào "${contextWork.title}"`);
      onChanged?.();
    } catch (e) {
      showFlash(e instanceof Error ? e.message : "Lỗi cập nhật", true);
    } finally { setActing(null); }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[70vh] lg:h-[calc(100vh-8rem)] lg:sticky lg:top-2 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-purple-600/20 border border-purple-700/40 flex items-center justify-center flex-shrink-0">
          <Sparkles size={14} className="text-purple-400" />
        </div>
        <span className="text-sm font-semibold text-white truncate flex-1">{title}</span>
        {contextWork && <span className="text-[10px] text-slate-500 truncate max-w-[40%]" title={contextWork.title}>↳ {contextWork.title}</span>}
      </div>

      {flash && (
        <div className={`px-3 py-2 text-xs border-b ${flash.err ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-emerald-900/20 border-emerald-800/30 text-emerald-300"}`}>
          {flash.err ? "⚠ " : "✓ "}{flash.msg}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-500">
            <Bot size={28} className="text-purple-400/60" />
            <p className="text-xs">Hỏi trợ lý về công việc của bạn</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs ${m.role === "user" ? "bg-blue-700 text-white whitespace-pre-wrap" : "bg-slate-800 text-slate-100"}`}>
              {m.role === "assistant" ? <Markdown className="text-xs">{m.content}</Markdown> : m.content}
            </div>
            {m.role === "assistant" && m.content.length > 0 && (
              <div className="flex gap-1.5 mt-1">
                <button onClick={() => createFromMessage(m)} disabled={acting !== null}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-cyan-300 bg-cyan-600/15 border border-cyan-700/40 hover:bg-cyan-600/30 disabled:opacity-50">
                  {acting === `create_${m.id}` ? <Loader2 size={11} className="animate-spin" /> : <ClipboardList size={11} />} Tạo task
                </button>
                <button onClick={() => saveDoc(m)} disabled={acting !== null}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-emerald-300 bg-emerald-600/15 border border-emerald-700/40 hover:bg-emerald-600/30 disabled:opacity-50">
                  {acting === `save_${m.id}` ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Lưu tài liệu
                </button>
                <button onClick={() => updateContextWork(m)} disabled={acting !== null}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-slate-300 bg-slate-700/40 border border-slate-600/50 hover:bg-slate-700 disabled:opacity-50">
                  {acting === `update_${m.id}` ? <Loader2 size={11} className="animate-spin" /> : <FileEdit size={11} />} Cập nhật
                </button>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-xl px-3 py-2 text-slate-400 flex items-center gap-2 text-xs">
              <Loader2 size={13} className="animate-spin" /> Đang trả lời...
            </div>
          </div>
        )}
        {error && <div className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">{error}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-slate-800">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Nhập câu hỏi..."
            rows={1}
            disabled={loading || !agentId}
            className="flex-1 bg-slate-800 border border-slate-700 focus:border-purple-500 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-xs resize-none outline-none"
            style={{ minHeight: 38, maxHeight: 120 }}
          />
          <button onClick={() => void send()} disabled={!input.trim() || loading || !agentId}
            className="px-3 bg-purple-700 hover:bg-purple-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg flex items-center">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>

      {proposal && (
        <TaskProposalModal
          tasks={proposal.tasks}
          candidates={proposal.candidates}
          parentId={proposal.parentId}
          onClose={() => setProposal(null)}
          onDone={(count) => { setProposal(null); showFlash(`Đã giao ${count} công việc`); onChanged?.(); }}
        />
      )}
    </div>
  );
}
