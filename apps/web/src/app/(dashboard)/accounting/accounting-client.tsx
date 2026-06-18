"use client";

// src/app/(dashboard)/accounting/accounting-client.tsx
// Module Kế Toán — shell điều hướng theo tab. Mọi giao dịch của các phân hệ
// (Hóa đơn, AR/AP, Ngân quỹ, TSCĐ, HR/Sales) hội tụ về GL (Sổ Cái) → kết xuất BCTC.
//
//   BCTC (B01/B02/B03/B09-DN)  ◀── kết xuất từ GL
//   GL (Sổ Cái)                ◀── trung tâm, nhận bút toán từ mọi phân hệ
//   Invoice · AR/AP · Cash · Assets · HR/Sales  ──▶ đẩy bút toán vào GL

import { useState } from "react";
import {
  Calculator, BarChart3, BookOpen, FileText, ArrowLeftRight,
  Banknote, Building2, Users, Calendar, Download, Plus,
  ArrowRight, Lock, Sparkles, Receipt,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { GlPanel } from "./gl-panel";
import { AccountingAssistant } from "./accounting-assistant";
import { CashFlowPlan } from "./cash-flow-plan";
import { ExpensesPanel } from "./expenses-panel";
import { FinancialReportClient } from "../reports/financial-report-client";

// ─── Cấu hình tab cấp 1 ───────────────────────────────────────────────────────

type TabKey = "bctc" | "gl" | "assistant" | "expenses" | "invoice" | "arap" | "cash" | "assets" | "hrsales";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "bctc",      label: "BCTC",            icon: BarChart3 },
  { key: "gl",        label: "Sổ Cái (GL)",     icon: BookOpen },
  { key: "assistant", label: "Trợ Lý Kế Toán",  icon: Sparkles },
  { key: "expenses",  label: "Chi Phí",         icon: Receipt },
  { key: "invoice",   label: "Hóa Đơn",         icon: FileText },
  { key: "arap",      label: "Công Nợ (AR/AP)", icon: ArrowLeftRight },
  { key: "cash",      label: "Ngân Quỹ",        icon: Banknote },
  { key: "assets",    label: "Tài Sản CĐ",      icon: Building2 },
  { key: "hrsales",   label: "Nhân Sự / Bán Hàng", icon: Users },
];

interface AccountingClientProps {
  userName: string;
  canManage: boolean;
  roleName: string | null;
  roleLevel: string | null;
}

