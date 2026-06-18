"use client";

// src/app/(dashboard)/contracts/contracts-assistant.tsx
// Trợ lý AI Hợp đồng (panel bên phải trang /contracts).
// - Phân tích / rà soát rủi ro / đối chiếu điều khoản / soạn thảo hợp đồng (đầu vào & đầu ra).
// - Chat với agent (ưu tiên Pháp lý → Nhân sự → role của user) qua SSE.
// - Đính kèm tệp văn bản/ảnh (hợp đồng scan) → trích nội dung đưa vào phân tích.
// - "Lưu tài liệu" → lưu dự thảo/kết quả thành .md trong mục Tài liệu.

import { useState, useEffect, useRef, useCallback } from "react";
import { Bot, Send, Loader2, Sparkles, Save, Paperclip, X, ScanSearch, ShieldAlert, GitCompare, FilePlus2, Scale, FileSignature } from "lucide-react";
import { apiFetch, apiSend } from "@/lib/api/client";
import { streamAgentChat } from "@/lib/ai/agent-chat";
import { Markdown } from "@/components/markdown";
import type { ContractPrefill } from "./contract-meta";

interface AgentOpt { agentId: string; displayName: string; department: string | null; level: string }
interface Msg { id: string; role: "user" | "assistant"; content: string }

// Mẫu lời nhắc thao tác nhanh — bấm để điền vào ô nhập rồi tùy chỉnh.
const QUICK = [
  { key: "analyze", label: "Phân tích", icon: ScanSearch,
    prompt: "Phân tích hợp đồng sau: tóm tắt các bên, giá trị, thời hạn, nghĩa vụ chính, điều khoản thanh toán và các điểm cần lưu ý.\n\n[Dán nội dung hợp đồng vào đây hoặc đính kèm tệp]" },
  { key: "risk", label: "Rà soát rủi ro", icon: ShieldAlert,
    prompt: "Rà soát rủi ro pháp lý của hợp đồng sau và đề xuất chỉnh sửa. Tập trung: điều khoản phạt vi phạm, bồi thường thiệt hại, chấm dứt/đơn phương chấm dứt, bảo mật, bất khả kháng, luật áp dụng & cơ quan giải quyết tranh chấp.\n\n[Dán nội dung hợp đồng hoặc đính kèm tệp]" },
  { key: "compare", label: "Đối chiếu điều khoản", icon: GitCompare,
    prompt: "So sánh và đối chiếu các điều khoản giữa hai hợp đồng/bản dự thảo sau. Chỉ ra điểm khác biệt, điều khoản bất lợi và khuyến nghị.\n\n[Dán điều khoản A]\n\n---\n\n[Dán điều khoản B]" },
  { key: "legal", label: "Đối chiếu luật", icon: Scale,
    prompt:
`Rà soát hợp đồng dưới đây và ĐỐI CHIẾU từng điều khoản với pháp luật Việt Nam hiện hành. Mỗi nhận định phải TRÍCH DẪN Điều/Khoản cụ thể của luật liên quan:
- Bộ luật Dân sự 2015 (91/2015/QH13): giao kết, điều kiện hiệu lực (Đ.117), hợp đồng vô hiệu, thực hiện hợp đồng, lãi suất (Đ.357, 468).
- Luật Thương mại 2005 (36/2005/QH11): mua bán hàng hóa, cung ứng dịch vụ; PHẠT vi phạm tối đa 8% giá trị nghĩa vụ vi phạm (Đ.301), bồi thường thiệt hại (Đ.302), quan hệ phạt–bồi thường (Đ.307), lãi chậm thanh toán (Đ.306), miễn trách/bất khả kháng (Đ.294).
- Luật Doanh nghiệp 2020 & Luật Đầu tư 2020: tư cách chủ thể, người đại diện theo pháp luật, ngành nghề kinh doanh.
- Bộ luật Lao động 2019 (nếu là HĐ lao động); Luật Xây dựng 2014/2020 (nếu là HĐ thi công); Luật SHTT; Luật Bảo vệ quyền lợi người tiêu dùng.
- Quy định hóa đơn – thuế: Nghị định 123/2020/NĐ-CP; thanh toán hóa đơn ≥ 20 triệu phải CHUYỂN KHOẢN để được khấu trừ thuế GTGT.

Trả về:
1. Điều khoản TRÁI luật / có nguy cơ VÔ HIỆU / khó thực thi — nêu lý do + căn cứ điều luật.
2. Điều khoản BẮT BUỘC còn THIẾU theo luật (vd: đối tượng, giá, phương thức giải quyết tranh chấp...).
3. Điều khoản BẤT LỢI cho bên ta + đề xuất chỉnh sửa câu chữ.
4. Kết luận mức độ rủi ro pháp lý: Cao / Trung bình / Thấp.

[Dán nội dung hợp đồng vào đây hoặc đính kèm tệp]` },
  { key: "draft", label: "Soạn thảo", icon: FilePlus2,
    prompt: "Soạn thảo dự thảo hợp đồng [đầu ra/đầu vào], loại [mua bán/dịch vụ/thuê...]. Thông tin:\n- Bên A (công ty ta): ...\n- Bên B (đối tác): ...\n- Đối tượng/phạm vi: ...\n- Giá trị & thuế: ...\n- Thời hạn: ...\n- Điều khoản thanh toán: ...\nTrả về dạng markdown đầy đủ điều, khoản theo chuẩn hợp đồng Việt Nam." },
] as const;

