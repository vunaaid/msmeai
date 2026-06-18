"use client";

// src/app/(dashboard)/chat/add-members-modal.tsx
// Modal thêm thành viên vào một nhóm chat đã có.

import { useEffect, useState } from "react";
import { X, Loader2, Search, Check, UserPlus, Bot } from "lucide-react";
import { apiFetch, apiSend } from "@/lib/api/client";

interface Contact { id: string; name: string; avatarUrl: string | null; role: string | null; isAgent?: boolean; isAssistant?: boolean }

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(-2).join("").toUpperCase();
}

export function AddMembersModal({ conversationId, existingIds, onClose, onAdded }: {
  conversationId: string;
  existingIds: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [q, setQ]               = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [assistantLabel, setAssistantLabel] = useState("Trợ lý của tôi");
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  const existing = new Set(existingIds);

  useEffect(() => {
    Promise.all([
      apiFetch<Contact[]>("/api/chat/contacts"),
      apiFetch<{ agentUserId: string; roleName: string | null } | null>("/api/chat/assistant").catch(() => ({ data: null })),
    ])
      .then(([c, a]) => {
        setContacts(c.data ?? []);
        if (a.data?.agentUserId) {
          setAssistantId(a.data.agentUserId);
          setAssistantLabel(a.data.roleName ? `Trợ lý ${a.data.roleName}` : "Trợ lý của tôi");
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

  // Trợ lý theo vai trò — ghim đầu (chỉ khi chưa có trong nhóm)
  const assistantContact: Contact | null =
    assistantId && !existing.has(assistantId)
      ? { id: assistantId, name: assistantLabel, avatarUrl: null, role: null, isAgent: true, isAssistant: true }
      : null;

  const ql = q.toLowerCase();
  // Danh sách: bỏ người đã trong nhóm + bỏ agent trợ lý (đã ghim đầu) để không trùng
  const rest = contacts.filter(
    (c) => !existing.has(c.id) && c.id !== assistantId && c.name.toLowerCase().includes(ql),
  );
  const filtered =
    assistantContact && assistantContact.name.toLowerCase().includes(ql)
      ? [assistantContact, ...rest]
      : rest;

  const add = async () => {
    if (selected.size === 0) return;
    setSaving(true); setErr(null);
    try {
      await apiSend(`/api/chat/conversations/${conversationId}/participants`, "POST", {
        participantIds: [...selected],
      });
      onAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi thêm thành viên");
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
            <UserPlus size={18} className="text-cyan-400" />
            <span className="text-sm font-semibold text-white">Thêm thành viên</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={18} /></button>
        </div>

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
            <p className="text-center text-sm text-slate-500 py-8">Không còn người để thêm</p>
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
          <button onClick={add} disabled={selected.size === 0 || saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg flex-shrink-0">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Thêm
          </button>
        </div>
      </div>
    </div>
  );
}
