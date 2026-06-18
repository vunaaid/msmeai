"use client";

// src/app/(dashboard)/notes/notes-client.tsx
// Trang Ghi Chép — ghi chép theo ngày (nhiều note/ngày), block text/todo/voice,
// ghi âm + bóc nội dung (Whisper), tạo công việc từ block.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  NotebookPen, Plus, ChevronLeft, ChevronRight, Trash2, Type, CheckSquare,
  Loader2, ClipboardList, CheckCircle2, Mic, Play, RotateCw, AlertCircle,
  Sparkles, Check, X, Volume2, Square, Clock,
} from "lucide-react";
import { useApi, apiSend, apiFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/page-header";
import { VoiceRecorder } from "./voice-recorder";
import { ImageOcr } from "./image-ocr";
import { ToWorkModal } from "./to-work-modal";

type BlockType = "text" | "todo" | "voice";
type TranscriptStatus = "pending" | "processing" | "done" | "failed" | null;
// Trợ lý tóm tắt: AI trả về toàn văn đã chỉnh (cleaned) + bản tách theo đoạn (paragraphs).
interface AssistResult { cleaned: string; paragraphs: string[] }

interface NoteBlock {
  id: string;
  type: BlockType;
  position: number;
  text: string | null;
  checked: boolean;
  audioDuration: number | null;
  transcriptStatus: TranscriptStatus;
  transcriptProgress: number | null;
  workItemId: string | null;
}
interface Note {
  id: string;
  noteDate: string;
  title: string | null;
  content: string | null;
  blocks: NoteBlock[];
}
interface RecentNote {
  id: string;
  noteDate: string;
  title: string | null;
  preview: string | null;
  blockCount: number;
}

interface Props {
  userName: string;
  canAssign: boolean;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

function shiftDate(d: string, days: number): string {
  const dt = new Date(`${d}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function formatVNDate(d: string): string {
  const dt = new Date(`${d}T00:00:00.000Z`);
  const weekday = ["Chủ nhật","Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6","Thứ 7"][dt.getUTCDay()];
  return `${weekday}, ${dt.getUTCDate()}/${dt.getUTCMonth() + 1}/${dt.getUTCFullYear()}`;
}

export function NotesClient({ userName, canAssign }: Props) {
  const [date, setDate] = useState(todayStr());
  const { data: notes, loading, refresh } = useApi<Note[]>(`/api/notes?date=${date}`);
  const { data: recent, refresh: refreshRecent } = useApi<RecentNote[]>(`/api/notes?recent=30`);
  const [toWork, setToWork] = useState<{ blockId: string; title: string } | null>(null);
  const [creating, setCreating] = useState(false);

  // Làm mới cả danh sách theo ngày lẫn danh sách gần nhất (tiêu đề/preview có thể đổi).
  const refreshAll = () => { refresh(); refreshRecent(); };

  // Poll khi còn voice block đang bóc nội dung
  const hasProcessing = useMemo(
    () => (notes ?? []).some(n =>
      n.blocks.some(b => b.transcriptStatus === "pending" || b.transcriptStatus === "processing")),
    [notes],
  );
  useEffect(() => {
    if (!hasProcessing) return;
    const id = setInterval(() => refresh(), 4000);
    return () => clearInterval(id);
  }, [hasProcessing, refresh]);

  const createNote = async () => {
    setCreating(true);
    try {
      await apiSend("/api/notes", "POST", { noteDate: date, title: "" });
      refreshAll();
    } finally {
      setCreating(false);
    }
  };

  const isToday = date === todayStr();

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header dùng chung — đồng bộ với các trang khác (PageHeader đã có chuông) */}
      <PageHeader
        icon={NotebookPen}
        iconColor="text-amber-400"
        title="Ghi Chép"
        subtitle={`Ghi chép theo ngày của ${userName}`}
      />

      {/* 2 cột: danh sách ghi chép (trái) + chức năng ghi chép theo ngày (phải) */}
      <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
        {/* TRÁI: danh sách ghi chép gần nhất */}
        <NotesListPanel notes={recent} activeDate={date} onPick={setDate} />

        {/* PHẢI: chức năng ghi chép hiện tại */}
        <div className="flex-1 min-w-0">
          {/* Thanh chọn ngày */}
          <div className="flex items-center justify-between gap-3 mb-5 p-2 bg-slate-900/60 border border-slate-800 rounded-xl">
            <button
              onClick={() => setDate(d => shiftDate(d, -1))}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
              aria-label="Ngày trước"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-white">{formatVNDate(date)}</span>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value || todayStr())}
                className="px-2 py-1 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
              {!isToday && (
                <button onClick={() => setDate(todayStr())} className="text-xs text-amber-400 hover:text-amber-300">
                  Hôm nay
                </button>
              )}
            </div>
            <button
              onClick={() => setDate(d => shiftDate(d, 1))}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
              aria-label="Ngày sau"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Danh sách note theo ngày — luôn bọc khung, kể cả khi chưa có dữ liệu */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 sm:p-4 min-h-[220px]">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : (notes && notes.length > 0) ? (
              <div className="space-y-4">
                {notes.map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    canAssign={canAssign}
                    onChanged={refreshAll}
                    onCreateWork={(blockId, title) => setToWork({ blockId, title })}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                <NotebookPen size={32} className="mb-3 opacity-40" />
                <p className="text-sm">Chưa có ghi chép nào cho ngày này.</p>
              </div>
            )}
          </div>

          {/* Nút tạo note */}
          <button
            onClick={createNote}
            disabled={creating}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 text-sm font-medium border border-dashed border-slate-700 hover:border-amber-500/60 text-slate-400 hover:text-amber-300 rounded-xl transition-colors disabled:opacity-50"
          >
            {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Tạo ghi chép mới
          </button>
        </div>
      </div>

      <ToWorkModal
        blockId={toWork?.blockId ?? null}
        defaultTitle={toWork?.title ?? ""}
        canAssign={canAssign}
        onClose={() => setToWork(null)}
        onSuccess={refreshAll}
      />
    </div>
  );
}

// ─── Cột trái: danh sách ghi chép gần nhất (mọi ngày) ─────────────────────────────

function NotesListPanel({
  notes, activeDate, onPick,
}: {
  notes: RecentNote[] | null;
  activeDate: string;
  onPick: (date: string) => void;
}) {
  const shortDate = (d: string) => {
    const dt = new Date(`${d}T00:00:00.000Z`);
    const wd = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][dt.getUTCDay()];
    return `${wd} ${dt.getUTCDate()}/${dt.getUTCMonth() + 1}/${String(dt.getUTCFullYear()).slice(2)}`;
  };
  return (
    <aside className="w-full lg:w-64 flex-shrink-0">
      <div className="flex items-center gap-1.5 mb-2 px-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
        <Clock size={13} className="text-amber-400" /> Ghi chép gần nhất
      </div>
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl divide-y divide-slate-800/60 overflow-hidden max-h-[70vh] overflow-y-auto">
        {!notes ? (
          <div className="flex items-center justify-center py-10 text-slate-600">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : notes.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-slate-600">Chưa có ghi chép nào</div>
        ) : (
          notes.map((n) => {
            const active = n.noteDate === activeDate;
            const label = n.title?.trim() || n.preview?.trim() || "(trống)";
            return (
              <button
                key={n.id}
                onClick={() => onPick(n.noteDate)}
                title={label}
                className={`w-full text-left px-3 py-2.5 transition-colors ${
                  active ? "bg-amber-500/10 border-l-2 border-amber-500" : "hover:bg-slate-800/50 border-l-2 border-transparent"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[11px] font-medium ${active ? "text-amber-300" : "text-slate-400"}`}>{shortDate(n.noteDate)}</span>
                  <span className="text-[10px] text-slate-600">{n.blockCount} mục</span>
                </div>
                <p className="text-xs text-slate-200 mt-0.5 line-clamp-2 break-words">{label}</p>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

// ─── Note card ─────────────────────────────────────────────────────────────────

function NoteCard({
  note, canAssign, onChanged, onCreateWork,
}: {
  note: Note;
  canAssign: boolean;
  onChanged: () => void;
  onCreateWork: (blockId: string, title: string) => void;
}) {
  const saveTitle = async (title: string) => {
    if (title === (note.title ?? "")) return;
    await apiSend(`/api/notes/${note.id}`, "PUT", { title });
  };
  const deleteNote = async () => {
    if (!confirm("Xóa ghi chép này (kèm toàn bộ nội dung & ghi âm)?")) return;
    await apiSend(`/api/notes/${note.id}`, "DELETE");
    onChanged();
  };
  const addBlock = async (type: BlockType) => {
    await apiSend(`/api/notes/${note.id}/blocks`, "POST", { type, text: "" });
    onChanged();
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      {/* Tiêu đề note */}
      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          defaultValue={note.title ?? ""}
          placeholder="Tiêu đề ghi chép…"
          onBlur={e => void saveTitle(e.target.value)}
          className="flex-1 bg-transparent text-sm font-semibold text-white placeholder:text-slate-600 focus:outline-none border-b border-transparent focus:border-slate-700 pb-1"
        />
        <button onClick={deleteNote} className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg" aria-label="Xóa ghi chép">
          <Trash2 size={15} />
        </button>
      </div>

      {/* Blocks */}
      <div className="space-y-2">
        {note.blocks.map(block => (
          <BlockRow
            key={block.id}
            block={block}
            onChanged={onChanged}
            onCreateWork={onCreateWork}
          />
        ))}
        {note.blocks.length === 0 && (
          <p className="text-xs text-slate-600 py-1">Thêm nội dung bằng các nút bên dưới…</p>
        )}
      </div>

      {/* Toolbar thêm block */}
      <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-800">
        <button
          onClick={() => addBlock("text")}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
        >
          <Type size={13} /> Văn bản
        </button>
        <button
          onClick={() => addBlock("todo")}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
        >
          <CheckSquare size={13} /> Việc cần làm
        </button>
        <VoiceRecorder noteId={note.id} onUploaded={onChanged} />
        <ImageOcr noteId={note.id} onUploaded={onChanged} />
      </div>
    </div>
  );
}

// ─── Block row ──────────────────────────────────────────────────────────────────

function BlockRow({
  block, onChanged, onCreateWork,
}: {
  block: NoteBlock;
  onChanged: () => void;
  onCreateWork: (blockId: string, title: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playLoading, setPlayLoading] = useState(false);

  // Trợ lý tóm tắt (chỉ dùng cho voice block đã bóc xong)
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiRes, setAiRes] = useState<AssistResult | null>(null);
  const [aiView, setAiView] = useState<"full" | "para">("full");
  const [paraPick, setParaPick] = useState<boolean[]>([]);
  const [aiBusy, setAiBusy] = useState(false);          // đang áp dụng
  const [aiError, setAiError] = useState<string | null>(null);

  const runAssist = async () => {
    setAiError(null); setAiRes(null); setAiRunning(true);
    try {
      const { data } = await apiSend<AssistResult>(
        `/api/notes/blocks/${block.id}/standardize`, "POST", {});
      const r: AssistResult = { cleaned: data?.cleaned ?? "", paragraphs: data?.paragraphs ?? [] };
      setAiRes(r);
      setAiView("full");
      setParaPick(r.paragraphs.map(() => true)); // mặc định chọn tất cả đoạn
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Xử lý thất bại");
    } finally {
      setAiRunning(false);
    }
  };

  const applyText = async (text: string) => {
    setAiBusy(true);
    try {
      await apiSend(`/api/notes/blocks/${block.id}`, "PUT", { text });
      if (taRef.current) taRef.current.value = text;
      setAiRes(null);
      onChanged();
    } finally {
      setAiBusy(false);
    }
  };

  const saveText = async (text: string) => {
    if (text === (block.text ?? "")) return;
    await apiSend(`/api/notes/blocks/${block.id}`, "PUT", { text });
  };
  const toggleCheck = async (checked: boolean) => {
    await apiSend(`/api/notes/blocks/${block.id}`, "PUT", { checked });
    onChanged();
  };
  const removeBlock = async () => {
    await apiSend(`/api/notes/blocks/${block.id}`, "DELETE");
    onChanged();
  };
  const retry = async () => {
    await apiSend(`/api/notes/blocks/${block.id}/transcribe`, "POST", {});
    onChanged();
  };
  const play = async () => {
    setPlayLoading(true);
    try {
      const { data } = await apiFetch<{ url: string }>(`/api/notes/blocks/${block.id}/audio-url`);
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = data.url;
      await audio.play();
    } catch {/* ignore */}
    finally { setPlayLoading(false); }
  };

  const workBadge = block.workItemId ? (
    <Link
      href="/work"
      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
    >
      <CheckCircle2 size={11} /> Đã tạo việc
    </Link>
  ) : null;

  const createWorkBtn = (title: string) => !block.workItemId && title.trim().length >= 2 ? (
    <button
      onClick={() => onCreateWork(block.id, title)}
      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/10"
    >
      <ClipboardList size={11} /> Tạo việc
    </button>
  ) : null;

  const delBtn = (
    <button onClick={removeBlock} className="p-1 text-slate-600 hover:text-rose-400 rounded" aria-label="Xóa block">
      <Trash2 size={13} />
    </button>
  );

  // ─── TEXT ─────────────────────────────────────────────
  if (block.type === "text") {
    return (
      <div className="group flex items-start gap-2">
        <textarea
          ref={taRef}
          defaultValue={block.text ?? ""}
          placeholder="Nhập nội dung…"
          rows={2}
          onBlur={e => void saveText(e.target.value)}
          className="flex-1 bg-slate-800/50 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/40 resize-none"
        />
        <div className="flex flex-col items-end gap-1 pt-1">
          <ReadAloud getText={() => taRef.current?.value ?? block.text ?? ""} />
          {workBadge ?? createWorkBtn(block.text ?? "")}
          {delBtn}
        </div>
      </div>
    );
  }

  // ─── TODO ─────────────────────────────────────────────
  if (block.type === "todo") {
    return (
      <div className="group flex items-center gap-2">
        <input
          type="checkbox"
          checked={block.checked}
          onChange={e => void toggleCheck(e.target.checked)}
          className="w-4 h-4 accent-emerald-500 shrink-0"
        />
        <input
          type="text"
          defaultValue={block.text ?? ""}
          placeholder="Việc cần làm…"
          onBlur={e => void saveText(e.target.value)}
          className={`flex-1 bg-transparent text-sm focus:outline-none border-b border-transparent focus:border-slate-700 pb-0.5 ${
            block.checked ? "line-through text-slate-500" : "text-slate-200"
          }`}
        />
        {workBadge ?? createWorkBtn(block.text ?? "")}
        {delBtn}
      </div>
    );
  }

  // ─── VOICE ────────────────────────────────────────────
  const status = block.transcriptStatus;
  return (
    <div className="bg-slate-800/40 border border-slate-800 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Mic size={14} className="text-rose-400" />
        <span className="text-xs text-slate-400">
          Ghi âm{block.audioDuration ? ` • ${block.audioDuration}s` : ""}
        </span>
        <button
          onClick={play}
          disabled={playLoading}
          className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500"
        >
          {playLoading ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />} Nghe
        </button>
        {status === "done" && (
          <ReadAloud getText={() => taRef.current?.value ?? block.text ?? ""} />
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {status === "done" && (
            <button
              onClick={() => void runAssist()}
              disabled={aiRunning || aiBusy}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md text-violet-300 border border-violet-500/40 hover:bg-violet-500/10 disabled:opacity-50"
            >
              {aiRunning ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              Trợ lý tóm tắt
            </button>
          )}
          {workBadge ?? (status === "done" ? createWorkBtn(block.text ?? "") : null)}
          {delBtn}
        </div>
      </div>

      {(status === "pending" || status === "processing") && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-amber-400">
            <Loader2 size={12} className="animate-spin" />
            Đang bóc nội dung…{typeof block.transcriptProgress === "number" ? ` ${block.transcriptProgress}%` : ""}
          </div>
          {typeof block.transcriptProgress === "number" && block.transcriptProgress > 0 && (
            <div className="h-1 w-full bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 transition-all" style={{ width: `${block.transcriptProgress}%` }} />
            </div>
          )}
          {block.text && (
            <p className="text-xs text-slate-400 whitespace-pre-wrap line-clamp-4">{block.text}</p>
          )}
        </div>
      )}
      {status === "failed" && (
        <div className="flex items-center gap-2 text-xs text-rose-400">
          <AlertCircle size={12} /> Bóc nội dung thất bại
          <button onClick={retry} className="inline-flex items-center gap-1 text-slate-300 hover:text-white">
            <RotateCw size={11} /> Thử lại
          </button>
        </div>
      )}
      {status === "done" && (
        <div className="space-y-2">
          <textarea
            ref={taRef}
            defaultValue={block.text ?? ""}
            rows={3}
            onBlur={e => void saveText(e.target.value)}
            className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500/40 resize-none"
          />

          {aiError && (
            <p className="flex items-center gap-1 text-[11px] text-rose-400">
              <AlertCircle size={11} /> {aiError}
            </p>
          )}

          {/* Trợ lý tóm tắt — chọn toàn văn hoặc theo đoạn rồi áp dụng */}
          {aiRes && (
            <div className="border border-violet-500/30 bg-violet-500/5 rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-violet-300">
                  <Sparkles size={12} /> Trợ lý tóm tắt — chọn nội dung để cập nhật
                </div>
                <button onClick={() => setAiRes(null)} className="p-0.5 text-slate-500 hover:text-white" aria-label="Đóng">
                  <X size={13} />
                </button>
              </div>

              {/* Chuyển chế độ: toàn văn / theo đoạn */}
              <div className="inline-flex items-center gap-0.5 p-0.5 bg-slate-800/70 rounded-lg text-[11px]">
                <button
                  onClick={() => setAiView("full")}
                  className={`px-2.5 py-1 rounded-md font-medium ${aiView === "full" ? "bg-violet-500/30 text-violet-100" : "text-slate-400 hover:text-white"}`}
                >
                  Toàn văn
                </button>
                <button
                  onClick={() => setAiView("para")}
                  className={`px-2.5 py-1 rounded-md font-medium ${aiView === "para" ? "bg-violet-500/30 text-violet-100" : "text-slate-400 hover:text-white"}`}
                >
                  Theo đoạn ({aiRes.paragraphs.length})
                </button>
              </div>

              {aiView === "full" ? (
                <>
                  <div className="text-xs text-slate-300 whitespace-pre-wrap bg-slate-900/50 border border-slate-800 rounded-md px-2.5 py-2 max-h-60 overflow-y-auto">
                    {aiRes.cleaned}
                  </div>
                  <button
                    onClick={() => void applyText(aiRes.cleaned)}
                    disabled={aiBusy || !aiRes.cleaned}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md bg-violet-500/20 text-violet-200 border border-violet-500/40 hover:bg-violet-500/30 disabled:opacity-50"
                  >
                    {aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Dùng toàn văn
                  </button>
                </>
              ) : (
                <>
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {aiRes.paragraphs.map((p, i) => (
                      <label key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-slate-800/60 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={paraPick[i] ?? false}
                          onChange={e => setParaPick(arr => arr.map((v, j) => (j === i ? e.target.checked : v)))}
                          className="mt-0.5 w-3.5 h-3.5 accent-violet-500 shrink-0"
                        />
                        <span className="text-xs text-slate-300 whitespace-pre-wrap break-words flex-1">{p}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => void applyText(aiRes.paragraphs.filter((_, i) => paraPick[i]).join("\n\n"))}
                    disabled={aiBusy || !paraPick.some(Boolean)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md bg-violet-500/20 text-violet-200 border border-violet-500/40 hover:bg-violet-500/30 disabled:opacity-50"
                  >
                    {aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Dùng {paraPick.filter(Boolean).length} đoạn đã chọn
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Nút đọc văn bản (TTS edge-tts) ───────────────────────────────────────────

function ReadAloud({ getText }: { getText: () => string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");

  useEffect(() => () => {
    audioRef.current?.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const read = async () => {
    if (state === "playing") { audioRef.current?.pause(); setState("idle"); return; }
    const text = getText().trim();
    if (text.length < 1) return;
    setState("loading");
    try {
      const res = await fetch("/api/notes/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 8000) }),
      });
      if (!res.ok) throw new Error("tts failed");
      const blob = await res.blob();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = url;
      audio.onended = () => setState("idle");
      await audio.play();
      setState("playing");
    } catch {
      setState("idle");
    }
  };

  return (
    <button
      onClick={() => void read()}
      disabled={state === "loading"}
      title="Đọc nội dung bằng giọng AI"
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-50"
    >
      {state === "loading" ? <Loader2 size={11} className="animate-spin" />
        : state === "playing" ? <Square size={11} />
        : <Volume2 size={11} />}
      {state === "playing" ? "Dừng" : "Đọc"}
    </button>
  );
}
