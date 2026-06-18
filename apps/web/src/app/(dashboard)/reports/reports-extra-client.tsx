"use client";

// src/app/(dashboard)/reports/reports-extra-client.tsx
// Báo cáo quản trị (KPI tổng hợp đa module) + Báo cáo thuế (tổng hợp tờ khai).
// Tổng hợp từ các endpoint stats sẵn có — không cần API mới.

import { useState } from "react";
import { BarChart3, Landmark, RefreshCw, Loader2, TrendingUp, TrendingDown, Wallet, Users, Boxes, Building2, AlertTriangle } from "lucide-react";
import { useApi } from "@/lib/api/client";
import { ReportsAssistant } from "./reports-assistant";

const vnd = (n: number) => `${Math.round(n ?? 0).toLocaleString("vi-VN")} đ`;
type Tab = "management" | "tax";

export function ReportsExtraClient({ roleName, roleLevel }: { roleName: string | null; roleLevel: string | null }) {
  const [tab, setTab] = useState<Tab>("management");
  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
      <div className="lg:flex-[3] min-w-0">
        <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit mb-4">
          {([["management", "Báo cáo quản trị", BarChart3], ["tax", "Báo cáo thuế", Landmark]] as [Tab, string, React.ElementType][]).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === k ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        {tab === "management" ? <ManagementReport /> : <TaxReport />}
      </div>
      <div className="w-full lg:flex-1 min-w-0">
        <ReportsAssistant roleName={roleName} roleLevel={roleLevel} />
      </div>
    </div>
  );
}

// ─── Báo cáo quản trị ─────────────────────────────────────────────────────────────

