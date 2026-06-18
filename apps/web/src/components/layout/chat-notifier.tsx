"use client";

// src/components/layout/chat-notifier.tsx
// Lắng nghe SSE toàn app → hiện toast in-app khi có tin nhắn chat / thông báo hệ thống.
// (Web push lo trường hợp đóng tab; toast này lo khi user đang mở app nhưng ở trang khác.)

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessagesSquare, Bell, X } from "lucide-react";

interface Toast { id: number; title: string; body: string; url: string; kind: "chat" | "bell" }

export function ChatNotifier({ userId }: { userId: string }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pathname = usePathname();
  const router = useRouter();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const seq = useRef(0);

  const add = (t: Omit<Toast, "id">) => {
    const id = ++seq.current;
    setToasts((prev) => [...prev, { ...t, id }].slice(-4));
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 6000);
  };
  const dismiss = (id: number) => setToasts((prev) => prev.filter((x) => x.id !== id));

  useEffect(() => {
    const es = new EventSource("/api/chat/stream");

    es.addEventListener("chat:message", (e) => {
      try {
        const { conversationId, message } = JSON.parse((e as MessageEvent).data) as {
          conversationId: string; message: { userId: string; content: string; user?: { name?: string } };
        };
        if (message.userId === userId) return;             // tin của chính mình
        if (pathRef.current.startsWith("/chat")) return;    // đang ở trang chat → đã có badge/realtime
        add({
          kind: "chat",
          title: message.user?.name ?? "Tin nhắn mới",
          body: message.content,
          url: `/chat?c=${conversationId}`,
        });
      } catch { /* ignore */ }
    });

    es.addEventListener("notification", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as {
          title?: string; body?: string; data?: { url?: string };
        };
        add({ kind: "bell", title: d.title ?? "Thông báo", body: d.body ?? "", url: d.data?.url ?? "/notifications" });
      } catch { /* ignore */ }
    });

    return () => es.close();
  }, [userId]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => {
        const Icon = t.kind === "chat" ? MessagesSquare : Bell;
        return (
          <button
            key={t.id}
            onClick={() => { dismiss(t.id); router.push(t.url); }}
            className="group flex items-start gap-3 text-left bg-slate-800 border border-slate-700 hover:border-cyan-600 rounded-xl shadow-lg px-3.5 py-3 animate-in slide-in-from-right"
          >
            <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${t.kind === "chat" ? "bg-cyan-600/20 text-cyan-300" : "bg-amber-600/20 text-amber-300"}`}>
              <Icon size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{t.title}</div>
              <div className="text-xs text-slate-400 line-clamp-2 break-words">{t.body}</div>
            </div>
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}
              className="text-slate-600 hover:text-slate-300 flex-shrink-0"
            >
              <X size={14} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
