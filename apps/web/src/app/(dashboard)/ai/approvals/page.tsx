// src/app/(dashboard)/ai/approvals/page.tsx
// AI Approval Inbox — manage pending AI approval requests

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@vsme/db/client";
import { CheckSquare, XSquare, Clock, CheckCircle2, XCircle } from "lucide-react";
import { AIApprovalsClient } from "./approvals-client";
import { PageHeader } from "@/components/layout/page-header";

export default async function AIApprovalsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const [pending, recent] = await Promise.all([
    prisma.aIApprovalRequest.findMany({
      where: { companyId: session.user.companyId, decision: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        task: { select: { title: true, agentId: true } },
      },
    }),
    prisma.aIApprovalRequest.findMany({
      where: {
        companyId: session.user.companyId,
        decision: { not: null },
      },
      orderBy: { decidedAt: "desc" },
      take: 20,
      include: {
        task: { select: { title: true, agentId: true } },
      },
    }),
  ]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        icon="CheckSquare"
        iconColor="text-amber-400"
        backHref="/ai"
        title="Phê Duyệt AI"
        subtitle={`${pending.length} yêu cầu đang chờ phê duyệt`}
      />

      {/* Pending Approvals */}
      {pending.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wider">
            Đang Chờ Duyệt
          </h2>
          <AIApprovalsClient approvals={pending} />
        </div>
      ) : (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center">
          <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-3" />
          <p className="text-white font-medium">Không có yêu cầu nào chờ duyệt</p>
          <p className="text-slate-500 text-sm mt-1">Tất cả yêu cầu đã được xử lý</p>
        </div>
      )}

      {/* Recent Decisions */}
      {recent.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wider">
            Đã Xử Lý Gần Đây
          </h2>
          <div className="space-y-2">
            {recent.map((approval) => (
              <div
                key={approval.id}
                className="flex items-center gap-4 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl"
              >
                <div className="flex-shrink-0">
                  {approval.decision === "approved" ? (
                    <CheckCircle2 size={20} className="text-emerald-400" />
                  ) : (
                    <XCircle size={20} className="text-red-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {approval.action}
                  </p>
                  <p className="text-slate-500 text-xs truncate">
                    {approval.task?.agentId} — {approval.task?.title}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-xs font-medium ${
                    approval.decision === "approved" ? "text-emerald-400" : "text-red-400"
                  }`}>
                    {approval.decision === "approved" ? "Đã duyệt" : "Đã từ chối"}
                  </p>
                  <p className="text-slate-600 text-xs">
                    {approval.decidedAt
                      ? new Date(approval.decidedAt).toLocaleDateString("vi-VN")
                      : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