export function ContractsAssistant({ roleName, roleLevel, canManage, onCreateFromDraft }: {
  roleName: string | null;
  roleLevel: string | null;
  canManage?: boolean;
  onCreateFromDraft?: (prefill: ContractPrefill) => void;
}) {
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

  // Chọn agent: ưu tiên Pháp lý → Nhân sự → tên role của user → level → đầu DS.
  useEffect(() => {
    apiFetch<AgentOpt[]>("/api/ai/agents/company")
      .then(({ data }) => {
        const list = data ?? [];
        const find = (kw: string) => list.find((a) => a.displayName?.toLowerCase().includes(kw));
        const rn = (roleName ?? "").toLowerCase().trim();
        const match =
          find("pháp lý") ?? find("pháp") ?? find("legal") ??
          find("nhân sự") ?? find("hr") ??
          (rn ? list.find((a) => a.displayName?.toLowerCase().includes(rn)) : undefined) ??
          (roleLevel ? list.find((a) => a.level === roleLevel) : undefined) ??
          list[0];
        if (match) { setAgentId(match.agentId); setAgentName(match.displayName); }
      })
      .catch(() => {});
  }, [roleName, roleLevel]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // Đổi agent → nạp lịch sử session gần nhất.
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
      ? `${userText || "Phân tích hợp đồng đính kèm sau:"}\n\n--- Nội dung tệp "${attach.name}" ---\n${attach.text}`
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

  // Bóc tách bản thảo → mở form Tạo hợp đồng điền sẵn (người dùng xác nhận trước khi lưu).
  const createFromDraft = async (m: Msg) => {
    setActing(`mk_${m.id}`);
    try {
      const { data } = await apiSend<ContractPrefill>("/api/contracts/ai-extract", "POST", { draft: m.content });
      if (data) onCreateFromDraft?.(data);
    } catch (e) {
      showFlash(e instanceof Error ? e.message : "Lỗi bóc tách bản thảo", true);
    } finally { setActing(null); }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[calc(100vh-9rem)] min-h-[460px] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-purple-600/20 border border-purple-700/40 flex items-center justify-center flex-shrink-0">
          <Sparkles size={14} className="text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">Trợ lý Hợp đồng</div>
          {agentName && <div className="text-[10px] text-slate-500 truncate">{agentName}</div>}
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-300 border border-purple-700/40 flex-shrink-0">AI</span>
      </div>

      {flash && (
        <div className={`px-3 py-2 text-xs border-b ${flash.err ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-emerald-900/20 border-emerald-800/30 text-emerald-300"}`}>
          {flash.err ? "⚠ " : "✓ "}{flash.msg}
        </div>
      )}

      {/* Thao tác nhanh */}
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

      {/* Tin nhắn */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-500">
            <Bot size={28} className="text-purple-400/60" />
            <p className="text-xs max-w-xs">
              Trợ lý hỗ trợ <b>phân tích, soạn thảo, rà soát rủi ro</b> và <b>đối chiếu điều khoản</b> hợp đồng đầu vào / đầu ra.
              Bấm một thao tác nhanh, hoặc đính kèm tệp hợp đồng để phân tích.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div className={`max-w-[92%] rounded-xl px-3 py-2 text-xs ${m.role === "user" ? "bg-purple-700 text-white whitespace-pre-wrap" : "bg-slate-800 text-slate-100"}`}>
              {m.role === "assistant" ? <Markdown className="text-xs">{m.content}</Markdown> : m.content}
            </div>
            {m.role === "assistant" && m.content.length > 0 && (
              <div className="flex gap-1.5 mt-1">
                {canManage && (
                  <button onClick={() => createFromDraft(m)} disabled={acting !== null}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-cyan-300 bg-cyan-600/15 border border-cyan-700/40 hover:bg-cyan-600/30 disabled:opacity-50">
                    {acting === `mk_${m.id}` ? <Loader2 size={11} className="animate-spin" /> : <FileSignature size={11} />} Tạo hợp đồng
                  </button>
                )}
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

      {/* Tệp đính kèm */}
      {attach && (
        <div className="px-3 py-2 border-t border-slate-800 flex items-center gap-2 text-xs text-slate-300">
          <Paperclip size={12} className="text-purple-400" />
          <span className="flex-1 truncate">{attach.name}</span>
          <button onClick={() => setAttach(null)} className="text-slate-500 hover:text-red-400"><X size={13} /></button>
        </div>
      )}

      {/* Ô nhập */}
      <div className="p-3 border-t border-slate-800">
        <div className="flex gap-2 items-end">
          <button onClick={() => fileRef.current?.click()} disabled={extracting || loading} title="Đính kèm hợp đồng (.txt/.md/.csv hoặc ảnh scan)"
            className="px-2.5 h-[38px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg flex items-center disabled:opacity-50">
            {extracting ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
          </button>
          <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,image/*" className="hidden" onChange={(e) => onPickFile(e.target.files?.[0] ?? null)} />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Hỏi về hợp đồng, hoặc dán nội dung cần phân tích..."
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
