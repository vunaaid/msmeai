// src/app/(dashboard)/ai/admin/page.tsx
// AI Admin — LLM usage stats, provider status, mode config

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@vsme/db/client";
import { userCan } from "@/lib/auth/rbac";
import { Settings, Zap, TrendingUp, DollarSign, Clock, Bot } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

export default async function AIAdminPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Only admins can see this page
  if (!(await userCan(session, "ai-agents", "configure"))) {
    redirect("/ai");
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalRequests,
    totalCost,
    avgLatency,
    byProvider,
    byAgent,
    company,
  ] = await Promise.all([
    prisma.lLMUsageLog.count({
      where: { companyId: session.user.companyId, createdAt: { gte: monthStart } },
    }),
    prisma.lLMUsageLog.aggregate({
      where: { companyId: session.user.companyId, createdAt: { gte: monthStart } },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    }),
    prisma.lLMUsageLog.aggregate({
      where: { companyId: session.user.companyId, createdAt: { gte: monthStart } },
      _avg: { latencyMs: true },
    }),
    prisma.lLMUsageLog.groupBy({
      by: ["provider"],
      where: { companyId: session.user.companyId, createdAt: { gte: monthStart } },
      _count: { id: true },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    }),
    prisma.lLMUsageLog.groupBy({
      by: ["agentId"],
      where: {
        companyId: session.user.companyId,
        createdAt: { gte: monthStart },
        agentId: { not: null },
      },
      _count: { id: true },
      _sum: { costUsd: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
    prisma.company.findUnique({
      where: { id: session.user.companyId },
      select: { ai_mode: true, name: true },
    }),
  ]);

  const formatCost = (usd: number) => {
    if (usd < 0.01) return "<$0.01";
    return `$${usd.toFixed(3)}`;
  };

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        icon="Settings"
        iconColor="text-slate-400"
        backHref="/ai"
        title="AI Admin"
        subtitle="Thống kê sử dụng LLM tháng này"
        actions={
          <Link
            href="/ai/admin/agents"
            className="flex items-center gap-2 px-4 py-2 bg-purple-700/30 hover:bg-purple-700/50 text-purple-300 border border-purple-700/40 rounded-lg transition-colors text-sm font-medium"
          >
            <Bot size={16} />
            Quản lý Agents
          </Link>
        }
      />

      {/* Company AI Mode */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold">Chế Độ AI: {company?.name}</h2>
            <p className="text-slate-400 text-sm mt-1">
              Cấu hình cách AI hoạt động trong toàn công ty
            </p>
          </div>
          <span className={`px-4 py-2 rounded-xl text-sm font-semibold border ${
            company?.ai_mode === "full"
              ? "bg-purple-900/40 text-purple-300 border-purple-700"
              : "bg-slate-700 text-slate-300 border-slate-600"
          }`}>
            {company?.ai_mode === "full" ? "⚡ FULL MODE" : "🤝 ASSISTANT MODE"}
          </span>
        </div>
        <p className="text-slate-500 text-xs mt-3">
          {company?.ai_mode === "full"
            ? "AI tự thực hiện các hành động trong phạm vi quyền hạn không cần xác nhận"
            : "AI đề xuất hành động, người dùng phải xác nhận trước khi thực hiện"}
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Requests tháng này",
            value: totalRequests.toLocaleString(),
            icon: Zap,
            color: "blue",
          },
          {
            label: "Chi phí LLM",
            value: formatCost(totalCost._sum.costUsd ?? 0),
            icon: DollarSign,
            color: "emerald",
          },
          {
            label: "Tokens input",
            value: formatTokens(totalCost._sum.inputTokens ?? 0),
            icon: TrendingUp,
            color: "purple",
          },
          {
            label: "Avg latency",
            value: `${Math.round(avgLatency._avg.latencyMs ?? 0)}ms`,
            icon: Clock,
            color: "amber",
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-slate-800/50 border border-slate-700 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className={`text-${stat.color}-400`} />
                <span className="text-slate-500 text-xs">{stat.label}</span>
              </div>
              <div className={`text-xl font-bold text-${stat.color}-400`}>{stat.value}</div>
            </div>
          );
        })}
      </div>

      {/* By Provider */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-4">Theo Provider</h2>
        <div className="space-y-3">
          {byProvider.map((p) => (
            <div
              key={p.provider}
              className="flex items-center gap-4 p-3 bg-slate-700/30 rounded-lg"
            >
              <div className="w-20 text-sm font-medium text-white capitalize">{p.provider}</div>
              <div className="flex-1 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 text-xs">Requests</span>
                  <div className="text-white">{p._count.id.toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">Tokens</span>
                  <div className="text-white">
                    {formatTokens((p._sum.inputTokens ?? 0) + (p._sum.outputTokens ?? 0))}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">Chi phí</span>
                  <div className="text-emerald-400">{formatCost(p._sum.costUsd ?? 0)}</div>
                </div>
              </div>
            </div>
          ))}
          {byProvider.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-4">
              Chưa có dữ liệu sử dụng
            </p>
          )}
        </div>
      </div>

      {/* By Agent */}
      {byAgent.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Top Agents (tháng này)</h2>
          <div className="space-y-2">
            {byAgent.map((a) => (
              <div
                key={a.agentId}
                className="flex items-center gap-4 p-3 bg-slate-700/30 rounded-lg"
              >
                <div className="w-32 text-sm text-slate-300 truncate">{a.agentId}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm">{a._count.id} requests</span>
                  </div>
                </div>
                <div className="text-emerald-400 text-sm">
                  {formatCost(a._sum.costUsd ?? 0)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
