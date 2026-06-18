"use client";

// src/app/(dashboard)/chat/new-conversation-modal.tsx
// Modal tạo hội thoại: chọn 1 người (trực tiếp) hoặc nhiều người + đặt tên (nhóm).

import { useEffect, useState } from "react";
import { X, Loader2, Search, Check, Users, User, Bot } from "lucide-react";
import { apiFetch, apiSend } from "@/lib/api/client";

interface Contact { id: string; name: string; avatarUrl: string | null; role: string | null; isAgent?: boolean; isAssistant?: boolean }

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(-2).join("").toUpperCase();
}

export function NewConversationModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [q, setQ]               = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assistantId, setAssistantId] = useState<string | null>(null);
  // Nhãn trợ lý theo vai trò của tài khoản, vd "Trợ lý Chủ tịch HĐQT"
  const [assistantLabel, setAssistantLabel] = useState("Trợ lý của tôi");
  const [title, setTitle]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<Contact[]>("/api/chat/contacts"),
      apiFetch<{ agentUserId: string; roleName: string | null } | null>("/api/chat/assistant").catch(() => ({ data: null })),
    ])
      .then(([c, a]) => {
        setContacts(c.data ?? []);
        // Mặc định có Trợ lý theo role, ghim đầu danh sách
        if (a.data?.agentUserId) {
          setAssistantId(a.data.agentUserId);
          setAssistantLabel(a.data.roleName ? `Trợ lý ${a.data.roleName}` : "Trợ lý của tôi");
          setSelected(new Set([a.data.agentUserId]));
        }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Lỗi tải danh bạ"))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const isGroup = selected.size > 1;

  // Mục "Trợ lý <vai trò>" — dòng riêng ghim đầu, trỏ tới agent được resolve.
  const assistantContact: Contact | null = assistantId
    ? { id: assistantId, name: assistantLabel, avatarUrl: null, role: null, isAgent: true, isAssistant: true }
    : null;

  const ql = q.toLowerCase();
  // Phần còn lại: loại agent trợ lý ra để không bị trùng (nó đã ở dòng ghim đầu).
  const rest = contacts.filter((c) => c.id !== assistantId && c.name.toLowerCase().includes(ql));
  const filtered =
    assistantContact && assistantContact.name.toLowerCase().includes(ql)
      ? [assistantContact, ...rest]
      : rest;

  const create = async () => {
    if (selected.size === 0) return;
    if (isGroup && !title.trim()) { setErr("Nhập tên nhóm"); return; }
    setSaving(true); setErr(null);
    try {
      const { data } = await apiSend<{ id: string }>("/api/chat/conversations", "POST", {
        type: isGroup ? "group" : "direct",
        participantIds: [...selected],
        ...(isGroup ? { title: title.trim() } : {}),
      });
      onCreated(data.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi tạo hội thoại");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            {isGroup ? <Users size={18} className="text-cyan-400" /> : <User size={18} className="text-cyan-400" />}
            <span className="text-sm font-semibold text-white">
              {isGroup ? "Tạo nhóm chat" : "Trò chuyện mới"}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={18} /></button>
        </div>

        {/* Tên nhóm (khi chọn ≥2 người) */}
        {isGroup && (
          <div className="px-5 pt-4">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tên nhóm..."
              className="w-full bg-slate-800 border border-slate-700 focus:border-cyan-500 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm outline-none" />
          </div>
        )}

        {/* Tìm kiếm */}
        <div className="px-5 pt-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm người..."
              className="w-full bg-slate-800 border border-slate-700 focus:border-cyan-500 text-white placeholder-slate-500 rounded-lg pl-9 pr-3 py-2 text-sm outline-none" />
          </div>
        </div>

        {/* Danh sách */}
        <div className="flex-1 overflow-y-auto px-3 py-3 mt-1">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-cyan-500" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">Không có người dùng</p>
          ) : (
            filtered.map((c) => {
              const on = selected.has(c.id);
              return (
                <button key={c.id} onClick={() => toggle(c.id)}
                  className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors ${on ? "bg-cyan-600/15" : "hover:bg-slate-800"}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium text-white flex-shrink-0 ${c.isAgent ? "bg-indigo-600" : "bg-cyan-700"}`}>
                    {c.isAgent ? <Bot size={16} /> : initials(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-slate-200 truncate">{c.name}</span>
                      {c.isAgent && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-700/40 flex-shrink-0">AI</span>}
                    </div>
                    {c.isAssistant
                      ? <div className="text-xs text-indigo-400 truncate">Trợ lý của tôi · mặc định</div>
                      : c.role && <div className="text-xs text-slate-500 truncate">{c.role}</div>}
                  </div>
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${on ? "bg-cyan-500 border-cyan-500" : "border-slate-600"}`}>
                    {on && <Check size={13} className="text-white" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-between gap-3">
          {err ? <span className="text-xs text-red-400 truncate">{err}</span> : <span className="text-xs text-slate-500">{selected.size} đã chọn</span>}
          <button onClick={create} disabled={selected.size === 0 || saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg flex-shrink-0">
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {isGroup ? "Tạo nhóm" : "Bắt đầu"}
          </button>
        </div>
      </div>
    </div>
  );
}
