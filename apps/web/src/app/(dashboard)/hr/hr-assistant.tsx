"use client";

// src/app/(dashboard)/hr/hr-assistant.tsx
// Trợ lý AI Nhân sự (panel bên phải trang /hr) — theo cùng rule trợ lý của các module
// khác, chỉ khác SKILL: ưu tiên agent Nhân sự (HR). Hỗ trợ soạn JD, sàng lọc CV, chính
// sách lương/BHXH/thuế, tiêu chí đánh giá. Chat SSE + đính kèm CV + lưu .md vào Tài liệu.

import { useState, useEffect, useRef, useCallback } from "react";
import { Bot, Send, Loader2, Sparkles, Save, Paperclip, X, FileText, ScanSearch, Calculator, ClipboardCheck } from "lucide-react";
import { apiFetch, apiSend } from "@/lib/api/client";
import { streamAgentChat } from "@/lib/ai/agent-chat";
import { Markdown } from "@/components/markdown";

interface AgentOpt { agentId: string; displayName: string; department: string | null; level: string }
interface Msg { id: string; role: "user" | "assistant"; content: string }

const QUICK = [
  { key: "jd", label: "Soạn JD", icon: FileText,
    prompt: "Soạn Mô tả công việc (JD) cho vị trí [tên vị trí] thuộc phòng [phòng ban]. Gồm: mục tiêu công việc, trách nhiệm chính, yêu cầu (kinh nghiệm/kỹ năng/bằng cấp), quyền lợi. Trả về markdown." },
  { key: "cv", label: "Sàng lọc CV", icon: ScanSearch,
    prompt: "Sàng lọc CV ứng viên sau cho vị trí [tên vị trí]: tóm tắt điểm mạnh/yếu, mức độ phù hợp (Cao/TB/Thấp), câu hỏi phỏng vấn gợi ý.\n\n[Dán CV hoặc đính kèm tệp]" },
  { key: "payroll", label: "Chính sách lương/BHXH", icon: Calculator,
    prompt: "Giải thích cách tính lương thực nhận từ lương gross [số tiền], [số] người phụ thuộc theo quy định VN hiện hành: BHXH/BHYT/BHTN (10.5% NV), thuế TNCN lũy tiến, giảm trừ gia cảnh (11tr bản thân + 4.4tr/người phụ thuộc). Trình bày từng bước." },
  { key: "review", label: "Tiêu chí đánh giá", icon: ClipboardCheck,
    prompt: "Đề xuất bộ tiêu chí đánh giá hiệu suất (KPI) định kỳ cho vị trí [tên vị trí], thang điểm và trọng số." },
] as const;

