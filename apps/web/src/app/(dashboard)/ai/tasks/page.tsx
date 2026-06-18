// src/app/(dashboard)/ai/tasks/page.tsx
// AI Task Queue — view all AI tasks

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@vsme/db/client";
import { ListTodo, Clock, CheckCircle2, XCircle, Loader2, AlertCircle, PauseCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

const STATUS_CONFIG = {
  queued:             { label: "Chờ xử lý",    icon: Clock,         color: "text-slate-400", bg: "bg-slate-800/40" },
  running:            { label: "Đang chạy",     icon: Loader2,       color: "text-blue-400",  bg: "bg-blue-900/20" },
  completed:          { label: "Hoàn thành",    icon: CheckCircle2,  color: "text-emerald-400", bg: "bg-emerald-900/20" },
  failed:             { label: "Thất bại",      icon: XCircle,       color: "text-red-400",   bg: "bg-red-900/20" },
  cancelled:          { label: "Đã hủy",        icon: XCircle,       color: "text-slate-500", bg: "bg-slate-800/30" },
  awaiting_approval:  { label: "Chờ phê duyệt", icon: PauseCircle,   color: "text-amber-400", bg: "bg-amber-900/20" },
};

export default async function AITasksPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const tasks = await prisma.aITask.findMany({
    where: { companyId: session.user.companyId },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      approvalRequests: {
        where: { decision: null },
        select: { id: true, action: true },
      },
    },
  });

  // Group by status
  const grouped = {
    running: tasks.filter((t) => t.status === "running"),
    awaiting_approval: tasks.filter((t) => t.status === "awaiting_approval"),
    queued: tasks.filter((t) => t.status === "queued"),
    completed: tasks.filter((t) => t.status === "completed"),
    failed: tasks.filter((t) => t.status === "failed"),
    cancelled: tasks.filter((t) => t.status === "cancelled"),
  };

  const activeTasks = tasks.filter((t) =>
    ["queued", "running", "awaiting_approval"].includes(t.status)
  ).length;

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        icon="ListTodo"
        iconColor="text-blue-400"
        backHref="/ai"
        title="AI Task Queue"
        subtitle={`${activeTasks} task đang hoạt động · ${tasks.length} tổng`}
      />

      {/* Active tasks first */}
      {(["running", "awaiting_approval", "queued"] as const).map((status) => {
        const statusTasks = grouped[status];
        if (statusTasks.length === 0) return null;
        const { label, icon: Icon, color, bg } = STATUS_CONFIG[status];

        return (
          <div key={status}>
            <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-3">
              {label} ({statusTasks.length})
            </h2>
            <div className="space-y-2">
              {statusTasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-center gap-4 p-4 ${bg} border border-slate-700/50 rounded-xl`}
                >
                  <Icon size={20} className={`${color} flex-shrink-0 ${status === "running" ? "animate-spin" : ""}`} />

                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{task.title}</p>
                    <p className="text-slate-500 text-xs mt-0.5">
                      Agent: <span className="text-slate-400">{task.agentId}</span>
                      {" · "}Priority: {task.priority}
                      {" · "}{new Date(task.createdAt).toLocaleString("vi-VN")}
                    </p>
                    {task.approvalRequests.length > 0 && (
                      <div className="mt-1 flex gap-1 flex-wrap">
                        {task.approvalRequests.slice(0, 3).map((ar) => (
                          <Link
                            key={ar.id}
                            href="/ai/approvals"
                            className="text-xs px-2 py-0.5 bg-amber-900/30 text-amber-300 border border-amber-800/50 rounded hover:bg-amber-900/50 transition-colors"
                          >
                            ⏳ {ar.action}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>

                  <span className={`text-xs px-2 py-0.5 rounded border ${color} border-current/30`}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Completed/Failed tasks */}
      {(grouped.completed.length > 0 || grouped.failed.length > 0) && (
        <div>
          <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-3">
            Đã Xử Lý
          </h2>
          <div className="space-y-2">
            {[...grouped.failed, ...grouped.completed].slice(0, 20).map((task) => {
              const cfg = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.completed;
              const Icon = cfg.icon;

              return (
                <div
                  key={task.id}
                  className="flex items-center gap-4 p-3 bg-slate-800/20 border border-slate-700/30 rounded-xl opacity-70"
                >
                  <Icon size={16} className={cfg.color} />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 text-sm truncate">{task.title}</p>
                    <p className="text-slate-600 text-xs">
                      {task.agentId} · {task.completedAt
                        ? new Date(task.completedAt).toLocaleString("vi-VN")
                        : new Date(task.updatedAt).toLocaleString("vi-VN")}
                    </p>
                    {task.status === "failed" && task.error && (
                      <p className="text-red-400 text-xs mt-0.5 truncate">{task.error}</p>
                    )}
                  </div>
                  <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tasks.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <ListTodo size={40} className="mx-auto mb-3 opacity-30" />
          <p>Chưa có task nào</p>
        </div>
      )}
    </div>
  );
}
