"use client";

// src/app/(dashboard)/documents/documents-client.tsx
// Module Tài Liệu — 2 tab: Tài liệu công ty & Template (hệ thống + công ty).

import { useState } from "react";
import Link from "next/link";
import {
  FileStack, Upload, Trash2, Download, FileText, Sheet, Presentation,
  FileType as FileTypeIcon, Plus, Lock, Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { apiFetch, apiSend, useApi } from "@/lib/api/client";
import { UploadModal } from "./upload-modal";
import { CreateFromTemplateModal } from "./create-from-template-modal";
import { FolderPanel, type FolderNode, type Selection } from "./folder-panel";

type FileType = "docx" | "xlsx" | "pptx" | "md";

interface DocItem {
  id: string;
  name: string;
  fileType: FileType;
  updatedAt: string;
  template?: { id: string; name: string } | null;
  folder?: { id: string; name: string; type: string } | null;
}

interface TemplateItem {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  fileType: FileType;
  isSystem: boolean;
  companyId: string | null;
}

const TYPE_META: Record<FileType, { label: string; icon: React.ElementType; color: string }> = {
  docx: { label: "Word", icon: FileText, color: "text-blue-400" },
  xlsx: { label: "Excel", icon: Sheet, color: "text-emerald-400" },
  pptx: { label: "PowerPoint", icon: Presentation, color: "text-orange-400" },
  md:   { label: "Markdown", icon: FileTypeIcon, color: "text-slate-300" },
};

export function DocumentsClient({ canManage }: { canManage: boolean }) {
  const [tab, setTab] = useState<"documents" | "templates">("documents");
  const [uploadKind, setUploadKind] = useState<null | "document" | "template">(null);
  const [fromTemplate, setFromTemplate] = useState<TemplateItem | null>(null);
  // Thư mục đang chọn: "all" = tất cả, "none" = chưa phân loại, hoặc folderId.
  const [sel, setSel] = useState<Selection>("all");
  const [selNode, setSelNode] = useState<FolderNode | null>(null);

  const folders = useApi<FolderNode[]>(tab === "documents" ? "/api/folders" : null);
  const folderQuery = sel === "all" ? "" : `&folderId=${sel}`;
  const docs = useApi<DocItem[]>(tab === "documents" ? `/api/documents?limit=100${folderQuery}` : null);
  const templates = useApi<TemplateItem[]>(tab === "templates" ? "/api/documents/templates" : null);

  // folderId/tên để upload vào thư mục đang chọn (chỉ khi chọn 1 thư mục cụ thể).
  const targetFolderId = sel !== "all" && sel !== "none" ? sel : null;
  const targetFolderName = targetFolderId ? selNode?.name ?? null : null;

  async function download(path: string) {
    try {
      const { data } = await apiFetch<{ url: string }>(path);
      if (data?.url) window.open(data.url, "_blank");
    } catch {
      /* ignore */
    }
  }

  async function deleteDoc(id: string) {
    if (!confirm("Xóa tài liệu này?")) return;
    await apiSend(`/api/documents/${id}`, "DELETE").then(() => docs.refresh()).catch((e) => alert(e.message));
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Xóa template này?")) return;
    await apiSend(`/api/documents/templates/${id}`, "DELETE").then(() => templates.refresh()).catch((e) => alert(e.message));
  }

  return (
    <>
      <PageHeader
        icon={FileStack}
        title="Tài Liệu"
        subtitle="Quản lý tài liệu & template Word, Excel, PowerPoint, Markdown"
        actions={
          <button
            onClick={() => setUploadKind(tab === "templates" ? "template" : "document")}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
          >
            <Upload size={15} />
            {tab === "templates" ? "Tải lên template" : "Tải lên tài liệu"}
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-slate-800">
        {([["documents", "Tài liệu"], ["templates", "Template"]] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === v
                ? "border-cyan-500 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "documents" ? (
        <div className="flex gap-5 items-start">
          <FolderPanel
            folders={folders.data ?? []}
            selected={sel}
            onSelect={(s, node) => { setSel(s); setSelNode(node ?? null); }}
            onChanged={() => { folders.refresh(); docs.refresh(); }}
            canCompany={canManage}
          />
          <div className="flex-1 min-w-0">
            {targetFolderName && (
              <div className="mb-3 text-sm text-slate-400">
                Thư mục: <span className="text-cyan-300 font-medium">{targetFolderName}</span>
              </div>
            )}
            <DocList
              state={docs}
              onDownload={(id) => download(`/api/documents/${id}/download`)}
              onDelete={canManage ? deleteDoc : undefined}
            />
          </div>
        </div>
      ) : (
        <TemplateList
          state={templates}
          canManage={canManage}
          onDownload={(id) => download(`/api/documents/templates/${id}/download`)}
          onDelete={deleteTemplate}
          onUse={(t) => setFromTemplate(t)}
        />
      )}

      <UploadModal
        kind={uploadKind}
        folderId={uploadKind === "document" ? targetFolderId : null}
        folderName={uploadKind === "document" ? targetFolderName : null}
        onClose={() => setUploadKind(null)}
        onSuccess={() => {
          setUploadKind(null);
          if (tab === "templates") templates.refresh();
          else { docs.refresh(); folders.refresh(); }
        }}
      />

      <CreateFromTemplateModal
        template={fromTemplate}
        onClose={() => setFromTemplate(null)}
        onSuccess={() => {
          setFromTemplate(null);
          setTab("documents");
          docs.refresh();
        }}
      />
    </>
  );
}

// ─── Document list ─────────────────────────────────────────────────────────

function DocList({
  state, onDownload, onDelete,
}: {
  state: ReturnType<typeof useApi<DocItem[]>>;
  onDownload: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  if (state.loading) return <Centered><Loader2 className="animate-spin" /> Đang tải…</Centered>;
  if (state.error) return <Centered className="text-red-400">⚠ {state.error}</Centered>;
  const items = state.data ?? [];
  if (!items.length) return <Empty text="Chưa có tài liệu. Hãy tải lên hoặc tạo từ template." />;

  return (
    <div className="grid gap-2">
      {items.map((d) => {
        const meta = TYPE_META[d.fileType];
        const Icon = meta.icon;
        return (
          <div key={d.id} className="flex items-center gap-3 px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors">
            <Icon className={`w-6 h-6 shrink-0 ${meta.color}`} />
            <Link href={`/documents/${d.id}`} className="flex-1 min-w-0">
              <div className="text-white font-medium truncate hover:text-cyan-300">{d.name}</div>
              <div className="text-xs text-slate-500">{meta.label} · cập nhật {new Date(d.updatedAt).toLocaleDateString("vi-VN")}</div>
            </Link>
            <button onClick={() => onDownload(d.id)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg" title="Tải về">
              <Download size={16} />
            </button>
            {onDelete && (
              <button onClick={() => onDelete(d.id)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg" title="Xóa">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Template list ─────────────────────────────────────────────────────────

function TemplateList({
  state, canManage, onDownload, onDelete, onUse,
}: {
  state: ReturnType<typeof useApi<TemplateItem[]>>;
  canManage: boolean;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
  onUse: (t: TemplateItem) => void;
}) {
  if (state.loading) return <Centered><Loader2 className="animate-spin" /> Đang tải…</Centered>;
  if (state.error) return <Centered className="text-red-400">⚠ {state.error}</Centered>;
  const items = state.data ?? [];
  if (!items.length) return <Empty text="Chưa có template." />;

  return (
    <div className="grid gap-2">
      {items.map((t) => {
        const meta = TYPE_META[t.fileType];
        const Icon = meta.icon;
        const isSystem = t.isSystem || t.companyId === null;
        return (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors">
            <Icon className={`w-6 h-6 shrink-0 ${meta.color}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium truncate">{t.name}</span>
                {isSystem ? (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <Lock size={9} /> Hệ thống
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">Công ty</span>
                )}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {meta.label}{t.category ? ` · ${t.category}` : ""}{t.description ? ` · ${t.description}` : ""}
              </div>
            </div>
            <button onClick={() => onUse(t)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg" title="Tạo tài liệu từ template">
              <Plus size={13} /> Dùng
            </button>
            <button onClick={() => onDownload(t.id)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg" title="Tải về">
              <Download size={16} />
            </button>
            {/* Template hệ thống KHÔNG có nút xóa */}
            {canManage && !isSystem && (
              <button onClick={() => onDelete(t.id)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg" title="Xóa">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Centered({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex items-center justify-center gap-2 py-16 text-slate-400 text-sm ${className}`}>{children}</div>;
}
function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <FileStack className="w-10 h-10 text-slate-600 mb-3" />
      <p className="text-slate-400 text-sm">{text}</p>
    </div>
  );
}
