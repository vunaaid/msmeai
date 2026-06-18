"use client";

// src/app/(dashboard)/accounting/accounting-assistant.tsx
// Trợ lý Kế Toán: chat inline với agent kế toán (KTT/Kế toán viên/CFO).
// - Tư vấn → trả lời ngay (không tạo việc, không lẫn vào module Công Việc).
// - "Lập bút toán" → tạo bút toán PENDING thẳng vào Sổ Cái (chờ người gl:approve ghi sổ).
// - "Lưu tài liệu" → lưu nội dung thành .md trong mục Tài liệu.

import { useState, useEffect, useRef, useCallback } from "react";
import { Bot, Send, Loader2, Sparkles, BookPlus, Save } from "lucide-react";
import { apiFetch, apiSend } from "@/lib/api/client";
import { streamAgentChat } from "@/lib/ai/agent-chat";
import { Markdown } from "@/components/markdown";

interface AgentOpt { agentId: string; displayName: string; department: string | null; level: string }
interface Msg { id: string; role: "user" | "assistant"; content: string }

export function AccountingAssistant({ roleName, roleLevel, onEntryCreated }: {
  roleName: string | null;
  roleLevel: string | null;
  onEntryCreated?: () => void;
}) {
  const [agentId, setAgentId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ msg: string; err?: boolean } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const showFlash = (msg: string, err = false) => { setFlash({ msg, err }); setTimeout(() => setFlash(null), 4000); };

  const title = roleName ? `Trợ lý ${roleName}` : "Trợ lý Kế Toán";

  // Chọn trợ lý theo VAI TRÒ của user (giống Trợ lý Công Việc): khớp tên role → level → đầu DS.
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

  // Đổi agent → nạp lại lịch sử session gần nhất của agent đó.
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setMessages([]); setSessionId(null);
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
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  const send = useCallback(async () => {
    const userMsg = input.trim();
    if (!userMsg || loading || !agentId) return;
    setError(null); setInput("");
    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: "user", content: userMsg }]);
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
    } finally { setLoading(false); }
  }, [input, loading, agentId, sessionId]);

  // "Lập bút toán": sinh định khoản từ nội dung tin → bút toán PENDING vào Sổ Cái.
  const draftEntry = async (m: Msg) => {
    setActing(`je_${m.id}`);
    try {
      const { data } = await apiSend<{ number: string; status: string }>(
        "/api/ai/draft-journal-entry", "POST", { content: m.content, agentId },
      );
      showFlash(`Đã tạo bút toán ${data?.number ?? ""} (chờ duyệt) — vào tab Sổ Cái để ghi sổ.`);
      onEntryCreated?.();
    } catch (e) {
      showFlash(e instanceof Error ? e.message : "Lỗi lập bút toán", true);
    } finally { setActing(null); }
  };

  const saveDoc = async (m: Msg) => {
    setActing(`save_${m.id}`);
    try {
      await apiSend("/api/ai/save-document", "POST", { content: m.content });
      showFlash("Đã lưu tài liệu (.md) vào mục Tài liệu");
    } catch (e) {
      showFlash(e instanceof Error ? e.message : "Lỗi lưu tài liệu", true);
    } finally { setActing(null); }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[calc(100vh-16rem)] min-h-[460px] overflow-hidden">
      {/* Header + chọn agent */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-700/40 flex items-center justify-center flex-shrink-0">
          <Sparkles size={14} className="text-blue-400" />
        </div>
        <span className="text-sm font-semibold text-white flex-1 truncate">{title}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-300 border border-blue-700/40 flex-shrink-0">Kế Toán</span>
      </div>

      {flash && (
        <div className={`px-3 py-2 text-xs border-b ${flash.err ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-emerald-900/20 border-emerald-800/30 text-emerald-300"}`}>
          {flash.err ? "⚠ " : "✓ "}{flash.msg}
        </div>
      )}

      {/* Tin nhắn */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-500">
            <Bot size={28} className="text-blue-400/60" />
            <p className="text-xs max-w-xs">Hỏi nghiệp vụ kế toán, hoặc mô tả giao dịch rồi bấm “Lập bút toán” để đưa vào Sổ Cái (chờ duyệt).</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs ${m.role === "user" ? "bg-blue-700 text-white whitespace-pre-wrap" : "bg-slate-800 text-slate-100"}`}>
              {m.role === "assistant" ? <Markdown className="text-xs">{m.content}</Markdown> : m.content}
            </div>
            {m.role === "assistant" && m.content.length > 0 && (
              <div className="flex gap-1.5 mt-1">
                <button onClick={() => draftEntry(m)} disabled={acting !== null}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-blue-300 bg-blue-600/15 border border-blue-700/40 hover:bg-blue-600/30 disabled:opacity-50">
                  {acting === `je_${m.id}` ? <Loader2 size={11} className="animate-spin" /> : <BookPlus size={11} />} Lập bút toán
                </button>
                <button onClick={() => saveDoc(m)} disabled={acting !== null}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-emerald-300 bg-emerald-600/15 border border-emerald-700/40 hover:bg-emerald-600/30 disabled:opacity-50">
                  {acting === `save_${m.id}` ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Lưu tài liệu
                </button>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-xl px-3 py-2 text-slate-400 flex items-center gap-2 text-xs">
              <Loader2 size={13} className="animate-spin" /> Đang xử lý...
            </div>
          </div>
        )}
        {error && <div className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">{error}</div>}
        <div ref={bottomRef} />
      </div>

      {/* Ô nhập */}
      <div className="p-3 border-t border-slate-800">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Nhập nghiệp vụ / câu hỏi kế toán..."
            rows={1}
            disabled={loading || !agentId}
            className="flex-1 bg-slate-800 border border-slate-700 focus:border-blue-500 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-xs resize-none outline-none"
            style={{ minHeight: 38, maxHeight: 120 }}
          />
          <button onClick={() => void send()} disabled={!input.trim() || loading || !agentId}
            className="px-3 bg-blue-700 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg flex items-center">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
