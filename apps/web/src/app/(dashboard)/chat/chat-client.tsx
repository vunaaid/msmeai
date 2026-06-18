"use client";

// src/app/(dashboard)/chat/chat-client.tsx
// Giao diện chat 2 cột: danh sách hội thoại + khung tin nhắn. Realtime qua SSE (/api/chat/stream).

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Plus, Send, MessagesSquare, ArrowLeft, Users, Bot, UserPlus, ClipboardList, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useApi, apiFetch, apiSend } from "@/lib/api/client";
import { NewConversationModal } from "./new-conversation-modal";
import { AddMembersModal } from "./add-members-modal";
import { Markdown } from "@/components/markdown";
import { TaskProposalModal, type Candidate, type PlanTask } from "@/components/task-proposal-modal";

interface Participant { id: string; name: string; avatarUrl: string | null; accountType?: string }
interface ChatMessage {
  id: string;
  conversationId: string;
  userId: string;
  content: string;
  createdAt: string;
  user: Participant;
}
interface Conversation {
  id: string;
  type: "direct" | "group";
  name: string;
  isAgent: boolean;
  isAssistant?: boolean;
  participants: Participant[];
  lastMessage: { id: string; content: string; createdAt: string; userId: string } | null;
  unreadCount: number;
  updatedAt: string;
}

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(-2).join("").toUpperCase();
}
function timeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export function ChatClient({ userId, userName }: { userId: string; userName: string }) {
  const searchParams = useSearchParams();
  const { data: conversations, loading, refresh } = useApi<Conversation[]>("/api/chat/conversations");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // Ai đang soạn trong hội thoại đang mở (vd AI agent đang trả lời)
  const [typing, setTyping] = useState<{ conversationId: string; name: string } | null>(null);
  // @mention trong nhóm: { query sau @, vị trí @ } + chỉ số đang chọn
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Nút thao tác trên tin của agent: tạo task / lưu tài liệu
  const [acting, setActing] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ msg: string; err?: boolean } | null>(null);
  const [proposal, setProposal] = useState<{ tasks: PlanTask[]; candidates: Candidate[] } | null>(null);
  const showFlash = (msg: string, err = false) => { setFlash({ msg, err }); setTimeout(() => setFlash(null), 3500); };

  const createTaskFromMsg = async (m: ChatMessage) => {
    setActing(`create_${m.id}`);
    try {
      const { data } = await apiSend<{ tasks: PlanTask[]; candidates: Candidate[] }>(
        "/api/ai/plan-tasks", "POST", { content: m.content },
      );
      if (!data?.tasks?.length) { showFlash("AI không tách được công việc nào", true); return; }
      setProposal({ tasks: data.tasks, candidates: data.candidates ?? [] });
    } catch (e) {
      showFlash(e instanceof Error ? e.message : "Lỗi phân tích", true);
    } finally { setActing(null); }
  };

  const saveDocFromMsg = async (m: ChatMessage) => {
    setActing(`save_${m.id}`);
    try {
      await apiSend("/api/ai/save-document", "POST", { content: m.content });
      showFlash("Đã lưu tài liệu (.md) vào mục Tài liệu");
    } catch (e) {
      showFlash(e instanceof Error ? e.message : "Lỗi lưu tài liệu", true);
    } finally { setActing(null); }
  };

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mở sẵn hội thoại từ query ?c=<id> (vd: bấm từ web push notification)
  useEffect(() => {
    const c = searchParams.get("c");
    if (c) setActiveId(c);
  }, [searchParams]);

  // Đảm bảo "Trợ lý của tôi" tồn tại & được ghim đầu danh sách (tạo nếu chưa có)
  const ensuredRef = useRef(false);
  useEffect(() => {
    if (ensuredRef.current) return;
    ensuredRef.current = true;
    apiFetch("/api/chat/assistant").then(() => refreshRef.current()).catch(() => {});
  }, []);

  // Thêm tin nhắn (dedupe theo id) — dùng chung cho cả POST response và SSE
  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  }, []);

  // Kết nối SSE 1 lần — nghe tin nhắn & hội thoại mới
  useEffect(() => {
    const es = new EventSource("/api/chat/stream");

    es.addEventListener("chat:message", (e) => {
      try {
        const { conversationId, message } = JSON.parse((e as MessageEvent).data) as {
          conversationId: string; message: ChatMessage;
        };
        if (conversationId === activeIdRef.current) {
          appendMessage(message);
          // tin của người này tới → tắt "đang soạn"
          setTyping((t) => (t && t.conversationId === conversationId ? null : t));
        }
        refreshRef.current(); // cập nhật danh sách (last message, unread, thứ tự)
      } catch { /* ignore */ }
    });
    es.addEventListener("chat:typing", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as {
          conversationId: string; name?: string; state: "start" | "stop";
        };
        if (d.conversationId !== activeIdRef.current) return;
        setTyping(d.state === "start" ? { conversationId: d.conversationId, name: d.name ?? "Đang soạn" } : null);
      } catch { /* ignore */ }
    });
    es.addEventListener("chat:conversation", () => refreshRef.current());

    return () => es.close();
  }, [appendMessage]);

  // Tắt "đang soạn" / mention khi đổi hội thoại
  useEffect(() => { setTyping(null); setMention(null); }, [activeId]);

  // Tải lịch sử khi đổi hội thoại + đánh dấu đã đọc
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    let cancelled = false;
    setLoadingMsgs(true);
    apiFetch<ChatMessage[]>(`/api/chat/conversations/${activeId}/messages`)
      .then((r) => { if (!cancelled) setMessages(r.data ?? []); })
      .catch(() => { if (!cancelled) setMessages([]); })
      .finally(() => { if (!cancelled) setLoadingMsgs(false); });

    // đánh dấu đã đọc → xóa badge unread
    apiSend(`/api/chat/conversations/${activeId}/read`, "POST").then(() => refreshRef.current()).catch(() => {});
    return () => { cancelled = true; };
  }, [activeId]);

  // Tự cuộn xuống cuối khi có tin mới / khi có "đang soạn"
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, typing]);

  const active = conversations?.find((c) => c.id === activeId) ?? null;

  // Ứng viên @mention = thành viên nhóm (trừ mình), lọc theo chữ sau @
  const mentionCands = mention && active
    ? active.participants
        .filter((p) => p.id !== userId && p.name.toLowerCase().includes(mention.query.toLowerCase()))
        .slice(0, 6)
    : [];

  // Theo dõi @ khi gõ (chỉ trong nhóm)
  const onInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (active?.type !== "group") { setMention(null); return; }
    const pos = e.target.selectionStart ?? val.length;
    const m = val.slice(0, pos).match(/(?:^|\s)@(\S*)$/);
    if (m) { setMention({ query: m[1] ?? "", start: pos - (m[1]?.length ?? 0) - 1 }); setMentionIdx(0); }
    else setMention(null);
  };

  // Chèn tên đã chọn, thay thế "@query" → "@Tên " (cho phép @ nhiều người liên tiếp)
  const applyMention = (name: string) => {
    if (!mention) return;
    const end = mention.start + 1 + mention.query.length;
    const caret = mention.start + name.length + 2;
    setInput(input.slice(0, mention.start) + `@${name} ` + input.slice(end));
    setMention(null);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) { el.focus(); el.setSelectionRange(caret, caret); }
    });
  };

  const send = async () => {
    const content = input.trim();
    if (!content || !activeId || sending) return;
    setSending(true);
    setInput("");
    try {
      const { data } = await apiSend<ChatMessage>(`/api/chat/conversations/${activeId}/messages`, "POST", { content });
      appendMessage(data);
      refreshRef.current();
    } catch {
      setInput(content); // trả lại nội dung nếu lỗi
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader icon={MessagesSquare} iconColor="text-cyan-400" title="Trò Chuyện"
        subtitle="Nhắn tin realtime với đồng nghiệp" />

      <div className="mt-5 flex h-[calc(100vh-220px)] min-h-[480px] bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {/* Cột trái: danh sách hội thoại */}
        <aside className={`w-full sm:w-72 flex-shrink-0 border-r border-slate-800 flex flex-col ${activeId ? "hidden sm:flex" : "flex"}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <span className="text-sm font-medium text-slate-300">Hội thoại</span>
            <button onClick={() => setModalOpen(true)} title="Trò chuyện mới"
              className="p-1.5 text-cyan-400 hover:text-white border border-cyan-700/50 hover:bg-cyan-600 hover:border-cyan-600 rounded-lg transition-colors">
              <Plus size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-cyan-500" /></div>
            ) : (conversations?.length ?? 0) === 0 ? (
              <p className="text-center text-sm text-slate-500 py-10 px-4">Chưa có hội thoại. Bấm + để bắt đầu.</p>
            ) : (
              conversations!.map((c) => (
                <button key={c.id} onClick={() => setActiveId(c.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-800/60 transition-colors ${
                    c.id === activeId ? "bg-slate-800/70" : "hover:bg-slate-800/40"
                  }`}>
                  <div className="relative flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-medium text-white ${c.isAgent ? "bg-indigo-600" : c.type === "group" ? "bg-purple-700" : "bg-cyan-700"}`}>
                      {c.isAgent ? <Bot size={17} /> : c.type === "group" ? <Users size={16} /> : initials(c.name)}
                    </div>
                    {c.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                        {c.unreadCount > 9 ? "9+" : c.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm truncate flex items-center gap-1.5 ${c.unreadCount > 0 ? "text-white font-medium" : "text-slate-200"}`}>
                        {c.name}
                        {c.isAssistant && <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-700/40 flex-shrink-0">Trợ lý của tôi</span>}
                      </span>
                      {c.lastMessage && <span className="text-[10px] text-slate-500 flex-shrink-0">{timeLabel(c.lastMessage.createdAt)}</span>}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {c.lastMessage
                        ? `${c.lastMessage.userId === userId ? "Bạn: " : ""}${c.lastMessage.content}`
                        : "Chưa có tin nhắn"}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Cột phải: khung tin nhắn */}
        <section className={`flex-1 flex-col min-w-0 ${activeId ? "flex" : "hidden sm:flex"}`}>
          {!active ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-3">
              <MessagesSquare size={40} className="opacity-40" />
              <p className="text-sm">Chọn một hội thoại để bắt đầu</p>
            </div>
          ) : (
            <>
              {/* Header hội thoại */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
                <button onClick={() => setActiveId(null)} className="sm:hidden text-slate-400 hover:text-white">
                  <ArrowLeft size={18} />
                </button>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium text-white ${active.isAgent ? "bg-indigo-600" : active.type === "group" ? "bg-purple-700" : "bg-cyan-700"}`}>
                  {active.isAgent ? <Bot size={16} /> : active.type === "group" ? <Users size={15} /> : initials(active.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-white truncate">{active.name}</span>
                    {active.isAgent && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-700/40">AI</span>}
                  </div>
                  {active.type === "group" ? (
                    <div className="text-xs text-slate-500 truncate">{active.participants.length} thành viên</div>
                  ) : active.isAgent ? (
                    <div className="text-xs text-slate-500 truncate">Trợ lý AI · tự động trả lời</div>
                  ) : null}
                </div>

                {/* Thêm thành viên — chỉ cho nhóm */}
                {active.type === "group" && (
                  <button onClick={() => setAddOpen(true)} title="Thêm thành viên"
                    className="ml-auto flex-shrink-0 p-1.5 text-cyan-400 hover:text-white border border-cyan-700/50 hover:bg-cyan-600 hover:border-cyan-600 rounded-lg transition-colors">
                    <UserPlus size={16} />
                  </button>
                )}
              </div>

              {/* Danh sách tin nhắn */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {loadingMsgs ? (
                  <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-cyan-500" /></div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-sm text-slate-500 py-10">Chưa có tin nhắn. Hãy gửi lời chào 👋</p>
                ) : (
                  messages.map((m, i) => {
                    const mine = m.userId === userId;
                    const isAgent = m.user?.accountType === "agent";
                    const showName = active.type === "group" && !mine && messages[i - 1]?.userId !== m.userId;
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                          {showName && <span className="text-[11px] text-slate-500 mb-0.5 px-1">{m.user.name}</span>}
                          <div className={`rounded-2xl px-3.5 py-2 text-sm break-words ${
                            mine ? "bg-cyan-600 text-white rounded-br-sm" : "bg-slate-800 text-slate-100 rounded-bl-sm"
                          }`}>
                            <Markdown>{m.content}</Markdown>
                          </div>
                          {/* Nút thao tác cho tin của AI agent */}
                          {isAgent && m.content.length > 0 && (
                            <div className="flex gap-1.5 mt-1">
                              <button onClick={() => createTaskFromMsg(m)} disabled={acting !== null}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-cyan-300 bg-cyan-600/15 border border-cyan-700/40 hover:bg-cyan-600/30 disabled:opacity-50">
                                {acting === `create_${m.id}` ? <Loader2 size={11} className="animate-spin" /> : <ClipboardList size={11} />} Tạo task
                              </button>
                              <button onClick={() => saveDocFromMsg(m)} disabled={acting !== null}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-emerald-300 bg-emerald-600/15 border border-emerald-700/40 hover:bg-emerald-600/30 disabled:opacity-50">
                                {acting === `save_${m.id}` ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Lưu tài liệu
                              </button>
                            </div>
                          )}
                          <span className="text-[10px] text-slate-600 mt-0.5 px-1">{timeLabel(m.createdAt)}</span>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* "Đang soạn..." (vd AI agent đang trả lời) */}
                {typing && typing.conversationId === activeId && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 bg-slate-800 text-slate-300 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
                      <span className="text-xs text-slate-400">{typing.name}</span>
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" />
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Ô nhập */}
              <div className="border-t border-slate-800 p-3 flex items-end gap-2 relative">
                {/* Gợi ý @mention (trong nhóm) */}
                {mention && mentionCands.length > 0 && (
                  <div className="absolute bottom-full left-3 mb-1 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-10">
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-700/60">Nhắc tới</div>
                    {mentionCands.map((p, i) => {
                      const isAgentP = p.name.toLowerCase().startsWith("ai ");
                      return (
                        <button key={p.id}
                          onMouseDown={(e) => { e.preventDefault(); applyMention(p.name); }}
                          onMouseEnter={() => setMentionIdx(i)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left ${i === mentionIdx ? "bg-slate-700/70" : "hover:bg-slate-700/40"}`}>
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0 ${isAgentP ? "bg-indigo-600" : "bg-cyan-700"}`}>
                            {isAgentP ? <Bot size={13} /> : p.name.trim().split(/\s+/).map((w) => w[0]).slice(-2).join("").toUpperCase()}
                          </span>
                          <span className="text-sm text-slate-200 truncate">{p.name}</span>
                          {isAgentP && <span className="ml-auto text-[9px] px-1 py-0.5 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-700/40">AI</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={onInputChange}
                  onKeyDown={(e) => {
                    if (mention && mentionCands.length > 0) {
                      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => Math.min(i + 1, mentionCands.length - 1)); return; }
                      if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIdx((i) => Math.max(i - 1, 0)); return; }
                      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applyMention(mentionCands[Math.min(mentionIdx, mentionCands.length - 1)]!.name); return; }
                      if (e.key === "Escape")    { e.preventDefault(); setMention(null); return; }
                    }
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                  rows={1}
                  placeholder={active.type === "group" ? "Nhập tin nhắn... (gõ @ để nhắc tới)" : "Nhập tin nhắn... (Enter để gửi)"}
                  className="flex-1 resize-none bg-slate-800 border border-slate-700 focus:border-cyan-500 text-white placeholder-slate-500 rounded-xl px-3.5 py-2.5 text-sm outline-none max-h-32"
                />
                <button onClick={send} disabled={!input.trim() || sending}
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl">
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Flash toast cho nút Tạo task / Lưu tài liệu */}
      {flash && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg text-sm shadow-xl border ${
          flash.err ? "bg-red-900/90 border-red-700 text-red-100" : "bg-emerald-900/90 border-emerald-700 text-emerald-100"
        }`}>
          {flash.err ? "⚠ " : "✓ "}{flash.msg}
        </div>
      )}

      {proposal && (
        <TaskProposalModal
          tasks={proposal.tasks}
          candidates={proposal.candidates}
          onClose={() => setProposal(null)}
          onDone={(count) => { setProposal(null); showFlash(`Đã giao ${count} công việc`); }}
        />
      )}

      {modalOpen && (
        <NewConversationModal
          onClose={() => setModalOpen(false)}
          onCreated={(id) => { setModalOpen(false); refresh(); setActiveId(id); }}
        />
      )}

      {addOpen && active?.type === "group" && (
        <AddMembersModal
          conversationId={active.id}
          existingIds={active.participants.map((p) => p.id)}
          onClose={() => setAddOpen(false)}
          onAdded={() => { setAddOpen(false); refresh(); }}
        />
      )}
    </div>
  );
}
