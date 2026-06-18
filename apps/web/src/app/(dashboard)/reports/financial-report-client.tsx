"use client";

// src/app/(dashboard)/reports/financial-report-client.tsx
// Báo cáo tài chính TT200 theo QUÝ/NĂM — đọc GL đã ghi sổ qua /api/gl/reports/financial.
// 4 báo cáo: Cân đối kế toán (CĐKT) · Kết quả kinh doanh (KQKD) · Lưu chuyển tiền tệ (LCTT) · CĐSPS.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Download, Printer, AlertCircle } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api/client";

type Row = { code: string; name: string; amount: number };
type TbRow = { code: string; name: string; debit: number; credit: number };

interface FinancialReport {
  period: { year: number; quarter: number | null; label: string; from: string; to: string };
  balanceSheet: {
    assets: Row[]; liabilities: Row[]; equity: Row[];
    totalAssets: number; totalLiabilities: number; totalEquity: number; totalResources: number; balanced: boolean;
  };
  incomeStatement: { revenue: Row[]; expense: Row[]; totalRevenue: number; totalExpense: number; netIncome: number };
  cashFlow: { open: number; in: number; out: number; close: number; note: string };
  trialBalance: { rows: TbRow[]; totals: { debit: number; credit: number }; balanced: boolean };
}

