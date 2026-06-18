"use client";

// src/app/(dashboard)/dashboard/_widgets/finance.tsx
// Cụm Tài Chính — dữ liệu GL THẬT từ /api/gl/reports/financial (bút toán đã posted).
// Báo cáo tài chính được fetch MỘT lần qua FinanceProvider rồi chia sẻ cho các widget.

import { createContext, useContext, useEffect, useState } from "react";
import {
  TrendingUp, Scale, Wallet, BarChart3, FileClock, ShieldAlert, CheckCircle2,
  PieChart as PieChartIcon,
} from "lucide-react";
import { apiFetch, useApi, type ApiMeta } from "@/lib/api/client";
import { Card, State, Row, Kpi, Badge, vndShort, vndFull, fmtDate } from "./ui";
import { LineChart, PieChart, CHART_PALETTE, type LineSeries } from "./charts";

interface AcctLine { code: string; name: string; amount: number }
interface Financial {
  period: { year: number; quarter: number | null; label: string; from: string; to: string };
  balanceSheet: {
    totalAssets: number; totalLiabilities: number; totalEquity: number;
    totalResources: number; balanced: boolean;
    assets: AcctLine[]; liabilities: AcctLine[]; equity: AcctLine[];
  };
  incomeStatement: {
    totalRevenue: number; totalExpense: number; netIncome: number;
    revenue: AcctLine[]; expense: AcctLine[];
  };
  cashFlow: { open: number; in: number; out: number; close: number; note: string };
  trialBalance: { balanced: boolean };
}

interface GlEntry {
  id: string; number: string; date: string; description?: string | null;
  status: string; totalDebit: number; totalCredit: number;
  journal?: { code: string; name: string } | null;
}

// ─── Provider chia sẻ báo cáo tài chính ──────────────────────────────────────

interface FinanceState { data: Financial | null; loading: boolean; error: string | null }
const FinanceCtx = createContext<FinanceState>({ data: null, loading: true, error: null });

export function FinanceProvider({ year, children }: { year: number; children: React.ReactNode }) {
  const { data, loading, error } = useApi<Financial>(`/api/gl/reports/financial?year=${year}`);
  return <FinanceCtx.Provider value={{ data, loading, error }}>{children}</FinanceCtx.Provider>;
}

function useFinance() {
  return useContext(FinanceCtx);
}

// ─── Widgets ─────────────────────────────────────────────────────────────────

export function FinanceSnapshotWidget() {
  const { data, loading, error } = useFinance();
  const is = data?.incomeStatement;
  return (
    <Card title="Kết quả kinh doanh kỳ này" icon={<TrendingUp size={16} />} href="/accounting" accent="text-emerald-400" count={data?.period.label}>
      <State loading={loading} error={error} empty={!is}>
        {is && (
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Doanh thu" value={vndShort(is.totalRevenue)} tone="text-emerald-400" />
            <Kpi label="Chi phí" value={vndShort(is.totalExpense)} tone="text-amber-400" />
            <Kpi
              label="Lợi nhuận"
              value={vndShort(is.netIncome)}
              tone={is.netIncome >= 0 ? "text-emerald-400" : "text-red-400"}
            />
          </div>
        )}
      </State>
    </Card>
  );
}

export function BalanceSheetWidget() {
  const { data, loading, error } = useFinance();
  const bs = data?.balanceSheet;
  return (
    <Card title="Bảng cân đối kế toán" icon={<Scale size={16} />} href="/accounting" accent="text-sky-400">
      <State loading={loading} error={error} empty={!bs}>
        {bs && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Tổng tài sản" value={vndShort(bs.totalAssets)} tone="text-sky-400" />
              <Kpi label="Nợ phải trả" value={vndShort(bs.totalLiabilities)} tone="text-amber-400" />
              <Kpi label="Vốn chủ sở hữu" value={vndShort(bs.totalEquity)} tone="text-emerald-400" />
            </div>
            <div className="mt-3">
              {bs.balanced ? (
                <Badge tone="bg-emerald-500/15 text-emerald-400">Cân đối ✓ (TS = NV)</Badge>
              ) : (
                <Badge tone="bg-red-500/15 text-red-400">Lệch cân đối — kiểm tra bút toán</Badge>
              )}
            </div>
          </>
        )}
      </State>
    </Card>
  );
}

export function CashPositionWidget() {
  const { data, loading, error } = useFinance();
  const cf = data?.cashFlow;
  return (
    <Card title="Tiền mặt & ngân hàng" icon={<Wallet size={16} />} href="/accounting" accent="text-cyan-400">
      <State loading={loading} error={error} empty={!cf}>
        {cf && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Đầu kỳ" value={vndShort(cf.open)} />
              <Kpi label="Thu / Chi" value={<span className="text-emerald-400">+{vndShort(cf.in)}</span>} sub={<span className="text-red-400">-{vndShort(cf.out)}</span>} />
              <Kpi label="Cuối kỳ" value={vndShort(cf.close)} tone="text-cyan-400" />
            </div>
            <p className="text-[11px] text-slate-500 mt-2" title={vndFull(cf.close)}>{cf.note}</p>
          </>
        )}
      </State>
    </Card>
  );
}

