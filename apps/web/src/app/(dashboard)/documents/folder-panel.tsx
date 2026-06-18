"use client";

// src/app/(dashboard)/documents/folder-panel.tsx
// Cây thư mục ảo (sidebar) cho module Tài Liệu.
//  - Thư mục công ty (share toàn công ty) + thư mục cá nhân (chỉ mình xem).
//  - Chọn thư mục để lọc tài liệu; tạo/đổi tên/xóa thư mục con.

import { useState } from "react";
import {
  Folder, FolderOpen, FolderPlus, Users, Lock, ChevronRight, ChevronDown,
  Files, Inbox, X, Loader2, Pencil, Trash2,
} from "lucide-react";
import { apiSend } from "@/lib/api/client";

export interface FolderNode {
  id: string;
  name: string;
  type: "company" | "personal";
  ownerId: string | null;
  parentId: string | null;
  moduleKey: string | null;
  isRoot: boolean;
  docCount: number;
}

// Module để gắn nhãn thư mục (tùy chọn).
const MODULES: { key: string; label: string }[] = [
  { key: "gl", label: "Sổ cái" }, { key: "invoice", label: "Hóa đơn" },
  { key: "ar", label: "Phải thu" }, { key: "ap", label: "Phải trả" },
  { key: "cash", label: "Tiền mặt" }, { key: "sales", label: "Bán hàng" },
  { key: "inventory", label: "Kho" }, { key: "hr", label: "Nhân sự" },
  { key: "assets", label: "Tài sản" }, { key: "tax", label: "Thuế" },
  { key: "reports", label: "Báo cáo" }, { key: "contracts", label: "Hợp đồng" },
  { key: "work", label: "Công việc" }, { key: "admin", label: "Quản trị" },
];
const moduleLabel = (k: string | null) => MODULES.find((m) => m.key === k)?.label ?? k;

export type Selection = "all" | "none" | string; // "all" = tất cả, "none" = chưa phân loại, hoặc folderId

