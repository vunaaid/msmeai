"use client";

// src/app/(dashboard)/reports/consolidated-report-client.tsx
// GĐ4 — Báo cáo hợp nhất xuyên module theo kỳ + đối chiếu Sổ cái (GL) + xu hướng 12 tháng.
// Dữ liệu THẬT gom từ bán hàng / hợp đồng / chi phí / lương / ngân quỹ / công nợ / thuế.

import { useState } from "react";
import { RefreshCw, Loader2, TrendingUp, TrendingDown, Wallet, BarChart3, Landmark, ArrowRightLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useApi } from "@/lib/api/client";

const vnd = (n: number) => `${Math.round(n ?? 0).toLocaleString("vi-VN")} đ`;
const vndC = (n: number) => `${Math.round((n ?? 0) / 1000).toLocaleString("vi-VN")}K`;
const CUR_YEAR = new Date().getUTCFullYear();
const YEARS = [CUR_YEAR, CUR_YEAR - 1, CUR_YEAR - 2];

type Gran = "year" | "quarter" | "month";

interface Consolidated {
  period: string; label: string;
  revenue: { sales: number; contracts: number; total: number };
  expense: { recorded: number; payroll: number; total: number };
  profit: number;
  cash: { in: number; out: number; net: number };
  receivable: number; payable: number;
  payroll: { net: number; pit: number; insuranceEmployee: number; insuranceEmployer: number };
  tax: { payable: number; byType: Record<string, number> };
  gl: { revenue: number; expense: number };
  reconciliation: { revenueDiff: number; expenseDiff: number; note: string };
}
interface TrendRow { month: string; revenue: number; expense: number; profit: number; cashIn: number; cashOut: number; cashNet: number }
interface Trend { year: number; series: TrendRow[]; totals: Omit<TrendRow, "month"> }