export function AccountingClient({ canManage, roleName, roleLevel }: AccountingClientProps) {
  const [tab, setTab] = useState<TabKey>("bctc");

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        icon={Calculator}
        iconColor="text-blue-400"
        title="Kế Toán"
        subtitle="Sổ cái, hóa đơn, công nợ, ngân quỹ, tài sản — kết xuất báo cáo tài chính"
        actions={<PeriodPill />}
      />

      {/* Thanh tab cấp 1 */}
      <div className="border-b border-slate-800 mb-5">
        <nav className="flex gap-1 overflow-x-auto -mb-px">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? "border-blue-500 text-white"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <t.icon size={16} className={active ? "text-blue-400" : ""} />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Nội dung tab */}
      {tab === "bctc" && <FinancialReportClient />}
      {tab === "gl" && <GlPanel canManage={canManage} />}
      {tab === "assistant" && <AccountingAssistant roleName={roleName} roleLevel={roleLevel} onEntryCreated={() => setTab("gl")} />}
      {tab === "expenses" && <ExpensesPanel canManage={canManage} />}
      {tab === "invoice" && (
        <ModuleScaffold
          icon={FileText}
          color="text-cyan-400"
          bg="bg-cyan-500/10"
          title="Hóa Đơn Điện Tử"
          desc="HĐ đầu ra/đầu vào theo TT78. Xác nhận HĐ bán → tự sinh bút toán GL (Nợ 131 / Có 511 / Có 3331)."
          action={canManage ? "Tạo hóa đơn" : undefined}
          sections={[
            { name: "Hóa đơn đầu ra", detail: "Tạo HĐ, template mẫu số, xác nhận → bút toán GL + phải thu AR" },
            { name: "Hóa đơn đầu vào", detail: "Nhập/ import XML, duyệt → bút toán GL + phải trả AP" },
            { name: "Sổ hóa đơn", detail: "Sổ HĐ đầu ra (khai thuế) + đầu vào (khấu trừ)" },
            { name: "Kết nối TCT eTax", detail: "Ký số + gửi hoadondientu.gdt.gov.vn (Phase 6)" },
          ]}
        />
      )}
      {tab === "arap" && (
        <ModuleScaffold
          icon={ArrowLeftRight}
          color="text-emerald-400"
          bg="bg-emerald-500/10"
          title="Công Nợ — Phải Thu (AR) & Phải Trả (AP)"
          desc="Theo dõi công nợ khách hàng và nhà cung cấp. Ghi nhận thanh toán → bút toán GL."
          action={canManage ? "Ghi nhận thanh toán" : undefined}
          sections={[
            { name: "Phải thu (AR)", detail: "Danh mục KH, công nợ theo HĐ, nhận tiền (Nợ 111,112 / Có 131)" },
            { name: "Phải trả (AP)", detail: "Danh mục NCC, 3-way matching, trả tiền (Nợ 331 / Có 111,112)" },
            { name: "Aging report", detail: "Tuổi nợ 0-30 / 31-60 / 61-90 / >90 ngày" },
            { name: "Nhắc nợ & dự báo", detail: "Nhắc nợ tự động, lịch thanh toán sắp đến hạn" },
          ]}
        />
      )}
      {tab === "cash" && (
        <div className="space-y-6">
          <CashFlowPlan />
          <ModuleScaffold
            icon={Banknote}
            color="text-green-400"
            bg="bg-green-500/10"
            title="Ngân Quỹ — Cash Management"
            desc="Quỹ tiền mặt + tài khoản ngân hàng, đối chiếu sao kê (sắp có)."
            action={canManage ? "Phiếu thu / chi" : undefined}
            sections={[
              { name: "Quỹ tiền mặt", detail: "Nhiều quỹ, phiếu thu/chi, kiểm quỹ định kỳ" },
              { name: "Tài khoản ngân hàng", detail: "Import sao kê (Excel/CSV/OFX), auto-match với GL" },
              { name: "Kiểm soát chi", detail: "Hạn mức chi, workflow duyệt thanh toán" },
            ]}
          />
        </div>
      )}
      {tab === "assets" && (
        <ModuleScaffold
          icon={Building2}
          color="text-purple-400"
          bg="bg-purple-500/10"
          title="Tài Sản Cố Định"
          desc="Vòng đời TSCĐ theo TT45: mua → khấu hao → thanh lý. Khấu hao tự sinh bút toán (Nợ 6274 / Có 2141)."
          action={canManage ? "Thêm tài sản" : undefined}
          sections={[
            { name: "Hồ sơ TSCĐ", detail: "Nguyên giá, ngày mua, thời gian sử dụng, bộ phận" },
            { name: "Khấu hao tự động", detail: "Đường thẳng (TT45), bút toán cuối kỳ tự sinh" },
            { name: "Điều chuyển & thanh lý", detail: "Chuyển bộ phận, ghi nhận giá trị còn lại" },
            { name: "Kiểm kê", detail: "Biên bản kiểm kê, đối chiếu sổ sách" },
          ]}
        />
      )}
      {tab === "hrsales" && (
        <ModuleScaffold
          icon={Users}
          color="text-orange-400"
          bg="bg-orange-500/10"
          title="Nhân Sự / Bán Hàng"
          desc="Dữ liệu lương (HR) và doanh thu (Sales) phản ánh vào kế toán: bút toán lương, doanh thu, thuế TNCN."
          action={undefined}
          sections={[
            { name: "Lương & bảo hiểm (HR)", detail: "Bảng lương → bút toán chi phí lương, BHXH/BHYT/BHTN, thuế TNCN" },
            { name: "Doanh thu bán hàng (Sales)", detail: "Đơn hàng → hóa đơn → doanh thu 511 → GL" },
            { name: "Đối chiếu", detail: "Số liệu HR/Sales khớp với bút toán GL theo kỳ" },
          ]}
        />
      )}
    </div>
  );
}

// ─── Scaffold dùng chung cho các phân hệ ──────────────────────────────────────

function ModuleScaffold({
  icon: Icon, color, bg, title, desc, action, sections,
}: {
  icon: React.ElementType;
  color: string;
  bg: string;
  title: string;
  desc: string;
  action?: string;
  sections: { name: string; detail: string }[];
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-800">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${bg}`}>
            <Icon size={18} className={color} />
          </div>
          <div>
            <h2 className="font-semibold text-white">{title}</h2>
            <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">{desc}</p>
          </div>
        </div>
        {action && (
          <button
            disabled
            title="Chức năng đang được phát triển"
            className="flex items-center gap-1.5 text-xs text-slate-300 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Plus size={13} /> {action}
          </button>
        )}
      </div>

      <div className="divide-y divide-slate-800">
        {sections.map((s) => (
          <div key={s.name} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-800/40 transition-colors group">
            <div>
              <p className="text-sm font-medium text-slate-200">{s.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.detail}</p>
            </div>
            <ArrowRight size={15} className="text-slate-600 group-hover:text-slate-400 shrink-0" />
          </div>
        ))}
      </div>

      <div className="px-5 py-3 bg-slate-900/60 border-t border-slate-800 text-center">
        <span className="text-xs text-slate-600">Giao diện đã sẵn sàng — chức năng sẽ được code theo từng phân hệ</span>
      </div>
    </div>
  );
}

// ─── Bộ chọn kỳ kế toán (hiển thị, chưa nối dữ liệu) ──────────────────────────

function PeriodPill() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
      <Calendar size={15} />
      <span>Kỳ: Tháng 6/2026</span>
    </div>
  );
}
