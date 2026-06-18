// src/app/(dashboard)/reports/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { FinancialReportClient } from "./financial-report-client";
import { ReportsExtraClient } from "./reports-extra-client";
import { ConsolidatedReportClient } from "./consolidated-report-client";

export const metadata: Metadata = { title: "Báo Cáo & Dashboard" };

export default async function ReportsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <PageHeader
        icon="BarChart3"
        iconColor="text-blue-400"
        title="Báo Cáo & Dashboard"
        subtitle="Báo cáo tài chính (TT200), quản trị & thuế — tổng hợp realtime"
      />

      {/* Hợp nhất xuyên module theo kỳ + đối chiếu GL (GĐ4) */}
      <div>
        <h2 className="font-semibold text-white mb-3 px-1">Hợp Nhất Xuyên Module & Định Kỳ</h2>
        <ConsolidatedReportClient />
      </div>

      {/* Báo cáo tài chính TT200 — dữ liệu THẬT từ GL */}
      <div>
        <h2 className="font-semibold text-white mb-3 px-1">Báo Cáo Tài Chính (TT200)</h2>
        <FinancialReportClient />
      </div>

      {/* Báo cáo quản trị + thuế — tổng hợp từ các phân hệ */}
      <div>
        <h2 className="font-semibold text-white mb-3 px-1">Quản Trị & Thuế</h2>
        <ReportsExtraClient roleName={session.user.roleName} roleLevel={session.user.roleLevel} />
      </div>
    </div>
  );
}