// Line chart — Doanh thu / Chi phí / Lợi nhuận theo 4 quý (mỗi quý 1 lần gọi).
export function ProfitTrendWidget({ year }: { year: number }) {
  const [rows, setRows] = useState<{ rev: number; exp: number; net: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all(
      [1, 2, 3, 4].map((q) =>
        apiFetch<Financial>(`/api/gl/reports/financial?year=${year}&quarter=${q}`)
          .then((r) => {
            const is = r.data?.incomeStatement;
            return { rev: is?.totalRevenue ?? 0, exp: is?.totalExpense ?? 0, net: is?.netIncome ?? 0 };
          })
          .catch(() => ({ rev: 0, exp: 0, net: 0 }))
      )
    )
      .then((res) => { if (alive) setRows(res); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu"); });
    return () => { alive = false; };
  }, [year]);

  const series: LineSeries[] = rows
    ? [
        { label: "Doanh thu", color: "#34d399", values: rows.map((r) => r.rev) },
        { label: "Chi phí", color: "#fbbf24", values: rows.map((r) => r.exp) },
        { label: "Lợi nhuận", color: "#38bdf8", values: rows.map((r) => r.net) },
      ]
    : [];

  return (
    <Card title={`Xu hướng tài chính theo quý ${year}`} icon={<BarChart3 size={16} />} href="/accounting" accent="text-indigo-400">
      <State loading={!rows && !error} error={error} empty={false}>
        {rows && <LineChart series={series} categories={["Q1", "Q2", "Q3", "Q4"]} format={vndFull} />}
      </State>
    </Card>
  );
}

// Pie chart — cơ cấu chi phí kỳ này (top 6 tài khoản + "Khác").
export function ExpensePieWidget() {
  const { data, loading, error } = useFinance();
  const expense = data?.incomeStatement.expense ?? [];

  const sorted = [...expense].filter((e) => e.amount > 0).sort((a, b) => b.amount - a.amount);
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6).reduce((s, e) => s + e.amount, 0);
  const pie = [
    ...top.map((e, i) => ({ label: `${e.code} ${e.name}`, value: e.amount, color: CHART_PALETTE[i]! })),
    ...(rest > 0 ? [{ label: "Khác", value: rest, color: CHART_PALETTE[9]! }] : []),
  ];

  return (
    <Card title="Cơ cấu chi phí" icon={<PieChartIcon size={16} />} href="/accounting" accent="text-pink-400" count={data ? vndShort(data.incomeStatement.totalExpense) : undefined}>
      <State loading={loading} error={error} empty={false}>
        <PieChart data={pie} />
      </State>
    </Card>
  );
}

export function PendingGlWidget() {
  const { data, meta, loading, error } = useApi<GlEntry[]>("/api/gl/entries?status=pending&limit=6");
  const items = data ?? [];
  return (
    <Card title="Bút toán chờ ghi sổ" icon={<FileClock size={16} />} href="/accounting" count={meta?.total} accent="text-amber-400">
      <State loading={loading} error={error} empty={items.length === 0} emptyText="Không có bút toán chờ duyệt">
        {items.map((e) => (
          <Row
            key={e.id}
            href="/accounting"
            title={`${e.number} · ${e.description ?? e.journal?.name ?? ""}`}
            meta={fmtDate(e.date)}
            right={<Badge tone="bg-amber-500/15 text-amber-400">{vndShort(e.totalDebit)}</Badge>}
          />
        ))}
      </State>
    </Card>
  );
}

export function GlHealthWidget() {
  const { data, loading, error } = useFinance();
  const pending = useApi<GlEntry[]>("/api/gl/entries?status=pending&limit=1");
  const pendingTotal = (pending.meta as ApiMeta | null)?.total ?? 0;

  const alerts: { tone: string; icon: React.ReactNode; text: string }[] = [];
  if (data) {
    if (!data.balanceSheet.balanced)
      alerts.push({ tone: "text-red-400", icon: <ShieldAlert size={14} />, text: "Bảng cân đối kế toán đang lệch (TS ≠ NV)" });
    if (!data.trialBalance.balanced)
      alerts.push({ tone: "text-red-400", icon: <ShieldAlert size={14} />, text: "Cân đối phát sinh (CĐPS) đang lệch Nợ/Có" });
  }
  if (pendingTotal > 0)
    alerts.push({ tone: "text-amber-400", icon: <FileClock size={14} />, text: `${pendingTotal} bút toán đang chờ ghi sổ` });

  const healthy = !loading && !error && alerts.length === 0;

  return (
    <Card title="Cảnh báo sổ sách" icon={<ShieldAlert size={16} />} accent="text-rose-400">
      <State loading={loading && pending.loading} error={error} empty={false}>
        {healthy ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400 py-1">
            <CheckCircle2 size={16} /> Sổ sách cân đối, không có cảnh báo.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {alerts.map((a, i) => (
              <li key={i} className={`flex items-center gap-2 text-sm ${a.tone}`}>
                {a.icon}
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        )}
      </State>
    </Card>
  );
}
