"use client";

// src/app/(dashboard)/ai/claude/claude-chat.tsx
// Giao diện chat với Claude qua /api/claude-cli/stream (SSE)

import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Send, Loader2, User, Zap, StopCircle, Settings, Menu } from "lucide-react";
import { useSidebarToggle } from "@/components/layout/dashboard-shell";

interface Message {
  role: "user" | "assistant";
  content: string;
  durationMs?: number;
  usage?: { outputTokens: number; totalCostUsd: number };
  streaming?: boolean;
}

const MODELS = [
  { id: "sonnet",  label: "Sonnet 4.6 (Mặc định)" },
  { id: "opus",    label: "Opus 4.7 (Mạnh nhất)" },
  { id: "haiku",   label: "Haiku 4.5 (Nhanh nhất)" },
];

export function ClaudeChat() {
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState("");
  const [model, setModel]             = useState("sonnet");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [isStreaming, setIsStreaming]  = useState(false);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const abortRef   = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toggleSidebar = useSidebarToggle();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || isStreaming) return;

    setInput("");
    setIsStreaming(true);

    // Thêm message người dùng
    setMessages(prev => [...prev, { role: "user", content: prompt }]);

    // Placeholder assistant message (streaming)
    setMessages(prev => [...prev, {
      role: "assistant",
      content: "",
      streaming: true,
    }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/claude-cli/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model, systemPrompt: systemPrompt || undefined }),
        signal: controller.signal,
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const eventBlock of events) {
          const lines = eventBlock.split("\n");
          let eventType = "message";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: "))  eventData = line.slice(6).trim();
          }

          if (!eventData) continue;

          let parsed: Record<string, unknown>;
          try { parsed = JSON.parse(eventData) as Record<string, unknown>; }
          catch { continue; }

          if (eventType === "text") {
            fullText += (parsed.text as string) ?? "";
            setMessages(prev => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = { ...last, content: fullText };
              }
              return next;
            });
          }

          if (eventType === "result") {
            setMessages(prev => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                const result = parsed as { durationMs?: number; usage?: { outputTokens?: number; totalCostUsd?: number } };
                next[next.length - 1] = {
                  ...last,
                  content: fullText,
                  streaming: false,
                  durationMs: result.durationMs,
                  usage: {
                    outputTokens: result.usage?.outputTokens ?? 0,
                    totalCostUsd: result.usage?.totalCostUsd ?? 0,
                  },
                };
              }
              return next;
            });
          }

          if (eventType === "error") {
            setMessages(prev => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  content: `❌ Lỗi: ${(parsed.error as string) ?? "Unknown error"}`,
                  streaming: false,
                };
              }
              return next;
            });
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && last.streaming) {
            next[next.length - 1] = { ...last, streaming: false, content: last.content + " [Đã dừng]" };
          }
          return next;
        });
      } else {
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: `❌ ${(err as Error).message}`, streaming: false };
          }
          return next;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, model, systemPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            aria-label="Menu"
            className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <Menu width={18} height={18} className="w-[18px] h-[18px] shrink-0" />
          </button>
          <div className="w-9 h-9 bg-purple-600/20 border border-purple-700/40 rounded-xl flex items-center justify-center">
            <Bot size={18} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              Claude AI
              <span className="text-xs font-normal text-purple-400 border border-purple-700/40 px-1.5 py-0.5 rounded">
                {MODELS.find(m => m.id === model)?.label.split(" ")[0]} {MODELS.find(m => m.id === model)?.label.split(" ")[1]}
              </span>
            </h1>
            <p className="text-xs text-slate-500">Powered by Claude CLI — dùng session đã đăng nhập</p>
          </div>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded-lg transition-colors ${showSettings ? "bg-slate-700 text-white" : "text-slate-500 hover:text-white hover:bg-slate-800"}`}
        >
          <Settings size={16} />
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="mt-3 p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center gap-4">
            <label className="text-xs text-slate-400 w-20 flex-shrink-0">Model</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-purple-500"
            >
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-start gap-4">
            <label className="text-xs text-slate-400 w-20 flex-shrink-0 pt-2">System</label>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder="System prompt tuỳ chỉnh (tuỳ chọn)..."
              rows={3}
              className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-600">
            <Bot size={40} className="mb-3 opacity-40" />
            <p className="text-sm">Bắt đầu cuộc trò chuyện với Claude</p>
            <p className="text-xs mt-1 text-slate-700">Shift+Enter xuống dòng · Enter gửi</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="w-7 h-7 bg-purple-600/20 border border-purple-700/30 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <Bot size={14} className="text-purple-400" />
              </div>
            )}

            <div className={`max-w-[85%] sm:max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-1`}>
              <div
                className={`px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-slate-800 text-slate-200 rounded-bl-sm"
                }`}
              >
                {msg.content}
                {msg.streaming && (
                  <span className="inline-block w-1.5 h-4 bg-purple-400 ml-1 animate-pulse rounded-sm align-middle" />
                )}
              </div>

              {/* Meta info */}
              {msg.role === "assistant" && !msg.streaming && msg.durationMs && (
                <div className="flex items-center gap-2 text-xs text-slate-600 px-1">
                  <Zap size={10} />
                  <span>{(msg.durationMs / 1000).toFixed(1)}s</span>
                  {msg.usage && (
                    <>
                      <span>·</span>
                      <span>{msg.usage.outputTokens} tokens</span>
                      <span>·</span>
                      <span>${msg.usage.totalCostUsd.toFixed(4)}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {msg.role === "user" && (
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <User size={14} className="text-white" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="pt-4 border-t border-slate-800">
        <div className="flex items-end gap-2 bg-slate-900 border border-slate-700 rounded-2xl p-2 focus-within:border-purple-600/60 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder="Nhắn gì đó với Claude... (Enter gửi, Shift+Enter xuống dòng)"
            rows={1}
            disabled={isStreaming}
            className="flex-1 bg-transparent text-slate-200 text-sm resize-none focus:outline-none px-3 py-2 min-h-[40px] max-h-[200px] placeholder-slate-600 disabled:opacity-50"
            style={{ height: "40px" }}
          />
          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="flex-shrink-0 p-2.5 rounded-xl bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
              title="Dừng"
            >
              <StopCircle size={18} />
            </button>
          ) : (
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim()}
              className="flex-shrink-0 p-2.5 rounded-xl bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Gửi (Enter)"
            >
              {isStreaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
