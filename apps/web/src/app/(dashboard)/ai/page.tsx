// src/app/(dashboard)/ai/page.tsx
// AI Console — Agent Selection Page

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@vsme/db/client";
import { getAllAgents, initSkillRegistry } from "@vsme/ai-sdk";
import { Bot, MessageSquare, CheckSquare, ListTodo, Settings, Brain } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { join } from "node:path";

// Initialize skill registry
const skillsDir = process.env["SKILLS_DIR"] ?? join(process.cwd(), "../../skills");
initSkillRegistry(skillsDir);

const LEVEL_LABELS: Record<string, string> = {
  board: "HĐQT",
  c_suite: "C-Suite",
  manager: "Trưởng Phòng",
  staff: "Nhân Viên",
  special: "Đặc Biệt",
};

const LEVEL_COLORS: Record<string, string> = {
  board: "bg-purple-900/40 text-purple-300 border-purple-800",
  c_suite: "bg-blue-900/40 text-blue-300 border-blue-800",
  manager: "bg-emerald-900/40 text-emerald-300 border-emerald-800",
  staff: "bg-slate-800 text-slate-300 border-slate-700",
  special: "bg-amber-900/40 text-amber-300 border-amber-800",
};

export default async function AIConsolePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const agents = getAllAgents();

  // Get pending approvals count
  const pendingApprovals = await prisma.aIApprovalRequest.count({
    where: { companyId: session.user.companyId, decision: null },
  });

  // Get running tasks count
  const runningTasks = await prisma.aITask.count({
    where: {
      companyId: session.user.companyId,
      status: { in: ["queued", "running", "awaiting_approval"] },
    },
  });

  // Get recent sessions
  const recentSessions = await prisma.aISession.findMany({
    where: { companyId: session.user.companyId, userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true, agentId: true, title: true, updatedAt: true },
  });

  // Group agents by level
  const grouped = {
    board: agents.filter((a) => a.level === "board"),
    c_suite: agents.filter((a) => a.level === "c_suite"),
    manager: agents.filter((a) => a.level === "manager"),
    staff: agents.filter((a) => a.level === "staff"),
    special: agents.filter((a) => a.level === "special"),
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        icon="Brain"
        iconColor="text-purple-400"
        title="AI Agent System"
        subtitle="Chọn agent để bắt đầu hội thoại"
        actions={
          <>
            <Link
              href="/ai/approvals"
              className="flex items-center gap-2 px-2.5 sm:px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors relative"
            >
              <CheckSquare size={18} />
              <span className="hidden sm:inline">Phê Duyệt</span>
              {pendingApprovals > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center">
                  {pendingApprovals}
                </span>
              )}
            </Link>
            <Link
              href="/ai/tasks"
              className="flex items-center gap-2 px-2.5 sm:px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
            >
              <ListTodo size={18} />
              <span className="hidden sm:inline">Tasks {runningTasks > 0 && `(${runningTasks})`}</span>
            </Link>
            <Link
              href="/ai/admin"
              className="flex items-center gap-2 px-2.5 sm:px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
            >
              <Settings size={18} />
            </Link>
          </>
        }
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: "Agents Available", value: agents.length, color: "blue" },
          { label: "Pending Approvals", value: pendingApprovals, color: pendingApprovals > 0 ? "red" : "green" },
          { label: "Active Tasks", value: runningTasks, color: runningTasks > 0 ? "yellow" : "green" },
          { label: "Recent Sessions", value: recentSessions.length, color: "purple" },
        ].map((stat) => (
          <div key={stat.label} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <div className={`text-2xl font-bold text-${stat.color}-400`}>{stat.value}</div>
            <div className="text-slate-400 text-sm mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Recent Sessions */}
      {recentSessions.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Cuộc Hội Thoại Gần Đây</h2>
          <div className="space-y-2">
            {recentSessions.map((s) => (
              <Link
                key={s.id}
                href={`/ai/chat/${s.agentId}?session=${s.id}`}
                className="flex items-center gap-3 p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <MessageSquare size={16} className="text-slate-400 flex-shrink-0" />
                <span className="text-white text-sm flex-1 truncate">{s.title ?? "Hội thoại"}</span>
                <span className="text-slate-500 text-xs">{s.agentId}</span>
                <span className="text-slate-600 text-xs">
                  {new Date(s.updatedAt).toLocaleDateString("vi-VN")}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Agent Grid by Level */}
      {(Object.entries(grouped) as [string, typeof agents][]).map(([level, levelAgents]) => {
        if (levelAgents.length === 0) return null;
        return (
          <div key={level}>
            <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-3">
              {LEVEL_LABELS[level] ?? level}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {levelAgents.map((agent) => (
                <Link
                  key={agent.agentId}
                  href={`/ai/chat/${agent.agentId}`}
                  className="group bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl p-4 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-slate-700 group-hover:bg-slate-600 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors">
                      <Bot size={20} className="text-slate-400 group-hover:text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-white text-sm font-medium truncate">
                        {agent.displayName}
                      </div>
                      <div className="text-slate-500 text-xs mt-0.5 truncate">
                        {agent.department}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className={`text-xs px-2 py-0.5 rounded border ${LEVEL_COLORS[agent.level] ?? ""}`}>
                      {LEVEL_LABELS[agent.level] ?? agent.level}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