function ManagementReport() {
  const sales = useApi<{ totalValue: number; openValue: number; count: number }>("/api/sales/stats");
  const exp = useApi<{ total: { amount: number }; notDeclared: { amount: number; count: number } }>("/api/expenses/stats");
  const cash = useApi<{ totalBalance: number; monthIn: number; monthOut: number }>("/api/cash/stats");
  const ar = useApi<{ outstanding: number; overdue: number }>("/api/debts/stats?kind=receivable");
  const ap = useApi<{ outstanding: number; overdue: number }>("/api/debts/stats?kind=payable");
  const inv = useApi<{ products: number; stockValue: number }>("/api/inventory/stats");
  const hr = useApi<{ total: number; withAccount: number }>("/api/hr/stats");
  const assets = useApi<{ totalNbv: number }>("/api/assets/stats");
  const tax = useApi<{ unpaidTotal: number; overdueTotal: number }>("/api/tax/stats");

  const loading = [sales, exp, cash, ar, ap, inv, hr, assets, tax].some((x) => x.loading);
  const refreshAll = () => [sales, exp, cash, ar, ap, inv, hr, assets, tax].forEach((x) => x.refresh());

  const revenue = sales.data?.totalValue ?? 0;
  const expense = exp.data?.total.amount ?? 0;
  const profit = revenue - expense;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Tổng hợp realtime từ các phân hệ — bán hàng, chi phí, ngân quỹ, công nợ, kho, nhân sự, thuế.</p>
        <button onClick={refreshAll} className="p-2 text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg"><RefreshCw size={14} /></button>
      </div>
      {loading ? <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-blue-500" /></div> : (
        <>
          <Section title="Kinh doanh">
            <KPI label="Doanh thu (đơn hàng)" value={revenue} icon={TrendingUp} cls="text-emerald-400" />
            <KPI label="Chi phí" value={expense} icon={TrendingDown} cls="text-amber-400" />
            <KPI label="Lợi nhuận gộp (ước)" value={profit} icon={BarChart3} cls={profit >= 0 ? "text-emerald-400" : "text-red-400"} />
          </Section>
          <Section title="Tài chính & dòng tiền">
            <KPI label="Số dư quỹ" value={cash.data?.totalBalance ?? 0} icon={Wallet} cls="text-green-400" />
            <KPI label="Phải thu (AR)" value={ar.data?.outstanding ?? 0} sub={ar.data?.overdue ? `quá hạn ${vnd(ar.data.overdue)}` : undefined} icon={TrendingUp} cls="text-cyan-400" />
            <KPI label="Phải trả (AP)" value={ap.data?.outstanding ?? 0} sub={ap.data?.overdue ? `quá hạn ${vnd(ap.data.overdue)}` : undefined} icon={TrendingDown} cls="text-rose-400" />
          </Section>
          <Section title="Thuế & tuân thủ">
            <KPI label="Thuế phải nộp" value={tax.data?.unpaidTotal ?? 0} icon={Landmark} cls="text-rose-300" />
            <KPI label="Thuế quá hạn" value={tax.data?.overdueTotal ?? 0} icon={AlertTriangle} cls="text-red-400" />
            <KPI label="Chi phí chưa kê khai" value={exp.data?.notDeclared.amount ?? 0} sub={`${exp.data?.notDeclared.count ?? 0} khoản`} icon={AlertTriangle} cls="text-amber-400" />
          </Section>
          <Section title="Vận hành & nguồn lực">
            <KPI label="Giá trị tồn kho" value={inv.data?.stockValue ?? 0} sub={`${inv.data?.products ?? 0} SP`} icon={Boxes} cls="text-indigo-400" />
            <KPI label="Giá trị còn lại TSCĐ" value={assets.data?.totalNbv ?? 0} icon={Building2} cls="text-orange-400" />
            <KPI label="Nhân sự" value={hr.data?.total ?? 0} sub={`${hr.data?.withAccount ?? 0} có tài khoản`} icon={Users} cls="text-pink-400" raw />
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}
function KPI({ label, value, sub, icon: Icon, cls, raw }: { label: string; value: number; sub?: string; icon: React.ElementType; cls: string; raw?: boolean }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Icon size={12} className={cls} /> {label}</div>
      <div className={`text-base font-semibold mt-1 ${cls}`}>{raw ? value : vnd(value)}</div>
      {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Báo cáo thuế ─────────────────────────────────────────────────────────────────

type TaxType = "vat" | "cit" | "pit";
interface TaxReturn { id: string; type: TaxType; period: string; payable: number; status: "draft" | "filed" | "paid"; dueDate: string | null }
const TYPE: Record<TaxType, string> = { vat: "GTGT", cit: "TNDN", pit: "TNCN" };
const RST: Record<string, { label: string; cls: string }> = {
  draft: { label: "Nháp", cls: "text-slate-400" }, filed: { label: "Đã nộp tờ khai", cls: "text-cyan-400" }, paid: { label: "Đã nộp tiền", cls: "text-emerald-400" },
};

function TaxReport() {
  const returns = useApi<TaxReturn[]>("/api/tax/returns");
  const rows = returns.data ?? [];
  // Gom theo năm.
  const byYear = new Map<string, TaxReturn[]>();
  for (const r of rows) {
    const y = r.period.slice(0, 4);
    const arr = byYear.get(y) ?? []; arr.push(r); byYear.set(y, arr);
  }
  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Tổng hợp tờ khai GTGT / TNDN / TNCN theo năm (từ module Thuế).</p>
        <button onClick={returns.refresh} className="p-2 text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg"><RefreshCw size={14} /></button>
      </div>
      {returns.loading ? <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      : rows.length === 0 ? <div className="py-12 text-center text-sm text-slate-500">Chưa có tờ khai. Sang module Thuế → "Tự tính kỳ".</div>
      : years.map((y) => {
        const yr = byYear.get(y)!;
        const totalPayable = yr.reduce((s, r) => s + (Number(r.payable) || 0), 0);
        const totalPaid = yr.filter((r) => r.status === "paid").reduce((s, r) => s + (Number(r.payable) || 0), 0);
        return (
          <div key={y} className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Năm {y}</span>
              <span className="text-xs text-slate-400">Phải nộp {vnd(totalPayable)} · Đã nộp {vnd(totalPaid)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-slate-400 border-b border-slate-800 text-right">
                  <th className="py-2 px-3 text-left">Loại</th><th className="px-3 text-left">Kỳ</th><th className="px-3">Phải nộp</th><th className="px-3 text-left">Trạng thái</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-800/60">
                  {yr.sort((a, b) => b.period.localeCompare(a.period)).map((r) => (
                    <tr key={r.id} className="text-right text-slate-300">
                      <td className="py-1.5 px-3 text-left"><span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">{TYPE[r.type]}</span></td>
                      <td className="px-3 text-left text-slate-400">{r.period}</td>
                      <td className="px-3 text-rose-300 font-medium">{vnd(Number(r.payable))}</td>
                      <td className={`px-3 text-left ${RST[r.status]?.cls ?? "text-slate-400"}`}>{RST[r.status]?.label ?? r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
