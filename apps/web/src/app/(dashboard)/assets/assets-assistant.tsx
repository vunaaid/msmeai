"use client";

// src/app/(dashboard)/assets/assets-assistant.tsx
// Trợ lý AI Tài sản & Góp vốn — cùng rule trợ lý, skill Tài chính/Kế toán.

import { useState, useEffect, useRef, useCallback } from "react";
import { Bot, Send, Loader2, Sparkles, Save, Calculator, Scale, FileText } from "lucide-react";
import { apiFetch, apiSend } from "@/lib/api/client";
import { streamAgentChat } from "@/lib/ai/agent-chat";
import { Markdown } from "@/components/markdown";

interface AgentOpt { agentId: string; displayName: string; level: string }
interface Msg { id: string; role: "user" | "assistant"; content: string }

const QUICK = [
  { key: "deprec", label: "Kế hoạch khấu hao", icon: Calculator,
    prompt: "Lập kế hoạch khấu hao đường thẳng cho tài sản: nguyên giá [số tiền], thời gian sử dụng [số năm]. Nêu mức khấu hao tháng/năm và khung TT45/2013 nếu liên quan." },
  { key: "valuation", label: "Định giá tài sản", icon: Scale,
    prompt: "Đề xuất phương pháp định giá cho tài sản góp vốn loại [QSDĐ/SHTT/máy móc...]: các phương pháp phù hợp, hồ sơ cần có, lưu ý pháp lý khi góp vốn vào công ty VN." },
  { key: "capital", label: "Hồ sơ góp vốn", icon: FileText,
    prompt: "Liệt kê thủ tục & hồ sơ góp vốn bằng [tiền/tài sản/quyền sử dụng đất/SHTT] vào công ty TNHH/CP theo quy định VN, và bút toán ghi tăng vốn." },
] as const;

export function AssetsAssistant({ roleName, roleLevel }: { roleName: string | null; roleLevel: string | null }) {
  const [agentId, setAgentId] = useState("");
  const [agentName, setAgentName] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<AgentOpt[]>("/api/ai/agents/company")
      .then(({ data }) => {
        const list = data ?? [];
        const find = (kw: string) => list.find((a) => a.displayName?.toLowerCase().includes(kw));
        const rn = (roleName ?? "").toLowerCase().trim();
        const match =
          find("tài chính") ?? find("kế toán") ?? find("finance") ?? find("cfo") ??
          (rn ? list.find((a) => a.displayName?.toLowerCase().includes(rn)) : undefined) ??
          (roleLevel ? list.find((a) => a.level === roleLevel) : undefined) ?? list[0];
        if (match) { setAgentId(match.agentId); setAgentName(match.displayName); }
      })
      .catch(() => {});
  }, [roleName, roleLevel]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

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
        setMessages((msgs ?? []).filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content })));
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  const send = useCallback(async () => {
    const userText = input.trim();
    if (!userText || loading || !agentId) return;
    setError(null); setInput("");
    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: "user", content: userText }]);
    setLoading(true);
    const aId = `a_${Date.now()}`;
    let added = false;
    try {
      await streamAgentChat(agentId, userText, sessionId, {
        onSession: (sid, isNew) => { if (sid && (isNew || !sessionId)) setSessionId(sid); },
        onText: (chunk) => {
          if (!added) { added = true; setMessages((prev) => [...prev, { id: aId, role: "assistant", content: chunk }]); }
          else setMessages((prev) => prev.map((m) => (m.id === aId ? { ...m, content: m.content + chunk } : m)));
        },
      });
    } catch (err) { setError(err instanceof Error ? err.message : "Lỗi"); } finally { setLoading(false); }
  }, [input, loading, agentId, sessionId]);

  const saveDoc = async (m: Msg) => {
    setActing(`save_${m.id}`);
    try { await apiSend("/api/ai/save-document", "POST", { content: m.content }); } catch { /* ignore */ } finally { setActing(null); }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[calc(100vh-9rem)] min-h-[460px] overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-purple-600/20 border border-purple-700/40 flex items-center justify-center flex-shrink-0">
          <Sparkles size={14} className="text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">Trợ lý Tài sản & Góp vốn</div>
          {agentName && <div className="text-[10px] text-slate-500 truncate">{agentName}</div>}
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-300 border border-purple-700/40 flex-shrink-0">AI</span>
      </div>

      <div className="px-3 py-2 border-b border-slate-800 flex flex-wrap gap-1.5">
        {QUICK.map((q) => {
          const Icon = q.icon;
          return (
            <button key={q.key} onClick={() => setInput(q.prompt)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-purple-200 bg-purple-600/10 border border-purple-700/30 hover:bg-purple-600/25">
              <Icon size={11} /> {q.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-500">
            <Bot size={28} className="text-purple-400/60" />
            <p className="text-xs max-w-xs">Trợ lý hỗ trợ <b>khấu hao, định giá tài sản, hồ sơ & bút toán góp vốn</b>.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div className={`max-w-[92%] rounded-xl px-3 py-2 text-xs ${m.role === "user" ? "bg-purple-700 text-white whitespace-pre-wrap" : "bg-slate-800 text-slate-100"}`}>
              {m.role === "assistant" ? <Markdown className="text-xs">{m.content}</Markdown> : m.content}
            </div>
            {m.role === "assistant" && m.content.length > 0 && (
              <button onClick={() => saveDoc(m)} disabled={acting !== null}
                className="mt-1 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-emerald-300 bg-emerald-600/15 border border-emerald-700/40 hover:bg-emerald-600/30 disabled:opacity-50">
                {acting === `save_${m.id}` ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Lưu tài liệu
              </button>
            )}
          </div>
        ))}
        {loading && <div className="flex justify-start"><div className="bg-slate-800 rounded-xl px-3 py-2 text-slate-400 flex items-center gap-2 text-xs"><Loader2 size={13} className="animate-spin" /> Đang xử lý...</div></div>}
        {error && <div className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">{error}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-slate-800">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Hỏi trợ lý tài sản & góp vốn..."
            rows={1}
            disabled={loading || !agentId}
            className="flex-1 bg-slate-800 border border-slate-700 focus:border-purple-500 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-xs resize-none outline-none"
            style={{ minHeight: 38, maxHeight: 140 }}
          />
          <button onClick={() => void send()} disabled={!input.trim() || loading || !agentId}
            className="px-3 h-[38px] bg-purple-700 hover:bg-purple-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg flex items-center">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
