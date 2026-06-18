// src/app/(dashboard)/admin/audit/page.tsx
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Audit Logs" };

export default function AuditPage() {
  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        backHref="/admin"
        title="Audit Logs"
        subtitle="Lịch sử mọi thao tác trong hệ thống — append-only, không thể xóa"
      />

      <div className="bg-slate-900 border border-slate-800 rounded-xl">
        <div className="p-4 border-b border-slate-800 flex flex-wrap gap-3">
          <select className="px-3 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tất cả modules</option>
            <option value="admin">Admin</option>
            <option value="gl">GL</option>
            <option value="invoice">Invoice</option>
          </select>
          <input
            type="date"
            className="px-3 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="p-8 text-center text-slate-500 text-sm">
          Audit logs sẽ được tải từ API <code className="text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">/api/admin/audit</code>
        </div>
      </div>
    </div>
  );
}