export function ConsolidatedReportClient() {
  const [year, setYear] = useState(CUR_YEAR);
  const [gran, setGran] = useState<Gran>("year");
  const [q, setQ] = useState(1);
  const [month, setMonth] = useState(new Date().getUTCMonth() + 1);

  const period = gran === "year" ? `${year}` : gran === "quarter" ? `${year}-Q${q}` : `${year}-${String(month).padStart(2, "0")}`;
  const c = useApi<Consolidated>(`/api/reports/consolidated?period=${period}`);
  const t = useApi<Trend>(`/api/reports/trend?year=${year}`);
  const d = c.data;

  return (
    <div className="space-y-4">
      {/* Bộ chọn kỳ */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white">
          {YEARS.map((y) => <option key={y} value={y}>Năm {y}</option>)}
        </select>
        <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
          {([["year", "Năm"], ["quarter", "Quý"], ["month", "Tháng"]] as [Gran, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setGran(k)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${gran === k ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}>{label}</button>
          ))}
        </div>
        {gran === "quarter" && (
          <select value={q} onChange={(e) => setQ(Number(e.target.value))} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white">
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>Quý {n}</option>)}
          </select>
        )}
        {gran === "month" && (
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Tháng {n}</option>)}
          </select>
        )}
        <button onClick={() => { c.refresh(); t.refresh(); }} className="p-2 text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg ml-auto"><RefreshCw size={14} /></button>
      </div>

      {c.loading || !d ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : (
        <>
          <p className="text-xs text-slate-500">Hợp nhất <span className="text-slate-300 font-medium">{d.label}</span> — gom realtime từ bán hàng, hợp đồng, chi phí, lương, ngân quỹ, công nợ, thuế.</p>

          {/* KQKD */}
          <Section title="Kết quả kinh doanh">
            <KPI label="Doanh thu" value={d.revenue.total} icon={TrendingUp} cls="text-emerald-400" sub={`Bán hàng ${vndC(d.revenue.sales)} · HĐ ${vndC(d.revenue.contracts)}`} />
            <KPI label="Chi phí" value={d.expense.total} icon={TrendingDown} cls="text-amber-400" sub={`Vận hành ${vndC(d.expense.recorded)} · Lương ${vndC(d.expense.payroll)}`} />
            <KPI label="Lợi nhuận (ước)" value={d.profit} icon={BarChart3} cls={d.profit >= 0 ? "text-emerald-400" : "text-red-400"} />
          </Section>

          {/* Dòng tiền & công nợ */}
          <Section title="Dòng tiền & công nợ">
            <KPI label="Dòng tiền ròng" value={d.cash.net} icon={Wallet} cls={d.cash.net >= 0 ? "text-green-400" : "text-red-400"} sub={`Thu ${vndC(d.cash.in)} · Chi ${vndC(d.cash.out)}`} />
            <KPI label="Phải thu cuối kỳ" value={d.receivable} icon={TrendingUp} cls="text-cyan-400" />
            <KPI label="Phải trả cuối kỳ" value={d.payable} icon={TrendingDown} cls="text-rose-400" />
          </Section>

          {/* Lương & thuế */}
          <Section title="Lương & thuế">
            <KPI label="Lương thực chi" value={d.payroll.net} icon={Wallet} cls="text-pink-400" sub={`BH NV ${vndC(d.payroll.insuranceEmployee)} · BH DN ${vndC(d.payroll.insuranceEmployer)}`} />
            <KPI label="Thuế TNCN (lương)" value={d.payroll.pit} icon={Landmark} cls="text-rose-300" />
            <KPI label="Thuế phải nộp (kỳ)" value={d.tax.payable} icon={Landmark} cls="text-rose-300" sub={Object.entries(d.tax.byType).map(([k, v]) => `${k.toUpperCase()} ${vndC(v)}`).join(" · ") || undefined} />
          </Section>

          {/* Đối chiếu với Sổ cái */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white mb-3"><ArrowRightLeft size={15} className="text-blue-400" /> Đối chiếu phân hệ ↔ Sổ cái (GL)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-slate-400 border-b border-slate-800 text-right">
                  <th className="py-2 px-3 text-left">Chỉ tiêu</th><th className="px-3">Phân hệ</th><th className="px-3">Sổ cái (GL)</th><th className="px-3">Chênh lệch</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-800/60">
                  <ReconRow label="Doanh thu" module={d.revenue.total} gl={d.gl.revenue} diff={d.reconciliation.revenueDiff} />
                  <ReconRow label="Chi phí" module={d.expense.total} gl={d.gl.expense} diff={d.reconciliation.expenseDiff} />
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 flex items-start gap-1.5"><AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" /> {d.reconciliation.note}</p>
          </div>

          {/* Xu hướng 12 tháng */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Xu hướng 12 tháng — Năm {year}</span>
              {t.data && <span className="text-xs text-slate-400">Cả năm: DT {vnd(t.data.totals.revenue)} · LN {vnd(t.data.totals.profit)}</span>}
            </div>
            {t.loading || !t.data ? <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-blue-500" /></div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-slate-400 border-b border-slate-800 text-right">
                    <th className="py-2 px-3 text-left">Tháng</th><th className="px-3">Doanh thu</th><th className="px-3">Chi phí</th><th className="px-3">Lợi nhuận</th><th className="px-3">Tiền ròng</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {t.data.series.map((r) => (
                      <tr key={r.month} className="text-right text-slate-300 hover:bg-slate-800/30">
                        <td className="py-1.5 px-3 text-left text-slate-400">T{Number(r.month.slice(5))}</td>
                        <td className="px-3 text-emerald-300">{r.revenue ? vnd(r.revenue) : "—"}</td>
                        <td className="px-3 text-amber-300">{r.expense ? vnd(r.expense) : "—"}</td>
                        <td className={`px-3 font-medium ${r.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{r.revenue || r.expense ? vnd(r.profit) : "—"}</td>
                        <td className={`px-3 ${r.cashNet >= 0 ? "text-green-400" : "text-red-400"}`}>{r.cashIn || r.cashOut ? vnd(r.cashNet) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="text-right font-semibold text-white border-t border-slate-700 bg-slate-900/60">
                    <td className="py-2 px-3 text-left">Cả năm</td>
                    <td className="px-3 text-emerald-300">{vnd(t.data.totals.revenue)}</td>
                    <td className="px-3 text-amber-300">{vnd(t.data.totals.expense)}</td>
                    <td className={`px-3 ${t.data.totals.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{vnd(t.data.totals.profit)}</td>
                    <td className={`px-3 ${t.data.totals.cashNet >= 0 ? "text-green-400" : "text-red-400"}`}>{vnd(t.data.totals.cashNet)}</td>
                  </tr></tfoot>
                </table>
              </div>
            )}
          </div>
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
function KPI({ label, value, sub, icon: Icon, cls }: { label: string; value: number; sub?: string; icon: React.ElementType; cls: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Icon size={12} className={cls} /> {label}</div>
      <div className={`text-base font-semibold mt-1 ${cls}`}>{vnd(value)}</div>
      {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
    </div>
  );
}
function ReconRow({ label, module, gl, diff }: { label: string; module: number; gl: number; diff: number }) {
  const matched = Math.abs(diff) < 1;
  return (
    <tr className="text-right text-slate-300">
      <td className="py-1.5 px-3 text-left">{label}</td>
      <td className="px-3">{vnd(module)}</td>
      <td className="px-3">{vnd(gl)}</td>
      <td className={`px-3 font-medium flex items-center justify-end gap-1 ${matched ? "text-emerald-400" : "text-amber-400"}`}>
        {matched ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}{vnd(diff)}
      </td>
    </tr>
  );
}
