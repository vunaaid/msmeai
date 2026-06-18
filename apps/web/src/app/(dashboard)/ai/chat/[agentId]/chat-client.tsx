"use client";

// src/app/(dashboard)/ai/chat/[agentId]/chat-client.tsx
// Chat với AI agent — stream SSE từ POST /api/ai/agents/:agentId/chat

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bot, User, Send, ArrowLeft, Menu,
  Loader2, AlertCircle, Sparkles, Paperclip, Camera, X, FileText, ImageIcon,
} from "lucide-react";
import { useSidebarToggle } from "@/components/layout/dashboard-shell";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  attachmentName?: string;
}

interface AIChatClientProps {
  agentId: string;
  agentName: string;
  agentLevel: string;
  agentDepartment: string;
  initialSessionId: string | null;
  userId: string;
  companyName: string;
  aiMode: "full" | "assistant";
}

const LEVEL_COLORS: Record<string, string> = {
  board: "text-purple-400",
  c_suite: "text-blue-400",
  manager: "text-emerald-400",
  staff: "text-slate-400",
  special: "text-amber-400",
};

export function AIChatClient({
  agentId,
  agentName,
  agentLevel,
  agentDepartment,
  initialSessionId,
  aiMode,
}: AIChatClientProps) {
  const router = useRouter();
  const toggleSidebar = useSidebarToggle();
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const isImage = attachment?.type.startsWith("image/") ?? false;

  // Load lịch sử của session hiện tại
  useEffect(() => {
    if (!initialSessionId) return;
    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/ai/sessions/${initialSessionId}/messages`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          data?: Array<{ id: string; role: string; content: string; createdAt: string }>;
        };
        setMessages(
          (json.data ?? [])
            .filter((m) => ["user", "assistant"].includes(m.role))
            .map((m) => ({
              id: m.id,
              role: m.role as Message["role"],
              content: m.content,
              createdAt: m.createdAt,
            }))
        );
      } catch (err) {
        console.error("Failed to load messages:", err);
      }
    };
    void loadMessages();
  }, [initialSessionId]);

  // Cuộn xuống cuối khi có tin nhắn mới
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = useCallback(async () => {
    if ((!input.trim() && !attachment) || isLoading) return;

    const userMessage = input.trim();
    const file = attachment;
    setInput("");
    setAttachment(null);
    setError(null);
    setIsLoading(true);

    const tempId = `temp_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId, role: "user",
        content: userMessage || (file ? `Đã gửi tệp đính kèm.` : ""),
        attachmentName: file?.name,
        createdAt: new Date().toISOString(),
      },
    ]);

    // Bổ sung input ngoài text: trích nội dung tệp (OCR ảnh / đọc văn bản) rồi ghép vào prompt.
    let messageToSend = userMessage;
    if (file) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const exRes = await fetch("/api/ai/extract", { method: "POST", body: fd });
        const exJson = (await exRes.json()) as {
          data?: { filename: string; kind: string; text: string; truncated?: boolean };
          error?: { message?: string } | string;
        };
        if (!exRes.ok || !exJson.data) {
          const m = typeof exJson.error === "string" ? exJson.error : exJson.error?.message;
          throw new Error(m ?? "Không trích xuất được tệp");
        }
        const { filename, kind, text, truncated } = exJson.data;
        const label = kind === "image" ? "nội dung ảnh (OCR)" : "nội dung tệp";
        messageToSend =
          `[Đính kèm "${filename}" — ${label}${truncated ? ", đã rút gọn" : ""}]\n"""\n${text}\n"""\n\n` +
          (userMessage || "Hãy xử lý nội dung đính kèm ở trên theo đúng vai trò của bạn.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi đọc tệp đính kèm");
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setIsLoading(false);
        return;
      }
    }

    const assistantId = `asst_${Date.now()}`;
    let assistantAdded = false;
    let streamError: string | null = null;

    const handleEvent = (event: string, dataStr: string) => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(dataStr);
      } catch {
        return;
      }

      if (event === "session") {
        const sid = data["sessionId"] as string | undefined;
        if (sid && (data["isNew"] || !sessionId)) {
          setSessionId(sid);
          router.replace(`/ai/chat/${agentId}?session=${sid}`, { scroll: false });
        }
      } else if (event === "text") {
        const text = data["text"] as string | undefined;
        if (!text) return;
        if (!assistantAdded) {
          assistantAdded = true;
          setMessages((prev) => [
            ...prev,
            { id: assistantId, role: "assistant", content: text, createdAt: new Date().toISOString() },
          ]);
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + text } : m))
          );
        }
      } else if (event === "error") {
        const e = data["error"];
        streamError = typeof e === "string" ? e : "Lỗi khi xử lý yêu cầu";
      }
    };

    try {
      const res = await fetch(`/api/ai/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageToSend, sessionId: sessionId ?? undefined }),
      });

      if (!res.ok || !res.body) {
        let msg = "Lỗi khi gửi tin nhắn";
        try {
          const j = (await res.json()) as { error?: { message?: string } | string };
          msg = (typeof j.error === "string" ? j.error : j.error?.message) ?? msg;
        } catch {
          /* không phải JSON */
        }
        throw new Error(msg);
      }

      // Đọc SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          let event = "message";
          let dataLine = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
          }
          if (dataLine) handleEvent(event, dataLine);
        }
      }

      if (streamError) throw new Error(streamError);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Lỗi không xác định";
      setError(errMsg);
      // Bỏ tin nhắn tạm (user + assistant dở dang) khi lỗi
      setMessages((prev) => prev.filter((m) => m.id !== tempId && m.id !== assistantId));
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }, [input, attachment, isLoading, sessionId, agentId, router]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setAttachment(f); setError(null); }
    e.target.value = ""; // cho phép chọn lại cùng tệp
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-slate-700">
        <button
          onClick={toggleSidebar}
          aria-label="Menu"
          className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
        >
          <Menu width={18} height={18} className="w-[18px] h-[18px] shrink-0" />
        </button>
        <button
          onClick={() => router.back()}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center">
          <Bot size={20} className="text-purple-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-semibold truncate max-w-[60vw]">{agentName}</span>
            <span className={`text-xs font-medium ${LEVEL_COLORS[agentLevel] ?? "text-slate-400"}`}>
              {agentLevel.toUpperCase()}
            </span>
            {aiMode === "full" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/50 text-purple-300 border border-purple-800">
                <Sparkles size={10} className="inline mr-1" />
                FULL MODE
              </span>
            )}
          </div>
          <div className="text-slate-500 text-xs truncate">{agentDepartment}</div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center">
              <Bot size={32} className="text-purple-400" />
            </div>
            <div>
              <p className="text-white font-medium">{agentName}</p>
              <p className="text-slate-500 text-sm mt-1">Gõ câu hỏi để bắt đầu hội thoại</p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            {/* Avatar */}
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                msg.role === "user" ? "bg-blue-700" : "bg-slate-700"
              }`}
            >
              {msg.role === "user" ? (
                <User size={16} className="text-white" />
              ) : (
                <Bot size={16} className="text-purple-400" />
              )}
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-blue-700 text-white rounded-tr-sm"
                  : "bg-slate-800 text-slate-100 rounded-tl-sm"
              }`}
            >
              {msg.attachmentName && (
                <div className={`flex items-center gap-1.5 text-xs mb-1.5 ${msg.role === "user" ? "text-blue-200" : "text-slate-400"}`}>
                  <Paperclip size={12} />
                  <span className="truncate max-w-[200px]">{msg.attachmentName}</span>
                </div>
              )}
              {msg.content && (
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {msg.content}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center">
              <Bot size={16} className="text-purple-400" />
            </div>
            <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Đang xử lý...</span>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="pt-4 border-t border-slate-700">
        {/* Chip tệp đính kèm đang chờ gửi */}
        {attachment && (
          <div className="flex items-center gap-2 mb-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 w-fit max-w-full">
            {isImage ? <ImageIcon size={15} className="text-purple-400 shrink-0" /> : <FileText size={15} className="text-purple-400 shrink-0" />}
            <span className="text-sm text-slate-200 truncate max-w-[220px]">{attachment.name}</span>
            <span className="text-xs text-slate-500">{(attachment.size / 1024).toFixed(0)} KB</span>
            <button onClick={() => setAttachment(null)} className="text-slate-500 hover:text-red-400 ml-1" title="Bỏ tệp">
              <X size={15} />
            </button>
          </div>
        )}

        {/* Input ẩn: chọn tệp & chụp ảnh */}
        <input
          ref={fileInputRef} type="file" className="hidden" onChange={onPickFile}
          accept="image/*,.txt,.md,.csv,.json,.log"
        />
        <input
          ref={cameraInputRef} type="file" className="hidden" onChange={onPickFile}
          accept="image/*" capture="environment"
        />

        <div className="flex gap-2">
          <button
            onClick={() => cameraInputRef.current?.click()}
            disabled={isLoading}
            title="Chụp ảnh"
            className="px-3 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-xl transition-colors shrink-0"
          >
            <Camera size={18} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            title="Đính kèm tệp (ảnh / .txt / .md / .csv)"
            className="px-3 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-xl transition-colors shrink-0"
          >
            <Paperclip size={18} />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Hỏi ${agentName}...`}
            rows={1}
            className="flex-1 bg-slate-800 border border-slate-700 focus:border-purple-500 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm resize-none outline-none transition-colors"
            style={{ minHeight: "48px", maxHeight: "200px" }}
            disabled={isLoading}
          />
          <button
            onClick={() => void sendMessage()}
            disabled={(!input.trim() && !attachment) || isLoading}
            className="px-4 py-3 bg-purple-700 hover:bg-purple-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition-colors flex items-center gap-2 shrink-0"
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
        <p className="text-slate-600 text-xs mt-2 text-center">
          Enter để gửi • Shift+Enter để xuống dòng • 📎 đính kèm ảnh/tệp để bổ sung nội dung
        </p>
      </div>
    </div>
  );
}
