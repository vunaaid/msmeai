"use client";

// Approvals client component with approve/reject actions

import { useState } from "react";
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { apiSend } from "@/lib/api/client";

interface Approval {
  id: string;
  agentId: string;
  action: string;
  authorityResult: string;
  reason: string;
  approver: string;
  actionInput: unknown;
  createdAt: string | Date;
  task: { title: string; agentId: string } | null;
}

interface AIApprovalsClientProps {
  approvals: Approval[];
}

export function AIApprovalsClient({ approvals: initialApprovals }: AIApprovalsClientProps) {
  const [approvals, setApprovals] = useState(initialApprovals);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, string>>({});

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const decide = async (id: string, decision: "approved" | "rejected") => {
    setProcessing((prev) => new Set([...prev, id]));

    try {
      await apiSend(`/api/ai/approvals/${id}`, "PATCH", { decision, comment: comments[id] });
      setApprovals((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi khi xử lý");
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  if (approvals.length === 0) {
    return (
      <div className="text-center py-6 text-slate-500 text-sm">
        Không còn yêu cầu nào
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {approvals.map((approval) => {
        const isExpanded = expanded.has(approval.id);
        const isProcessing = processing.has(approval.id);

        return (
          <div
            key={approval.id}
            className="bg-slate-800/50 border border-amber-800/50 rounded-xl overflow-hidden"
          >
            {/* Header */}
            <div
              className="flex items-center gap-4 p-4 cursor-pointer"
              onClick={() => toggleExpand(approval.id)}
            >
              <Clock size={20} className="text-amber-400 flex-shrink-0" />

              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">
                  {approval.action}
                </p>
                <p className="text-slate-500 text-xs truncate mt-0.5">
                  Agent: <span className="text-slate-400">{approval.agentId}</span>
                  {" · "}Người duyệt: <span className="text-amber-400">{approval.approver}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded bg-amber-900/30 text-amber-300 border border-amber-800">
                  {approval.authorityResult}
                </span>
                {isExpanded ? (
                  <ChevronUp size={16} className="text-slate-400" />
                ) : (
                  <ChevronDown size={16} className="text-slate-400" />
                )}
              </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
              <div className="border-t border-slate-700 p-4 space-y-4">
                {/* Reason */}
                <div>
                  <p className="text-slate-500 text-xs font-medium mb-1">LÝ DO</p>
                  <p className="text-slate-300 text-sm">{approval.reason}</p>
                </div>

                {/* Input Data */}
                {!!(approval.actionInput) && typeof approval.actionInput === 'object' && Object.keys(approval.actionInput as object).length > 0 && (
                  <div>
                    <p className="text-slate-500 text-xs font-medium mb-1">DỮ LIỆU HÀNH ĐỘNG</p>
                    <pre className="bg-slate-900 rounded-lg p-3 text-xs text-slate-300 overflow-auto max-h-32">
                      {JSON.stringify(approval.actionInput, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Task context */}
                {approval.task && (
                  <div>
                    <p className="text-slate-500 text-xs font-medium mb-1">TASK LIÊN QUAN</p>
                    <p className="text-slate-300 text-sm">{approval.task.title}</p>
                  </div>
                )}

                {/* Comment input */}
                <div>
                  <label className="text-slate-500 text-xs font-medium block mb-1">
                    GHI CHÚ (tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={comments[approval.id] ?? ""}
                    onChange={(e) =>
                      setComments((prev) => ({ ...prev, [approval.id]: e.target.value }))
                    }
                    placeholder="Lý do phê duyệt hoặc từ chối..."
                    className="w-full bg-slate-900 border border-slate-700 text-white placeholder-slate-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => decide(approval.id, "approved")}
                    disabled={isProcessing}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {isProcessing ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                    Phê Duyệt
                  </button>
                  <button
                    onClick={() => decide(approval.id, "rejected")}
                    disabled={isProcessing}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {isProcessing ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <XCircle size={16} />
                    )}
                    Từ Chối
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
