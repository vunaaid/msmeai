"use client";

// src/app/(dashboard)/work/breakdown-modal.tsx
// Xem lại nội dung AI phân tích/đề xuất breakdown của 1 công việc (đã phân giao).

import { useEffect, useState } from "react";
import { X, Sparkles, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api/client";

interface SubtaskLike {
  title?: string;
  description?: string;
  priority?: string;
  estimatedDays?: number;
}

interface Props {
  itemId: string;
  itemTitle: string;
  onClose: () => void;
}

export function BreakdownModal({ itemId, itemTitle, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [breakdown, setBreakdown] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<{ breakdown: unknown }>(`/api/work/${itemId}/breakdown`)
      .then(({ data }) => {
        if (active) setBreakdown(data?.breakdown ?? null);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Không tải được phân tích");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [itemId]);

  // aiBreakdown có thể là mảng subtask, hoặc object { subtasks: [...] }, hoặc khác.
  const obj = breakdown && typeof breakdown === "object" ? (breakdown as Record<string, unknown>) : null;
  const items: SubtaskLike[] | null = Array.isArray(breakdown)
    ? (breakdown as SubtaskLike[])
    : obj && Array.isArray(obj["subtasks"])
      ? (obj["subtasks"] as SubtaskLike[])
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 bg-purple-500/10 rounded-lg flex-shrink-0">
              <Sparkles size={16} className="text-purple-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white">Phân tích AI lần trước</h2>
              <p className="text-xs text-slate-500 truncate">{itemTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : !breakdown ? (
            <p className="text-sm text-slate-500 text-center py-8">
              Chưa có phân tích AI cho công việc này.
            </p>
          ) : items ? (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-500 mb-1">{items.length} việc con AI đề xuất:</p>
              {items.map((s, i) => (
                <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-5 h-5 rounded bg-purple-600/20 text-purple-300 text-xs flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-slate-200">{s.title ?? `Việc ${i + 1}`}</span>
                    {s.priority && <span className="text-xs text-slate-500">· {s.priority}</span>}
                    {s.estimatedDays && <span className="text-xs text-slate-500">· {s.estimatedDays} ngày</span>}
                  </div>
                  {s.description && <p className="text-xs text-slate-400 mt-1 ml-7">{s.description}</p>}
                </div>
              ))}
            </div>
          ) : (
            <pre className="text-xs text-slate-300 bg-slate-800/50 border border-slate-700 rounded-lg p-3 whitespace-pre-wrap overflow-auto">
              {JSON.stringify(breakdown, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