export function FolderPanel({
  folders, selected, onSelect, onChanged, canCompany,
}: {
  folders: FolderNode[];
  selected: Selection;
  onSelect: (sel: Selection, node?: FolderNode) => void;
  onChanged: () => void;
  canCompany: boolean; // có quyền tạo/sửa thư mục công ty không
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [createUnder, setCreateUnder] = useState<FolderNode | null>(null);

  const childrenOf = (pid: string | null, type: "company" | "personal") =>
    folders.filter((f) => f.parentId === pid && f.type === type).sort((a, b) => a.name.localeCompare(b.name));

  const companyRoot = folders.find((f) => f.type === "company" && f.isRoot);
  const personalRoot = folders.find((f) => f.type === "personal" && f.isRoot);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function rename(node: FolderNode) {
    const name = prompt("Tên thư mục mới:", node.name)?.trim();
    if (!name || name === node.name) return;
    await apiSend(`/api/folders/${node.id}`, "PATCH", { name }).then(onChanged).catch((e) => alert(e.message));
  }
  async function remove(node: FolderNode) {
    if (!confirm(`Xóa thư mục "${node.name}"? (phải rỗng)`)) return;
    await apiSend(`/api/folders/${node.id}`, "DELETE").then(onChanged).catch((e) => alert(e.message));
  }

  function renderTree(node: FolderNode, depth: number) {
    const kids = childrenOf(node.id, node.type);
    const isOpen = expanded.has(node.id) || node.isRoot;
    const isSel = selected === node.id;
    return (
      <div key={node.id}>
        <div
          className={`group flex items-center gap-1 pr-1.5 py-1.5 rounded-lg cursor-pointer ${
            isSel ? "bg-cyan-500/15 text-cyan-200" : "text-slate-300 hover:bg-slate-800/70"
          }`}
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
          onClick={() => onSelect(node.id, node)}
        >
          {kids.length > 0 ? (
            <button onClick={(e) => { e.stopPropagation(); toggle(node.id); }} className="p-0.5 text-slate-500 hover:text-white">
              {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <span className="w-[18px]" />
          )}
          {isSel ? <FolderOpen size={15} className="shrink-0 text-cyan-300" /> : <Folder size={15} className="shrink-0 text-slate-400" />}
          <span className="flex-1 min-w-0 truncate text-sm">{node.name}</span>
          {node.moduleKey && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-slate-700/70 text-slate-300 shrink-0">{moduleLabel(node.moduleKey)}</span>
          )}
          {node.docCount > 0 && <span className="text-[10px] text-slate-500 shrink-0">{node.docCount}</span>}
          {/* Hành động (hiện khi hover) — chỉ thư mục thao tác được */}
          {(node.type === "personal" || canCompany) && (
            <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
              <button onClick={(e) => { e.stopPropagation(); setCreateUnder(node); }} title="Tạo thư mục con" className="p-0.5 text-slate-500 hover:text-cyan-300"><FolderPlus size={13} /></button>
              {!node.isRoot && <button onClick={(e) => { e.stopPropagation(); rename(node); }} title="Đổi tên" className="p-0.5 text-slate-500 hover:text-white"><Pencil size={12} /></button>}
              {!node.isRoot && <button onClick={(e) => { e.stopPropagation(); remove(node); }} title="Xóa" className="p-0.5 text-slate-500 hover:text-red-400"><Trash2 size={12} /></button>}
            </span>
          )}
        </div>
        {isOpen && kids.map((k) => renderTree(k, depth + 1))}
      </div>
    );
  }

  return (
    <aside className="w-60 shrink-0 space-y-1">
      {/* Bộ lọc nhanh */}
      <QuickItem icon={Files} label="Tất cả tài liệu" active={selected === "all"} onClick={() => onSelect("all")} />
      <QuickItem icon={Inbox} label="Chưa phân loại" active={selected === "none"} onClick={() => onSelect("none")} />

      {/* Thư mục công ty */}
      <div className="pt-3 pb-1 px-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
        <Users size={12} /> Thư mục công ty
      </div>
      {companyRoot ? renderTree(companyRoot, 0) : <p className="px-2 text-xs text-slate-600">…</p>}

      {/* Thư mục cá nhân */}
      <div className="pt-3 pb-1 px-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
        <Lock size={12} /> Thư mục cá nhân
      </div>
      {personalRoot ? renderTree(personalRoot, 0) : <p className="px-2 text-xs text-slate-600">…</p>}

      {createUnder && (
        <CreateFolderModal
          parent={createUnder}
          onClose={() => setCreateUnder(null)}
          onSuccess={() => { setCreateUnder(null); onChanged(); }}
        />
      )}
    </aside>
  );
}

function QuickItem({ icon: Icon, label, active, onClick }: { icon: React.ElementType; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm ${active ? "bg-cyan-500/15 text-cyan-200" : "text-slate-300 hover:bg-slate-800/70"}`}>
      <Icon size={15} className="shrink-0" /> {label}
    </button>
  );
}

function CreateFolderModal({ parent, onClose, onSuccess }: { parent: FolderNode; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [moduleKey, setModuleKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Nhập tên thư mục"); return; }
    setBusy(true); setError(null);
    try {
      await apiSend("/api/folders", "POST", {
        name: name.trim(), type: parent.type, parentId: parent.id,
        moduleKey: moduleKey || null,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white">
            <FolderPlus size={16} className="text-cyan-400" />
            <h2 className="text-sm font-semibold">Thư mục con trong “{parent.name}”</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X size={15} /></button>
        </div>
        <form onSubmit={submit} className="px-5 py-4 space-y-3.5">
          {error && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">⚠ {error}</div>}
          <div className="text-xs text-slate-400">
            Loại: {parent.type === "company" ? <span className="text-cyan-300">Công ty (chia sẻ)</span> : <span className="text-amber-300">Cá nhân (riêng tư)</span>}
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Tên thư mục</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Hợp đồng 2026"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Gắn module (tùy chọn)</label>
            <select value={moduleKey} onChange={(e) => setModuleKey(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
              <option value="">— Không —</option>
              {MODULES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg disabled:opacity-50">Hủy</button>
            <button type="submit" disabled={busy || !name.trim()} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Đang tạo…</> : "Tạo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
