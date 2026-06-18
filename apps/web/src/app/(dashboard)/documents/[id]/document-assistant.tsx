"use client";

// src/app/(dashboard)/documents/[id]/document-assistant.tsx
// Trợ lý AI cho 1 tài liệu: tự nạp nội dung tài liệu làm ngữ cảnh, hỏi-đáp qua SSE
// (tái dùng hạ tầng agent chat). Nội dung được gửi kèm ở tin nhắn ĐẦU của phiên;
// các lượt sau dựa vào lịch sử phiên nên không gửi lại toàn văn.

import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Send, Loader2, Sparkles, X } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { streamAgentChat } from "@/lib/ai/agent-chat";

interface Msg { id: string; role: "user" | "assistant"; content: string }
interface AgentOpt { agentId: string; displayName: string; department: string | null; level: string }

const MAX_CTX = 14000; // cắt nội dung dài để vừa giới hạn token
const QUICK: { label: string; prompt: string }[] = [
  { label: "Tóm tắt", prompt: "Tóm tắt nội dung tài liệu này trong 5–7 gạch đầu dòng ngắn gọn." },
  { label: "Ý chính", prompt: "Liệt kê các điểm/ý chính quan trọng nhất của tài liệu." },
  { label: "Điểm cần lưu ý", prompt: "Chỉ ra các điểm cần lưu ý, rủi ro hoặc điều khoản quan trọng (nếu có)." },
  { label: "Câu hỏi gợi ý", prompt: "Gợi ý 5 câu hỏi hữu ích tôi nên đặt ra về tài liệu này." },
];

export function DocumentAssistant({ docId, docName, onClose }: { docId: string; docName: string; onClose: () => void }) {
  const [agentId, setAgentId] = useState("");
  const [agentName, setAgentName] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docText, setDocText] = useState<string | null>(null); // null = đang tải
  const bottomRef = useRef<HTMLDivElement>(null);

  // Chọn agent (ưu tiên "tài liệu/trợ lý/văn phòng", else đầu danh sách).
  useEffect(() => {
    apiFetch<AgentOpt[]>("/api/ai/agents/company")
      .then(({ data }) => {
        const list = data ?? [];
        const find = (kw: string) => list.find((a) => a.displayName?.toLowerCase().includes(kw));
        const m = find("tài liệu") ?? find("văn phòng") ?? find("trợ lý") ?? find("hành chính") ?? list[0];
        if (m) { setAgentId(m.agentId); setAgentName(m.displayName); }
        else setError("Chưa có trợ lý AI nào. Tạo agent ở mục AI để dùng.");
      })
      .catch(() => setError("Không tải được danh sách trợ lý."));
  }, []);

  // Nạp nội dung tài liệu (trích text) làm ngữ cảnh.
  useEffect(() => {
    apiFetch<{ content: string }>(`/api/documents/${docId}/content`)
      .then(({ data }) => setDocText((data?.content ?? "").slice(0, MAX_CTX)))
      .catch(() => setDocText(""));
  }, [docId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const send = useCallback(async (raw: string) => {
    const userText = raw.trim();
    if (!userText || loading || !agentId) return;
    if (docText === null) { setError("Đang nạp nội dung tài liệu, thử lại sau giây lát."); return; }

    // Tin đầu phiên: gửi kèm toàn văn tài liệu làm ngữ cảnh.
    const firstTurn = messages.length === 0;
    const fullMsg = firstTurn
      ? `Bạn là trợ lý phân tích tài liệu. Dưới đây là nội dung tài liệu "${docName}". Hãy chỉ dựa vào nội dung này để trả lời, nếu không có thông tin thì nói rõ.\n\n--- NỘI DUNG TÀI LIỆU ---\n${docText || "(tài liệu trống hoặc không trích xuất được text)"}\n--- HẾT NỘI DUNG ---\n\nYêu cầu: ${userText}`
      : userText;

    setError(null); setInput("");
    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: "user", content: userText }]);
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
  }, [input, loading, agentId, sessionId, messages.length, docText, docName]);

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-violet-500/15 rounded-lg"><Bot size={16} className="text-violet-300" /></div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">Trợ lý tài liệu</div>
            <div className="text-[11px] text-slate-500 truncate">{agentName || "…"}</div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X size={16} /></button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <Sparkles className="w-8 h-8 text-violet-400/60 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Hỏi bất cứ điều gì về tài liệu này.</p>
            <p className="text-[11px] text-slate-600 mt-1">
              {docText === null ? "Đang nạp nội dung…" : docText ? "Đã nạp nội dung tài liệu." : "Tài liệu không có text để phân tích."}
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-sm ${
              m.role === "user" ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-200"
            }`}>
              {m.role === "assistant"
                ? <div className="prose prose-invert prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div>
                : m.content}
            </div>
          </div>
        ))}
        {loading && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={13} className="animate-spin" /> Đang soạn…</div>}
        <div ref={bottomRef} />
      </div>

      {/* Quick actions */}
      {messages.length === 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
          {QUICK.map((q) => (
            <button key={q.label} disabled={loading || !agentId} onClick={() => send(q.prompt)}
              className="px-2.5 py-1 text-[11px] rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 disabled:opacity-50">
              {q.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-slate-800 shrink-0">
        {error && <div className="mb-2 text-xs text-red-400">⚠ {error}</div>}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Hỏi về tài liệu…"
            rows={1}
            className="flex-1 resize-none px-3 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 max-h-28"
          />
          <button onClick={() => send(input)} disabled={loading || !input.trim() || !agentId}
            className="p-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg disabled:opacity-40">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
