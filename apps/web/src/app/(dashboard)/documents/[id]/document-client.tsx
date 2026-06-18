"use client";

// src/app/(dashboard)/documents/[id]/document-client.tsx
// Trang xem/sửa tài liệu. Markdown: editor textarea + preview. Office: xem PDF (convert qua LibreOffice).

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Save, Download, Eye, Pencil, Bot } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { apiFetch, apiSend, useApi } from "@/lib/api/client";
import { DocumentAssistant } from "./document-assistant";

type FileType = "docx" | "xlsx" | "pptx" | "md";

interface DocDetail {
  id: string;
  name: string;
  fileType: FileType;
}

export function DocumentDetailClient({ id }: { id: string; userName: string }) {
  const { data: doc, loading, error } = useApi<DocDetail>(`/api/documents/${id}`);
  const [showAI, setShowAI] = useState(false);

  function download() {
    // Stream qua API (cùng origin) — cookies tự gửi, không lộ MinIO.
    window.open(`/api/documents/${id}/download`, "_blank");
  }

  if (loading) return <Centered><Loader2 className="animate-spin" /> Đang tải…</Centered>;
  if (error || !doc) return <Centered className="text-red-400">⚠ {error ?? "Không tìm thấy tài liệu"}</Centered>;

  return (
    <div>
      <PageHeader
        backHref="/documents"
        title={doc.name}
        subtitle={doc.fileType.toUpperCase()}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAI((v) => !v)}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
                showAI ? "bg-violet-600/20 text-violet-300 border-violet-500/40" : "text-slate-300 hover:text-white border-slate-700 hover:border-slate-500"
              }`}
            >
              <Bot size={15} /> Trợ lý AI
            </button>
            <button onClick={download} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg">
              <Download size={15} /> Tải về
            </button>
          </div>
        }
      />
      <div className="flex gap-4 items-stretch">
        <div className="flex-1 min-w-0">
          {doc.fileType === "md" ? <MarkdownEditor id={id} /> : <OfficeViewer id={id} />}
        </div>
        {showAI && (
          <div className="w-[400px] shrink-0 h-[80vh]">
            <DocumentAssistant docId={id} docName={doc.name} onClose={() => setShowAI(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Office viewer (xem PDF rendition; không sửa — tải về để sửa) ─────────────

function OfficeViewer({ id }: { id: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative h-[78vh] rounded-xl overflow-hidden border border-slate-800 bg-slate-100">
      {!loaded && (
        <Centered className="absolute inset-0 z-10 bg-slate-950">
          <Loader2 className="animate-spin" /> Đang dựng bản xem…
        </Centered>
      )}
      <iframe
        src={`/api/documents/${id}/preview`}
        title="Xem tài liệu"
        className="w-full h-full"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

// ─── Markdown editor ──────────────────────────────────────────────────────

function MarkdownEditor({ id }: { id: string }) {
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ content: string }>(`/api/documents/${id}/content`)
      .then(({ data }) => setContent(data?.content ?? ""))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function save() {
    setSaving(true); setError(null);
    try {
      await apiSend(`/api/documents/${id}/content`, "PUT", { content });
      setSavedAt(new Date().toLocaleTimeString("vi-VN"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi lưu");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Centered><Loader2 className="animate-spin" /> Đang tải nội dung…</Centered>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
          <ToggleBtn active={mode === "edit"} onClick={() => setMode("edit")} icon={Pencil} label="Soạn thảo" />
          <ToggleBtn active={mode === "preview"} onClick={() => setMode("preview")} icon={Eye} label="Xem trước" />
        </div>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs text-slate-500">Đã lưu {savedAt}</span>}
          {error && <span className="text-xs text-red-400">⚠ {error}</span>}
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Lưu
          </button>
        </div>
      </div>

      {mode === "edit" ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          className="w-full h-[68vh] px-4 py-3 rounded-xl text-sm font-mono bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 resize-none"
        />
      ) : (
        <div className="prose prose-invert max-w-none h-[68vh] overflow-y-auto px-5 py-4 rounded-xl bg-slate-900 border border-slate-800">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function ToggleBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${active ? "bg-cyan-600/20 text-cyan-300" : "text-slate-400 hover:text-white"}`}>
      <Icon size={13} /> {label}
    </button>
  );
}

function Centered({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex items-center justify-center gap-2 py-20 text-slate-400 text-sm ${className}`}>{children}</div>;
}