const TABS = [
  { key: "cdkt", label: "Cân Đối Kế Toán" },
  { key: "kqkd", label: "Kết Quả KD" },
  { key: "lctt", label: "Lưu Chuyển Tiền Tệ" },
  { key: "cdps", label: "CĐ Số Phát Sinh" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const fmt = (n: number) =>
  n === 0 ? "—" : new Intl.NumberFormat("vi-VN").format(Math.round(n));

const NOW_YEAR = 2026;
const YEARS = [NOW_YEAR, NOW_YEAR - 1, NOW_YEAR - 2];

export function FinancialReportClient() {
  const [year, setYear] = useState(NOW_YEAR);
  const [quarter, setQuarter] = useState(0); // 0 = cả năm
  const [tab, setTab] = useState<TabKey>("cdkt");
  const [data, setData] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qp = quarter ? `&quarter=${quarter}` : "";
      const { data } = await apiFetch<FinancialReport>(`/api/gl/reports/financial?year=${year}${qp}`);
      setData(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không tải được báo cáo");
    } finally {
      setLoading(false);
    }
  }, [year, quarter]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    if (!data) return;
    const lines: string[] = [];
    const push = (cols: (string | number)[]) => lines.push(cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    push([`Báo cáo: ${TABS.find((t) => t.key === tab)?.label}`, data.period.label]);
    if (tab === "cdkt") {
      push(["TÀI SẢN", ""]); data.balanceSheet.assets.forEach((r) => push([`${r.code} ${r.name}`, r.amount]));
      push(["TỔNG TÀI SẢN", data.balanceSheet.totalAssets]);
      push(["NỢ PHẢI TRẢ", ""]); data.balanceSheet.liabilities.forEach((r) => push([`${r.code} ${r.name}`, r.amount]));
      push(["VỐN CHỦ SỞ HỮU", ""]); data.balanceSheet.equity.forEach((r) => push([`${r.code} ${r.name}`, r.amount]));
      push(["TỔNG NGUỒN VỐN", data.balanceSheet.totalResources]);
    } else if (tab === "kqkd") {
      push(["DOANH THU", ""]); data.incomeStatement.revenue.forEach((r) => push([`${r.code} ${r.name}`, r.amount]));
      push(["CHI PHÍ", ""]); data.incomeStatement.expense.forEach((r) => push([`${r.code} ${r.name}`, r.amount]));
      push(["LỢI NHUẬN", data.incomeStatement.netIncome]);
    } else if (tab === "lctt") {
      push(["Tiền đầu kỳ", data.cashFlow.open]); push(["Thu trong kỳ", data.cashFlow.in]);
      push(["Chi trong kỳ", data.cashFlow.out]); push(["Tiền cuối kỳ", data.cashFlow.close]);
    } else {
      push(["Mã TK", "Tên TK", "Nợ", "Có"]);
      data.trialBalance.rows.forEach((r) => push([r.code, r.name, r.debit, r.credit]));
      push(["TỔNG", "", data.trialBalance.totals.debit, data.trialBalance.totals.credit]);
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `BCTC_${tab}_${data.period.label.replace(/[/ ]/g, "-")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-slate-800 print:hidden">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200">
          {YEARS.map((y) => <option key={y} value={y}>Năm {y}</option>)}
        </select>
        <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-0.5">
          {[0, 1, 2, 3, 4].map((qv) => (
            <button key={qv} onClick={() => setQuarter(qv)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${quarter === qv ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white"}`}>
              {qv === 0 ? "Cả năm" : `Q${qv}`}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={exportCsv} disabled={!data}
          className="flex items-center gap-1.5 text-xs text-slate-300 px-3 py-1.5 border border-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-40">
          <Download size={13} /> CSV/Excel
        </button>
        <button onClick={() => window.print()} disabled={!data}
          className="flex items-center gap-1.5 text-xs text-slate-300 px-3 py-1.5 border border-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-40">
          <Printer size={13} /> In / PDF
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 pt-3 border-b border-slate-800 overflow-x-auto print:hidden">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.key ? "border-cyan-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {data && (
          <p className="text-xs text-slate-500 mb-4">
            Kỳ: <span className="text-slate-300 font-medium">{data.period.label}</span> ({data.period.from} → {data.period.to}) ·
            Nguồn: bút toán đã ghi sổ
          </p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 py-10 justify-center"><Loader2 size={16} className="animate-spin" /> Đang tổng hợp…</div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-400 py-10 justify-center"><AlertCircle size={16} /> {error}</div>
        ) : !data ? null : tab === "cdkt" ? (
          <BalanceSheet d={data.balanceSheet} />
        ) : tab === "kqkd" ? (
          <IncomeStatement d={data.incomeStatement} />
        ) : tab === "lctt" ? (
          <CashFlow d={data.cashFlow} />
        ) : (
          <TrialBalance d={data.trialBalance} />
        )}
      </div>
    </div>
  );
}

function Amount({ v }: { v: number }) {
  return <span className={`tabular-nums ${v < 0 ? "text-red-400" : "text-slate-200"}`}>{fmt(v)}</span>;
}

function Section({ title, rows, total, totalLabel }: { title: string; rows: Row[]; total: number; totalLabel: string }) {
  return (
    <div className="mb-5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-cyan-400 mb-2">{title}</h4>
      <table className="w-full text-sm">
        <tbody>
          {rows.length === 0 && <tr><td className="text-slate-600 py-1">— Không có số liệu —</td></tr>}
          {rows.map((r) => (
            <tr key={r.code} className="border-b border-slate-800/60">
              <td className="py-1.5 text-slate-500 w-16">{r.code}</td>
              <td className="py-1.5 text-slate-300">{r.name}</td>
              <td className="py-1.5 text-right"><Amount v={r.amount} /></td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td colSpan={2} className="py-2 text-slate-200">{totalLabel}</td>
            <td className="py-2 text-right text-white tabular-nums">{fmt(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BalanceSheet({ d }: { d: FinancialReport["balanceSheet"] }) {
  return (
    <div>
      <Section title="Tài sản" rows={d.assets} total={d.totalAssets} totalLabel="TỔNG CỘNG TÀI SẢN" />
      <Section title="Nợ phải trả" rows={d.liabilities} total={d.totalLiabilities} totalLabel="Cộng nợ phải trả" />
      <Section title="Vốn chủ sở hữu" rows={d.equity} total={d.totalEquity} totalLabel="Cộng vốn chủ sở hữu" />
      <div className="flex items-center justify-between border-t border-slate-700 pt-3 font-semibold">
        <span className="text-slate-200">TỔNG CỘNG NGUỒN VỐN</span>
        <span className="text-white tabular-nums">{fmt(d.totalResources)}</span>
      </div>
      <p className={`mt-3 text-xs ${d.balanced ? "text-emerald-400" : "text-amber-400"}`}>
        {d.balanced ? "✓ Cân đối: Tổng tài sản = Tổng nguồn vốn" : "⚠ Chưa cân đối — kiểm tra bút toán/kết chuyển"}
      </p>
    </div>
  );
}

function IncomeStatement({ d }: { d: FinancialReport["incomeStatement"] }) {
  return (
    <div>
      <Section title="Doanh thu & thu nhập" rows={d.revenue} total={d.totalRevenue} totalLabel="Tổng doanh thu" />
      <Section title="Chi phí" rows={d.expense} total={d.totalExpense} totalLabel="Tổng chi phí" />
      <div className="flex items-center justify-between border-t border-slate-700 pt-3 font-semibold">
        <span className="text-slate-200">LỢI NHUẬN (trước thuế)</span>
        <span className={`tabular-nums ${d.netIncome < 0 ? "text-red-400" : "text-emerald-400"}`}>{fmt(d.netIncome)}</span>
      </div>
    </div>
  );
}

function CashFlow({ d }: { d: FinancialReport["cashFlow"] }) {
  const line = (label: string, v: number, strong = false) => (
    <div className={`flex items-center justify-between py-2 border-b border-slate-800/60 ${strong ? "font-semibold text-white" : "text-slate-300"}`}>
      <span>{label}</span><span className="tabular-nums">{fmt(v)}</span>
    </div>
  );
  return (
    <div className="text-sm">
      {line("Tiền & tương đương tiền đầu kỳ", d.open)}
      {line("Tổng tiền thu trong kỳ", d.in)}
      {line("Tổng tiền chi trong kỳ", -d.out)}
      {line("Lưu chuyển tiền thuần", d.in - d.out, true)}
      {line("Tiền & tương đương tiền cuối kỳ", d.close, true)}
      <p className="text-xs text-slate-500 mt-3">{d.note}</p>
    </div>
  );
}

function TrialBalance({ d }: { d: FinancialReport["trialBalance"] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-slate-500 border-b border-slate-800">
          <th className="text-left py-2 font-medium w-20">Mã TK</th>
          <th className="text-left py-2 font-medium">Tên tài khoản</th>
          <th className="text-right py-2 font-medium">Phát sinh Nợ</th>
          <th className="text-right py-2 font-medium">Phát sinh Có</th>
        </tr>
      </thead>
      <tbody>
        {d.rows.length === 0 && <tr><td colSpan={4} className="text-slate-600 py-3">— Không có phát sinh trong kỳ —</td></tr>}
        {d.rows.map((r) => (
          <tr key={r.code} className="border-b border-slate-800/60">
            <td className="py-1.5 text-slate-500">{r.code}</td>
            <td className="py-1.5 text-slate-300">{r.name}</td>
            <td className="py-1.5 text-right tabular-nums text-slate-200">{fmt(r.debit)}</td>
            <td className="py-1.5 text-right tabular-nums text-slate-200">{fmt(r.credit)}</td>
          </tr>
        ))}
        <tr className="font-semibold text-white">
          <td colSpan={2} className="py-2">TỔNG CỘNG</td>
          <td className="py-2 text-right tabular-nums">{fmt(d.totals.debit)}</td>
          <td className="py-2 text-right tabular-nums">{fmt(d.totals.credit)}</td>
        </tr>
      </tbody>
    </table>
  );
}