export function HrAssistant({ roleName, roleLevel }: { roleName: string | null; roleLevel: string | null }) {
  const [agentId, setAgentId] = useState("");
  const [agentName, setAgentName] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ msg: string; err?: boolean } | null>(null);
  const [attach, setAttach] = useState<{ name: string; text: string } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showFlash = (msg: string, err = false) => { setFlash({ msg, err }); setTimeout(() => setFlash(null), 4000); };

  // Chọn agent: ưu tiên Nhân sự → tên role user → level → đầu DS.
  useEffect(() => {
    apiFetch<AgentOpt[]>("/api/ai/agents/company")
      .then(({ data }) => {
        const list = data ?? [];
        const find = (kw: string) => list.find((a) => a.displayName?.toLowerCase().includes(kw));
        const rn = (roleName ?? "").toLowerCase().trim();
        const match =
          find("nhân sự") ?? find("hr") ??
          (rn ? list.find((a) => a.displayName?.toLowerCase().includes(rn)) : undefined) ??
          (roleLevel ? list.find((a) => a.level === roleLevel) : undefined) ??
          list[0];
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

  async function onPickFile(f: File | null) {
    if (!f) return;
    setExtracting(true); setError(null);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/ai/extract", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) throw new Error(json?.error?.message ?? "Không trích xuất được tệp");
      setAttach({ name: json.data.filename as string, text: json.data.text as string });
    } catch (e) {
      showFlash(e instanceof Error ? e.message : "Lỗi đính kèm", true);
    } finally {
      setExtracting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const send = useCallback(async () => {
    const userText = input.trim();
    if ((!userText && !attach) || loading || !agentId) return;
    const fullMsg = attach
      ? `${userText || "Phân tích tệp đính kèm sau:"}\n\n--- Nội dung tệp "${attach.name}" ---\n${attach.text}`
      : userText;
    setError(null); setInput(""); setAttach(null);
    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: "user", content: userText || `📎 ${attach?.name}` }]);
    setLoading(true);
    const aId = `a_${Date.now()}`;
    let added = false;
    try {
      await streamAgentChat(agentId, fullMsg, sessionId, {
        onSession: (sid, isNew) => { if (sid && (isNew || !sessionId)) setSessionId(sid); },
        onText: (chunk) => {
          if (!added) { added = true; setMessages((prev) => [...prev, { id: aId, role: "assistant", content: chunk }]); }
          else setMessages((prev) => prev.map((m) => (m.id === aId ? { ...m, content: m.content + chunk } : m)));
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi không xác định");
    } finally { setLoading(false); }
  }, [input, attach, loading, agentId, sessionId]);

  const saveDoc = async (m: Msg) => {
    setActing(`save_${m.id}`);
    try {
      await apiSend("/api/ai/save-document", "POST", { content: m.content });
      showFlash("Đã lưu vào mục Tài liệu (.md)");
    } catch (e) {
      showFlash(e instanceof Error ? e.message : "Lỗi lưu tài liệu", true);
    } finally { setActing(null); }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[calc(100vh-9rem)] min-h-[460px] overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-purple-600/20 border border-purple-700/40 flex items-center justify-center flex-shrink-0">
          <Sparkles size={14} className="text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">Trợ lý Nhân sự</div>
          {agentName && <div className="text-[10px] text-slate-500 truncate">{agentName}</div>}
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-300 border border-purple-700/40 flex-shrink-0">AI</span>
      </div>

      {flash && (
        <div className={`px-3 py-2 text-xs border-b ${flash.err ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-emerald-900/20 border-emerald-800/30 text-emerald-300"}`}>
          {flash.err ? "⚠ " : "✓ "}{flash.msg}
        </div>
      )}

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
            <p className="text-xs max-w-xs">Trợ lý hỗ trợ <b>soạn JD, sàng lọc CV, chính sách lương/BHXH/thuế</b> và <b>tiêu chí đánh giá</b>. Bấm thao tác nhanh hoặc đính kèm CV.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div className={`max-w-[92%] rounded-xl px-3 py-2 text-xs ${m.role === "user" ? "bg-purple-700 text-white whitespace-pre-wrap" : "bg-slate-800 text-slate-100"}`}>
              {m.role === "assistant" ? <Markdown className="text-xs">{m.content}</Markdown> : m.content}
            </div>
            {m.role === "assistant" && m.content.length > 0 && (
              <div className="flex gap-1.5 mt-1">
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

      {attach && (
        <div className="px-3 py-2 border-t border-slate-800 flex items-center gap-2 text-xs text-slate-300">
          <Paperclip size={12} className="text-purple-400" />
          <span className="flex-1 truncate">{attach.name}</span>
          <button onClick={() => setAttach(null)} className="text-slate-500 hover:text-red-400"><X size={13} /></button>
        </div>
      )}

      <div className="p-3 border-t border-slate-800">
        <div className="flex gap-2 items-end">
          <button onClick={() => fileRef.current?.click()} disabled={extracting || loading} title="Đính kèm CV (.txt/.md hoặc ảnh)"
            className="px-2.5 h-[38px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg flex items-center disabled:opacity-50">
            {extracting ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
          </button>
          <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,image/*" className="hidden" onChange={(e) => onPickFile(e.target.files?.[0] ?? null)} />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Hỏi trợ lý nhân sự, hoặc dán CV cần sàng lọc..."
            rows={1}
            disabled={loading || !agentId}
            className="flex-1 bg-slate-800 border border-slate-700 focus:border-purple-500 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-xs resize-none outline-none"
            style={{ minHeight: 38, maxHeight: 140 }}
          />
          <button onClick={() => void send()} disabled={(!input.trim() && !attach) || loading || !agentId}
            className="px-3 h-[38px] bg-purple-700 hover:bg-purple-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg flex items-center">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
