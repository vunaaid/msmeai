"use client";

// src/app/(dashboard)/accounting/cash-flow-plan.tsx
// Dòng tiền hợp nhất: HỢP ĐỒNG (lịch thanh toán) + LƯƠNG (chi phí nhân sự).
//  - Dự kiến: phần chưa thu/chi của HĐ đã duyệt + lương các tháng tới.
//  - Thật: phần đã thu/chi của HĐ + bảng lương đã chi.
// Nguồn: /api/contracts/cash-flow-plan + /api/hr/payroll-forecast.

import { useState } from "react";
import { Loader2, TrendingUp, TrendingDown, Wallet, Users } from "lucide-react";
import { useApi } from "@/lib/api/client";

type Period = "month" | "quarter" | "year";
interface GroupRow { key: string; label: string; projIn: number; projOut: number; actIn: number; actOut: number }

interface PlanItem {
  id: string; flow: "in" | "out"; dueDate: string | null; amount: number; remaining: number; status: string;
}
interface ContractPlan { items: PlanItem[] }
interface PayrollForecast {
  headcount: number; monthlyProjected: number;
  actual: { month: string; amount: number }[];
  projected: { month: string; amount: number }[];
}

interface MonthRow {
  month: string;
  projIn: number; projOut: number;   // dự kiến
  actIn: number; actOut: number;     // thật
}

const vnd = (n: number) => `${Math.round(n ?? 0).toLocaleString("vi-VN")} đ`;

export function CashFlowPlan() {
  const [period, setPeriod] = useState<Period>("month");
  const plan = useApi<ContractPlan>("/api/contracts/cash-flow-plan");
  const pay = useApi<PayrollForecast>("/api/hr/payroll-forecast?months=12");

  if (plan.loading || pay.loading) return <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm"><Loader2 className="animate-spin" /> Đang tải…</div>;

  const map = new Map<string, MonthRow>();
  const row = (m: string) => {
    let r = map.get(m);
    if (!r) { r = { month: m, projIn: 0, projOut: 0, actIn: 0, actOut: 0 }; map.set(m, r); }
    return r;
  };

  // Hợp đồng: phần còn lại = dự kiến; phần đã thanh toán (amount - remaining) = thật.
  for (const it of plan.data?.items ?? []) {
    const m = it.dueDate ? it.dueDate.slice(0, 7) : "—";
    const paid = Math.max(0, (it.amount ?? 0) - (it.remaining ?? 0));
    const r = row(m);
    if (it.flow === "in") { r.projIn += it.remaining ?? 0; r.actIn += paid; }
    else { r.projOut += it.remaining ?? 0; r.actOut += paid; }
  }
  // Lương: dự kiến (tháng tới) + thật (bảng đã chi).
  for (const p of pay.data?.projected ?? []) row(p.month).projOut += p.amount;
  for (const a of pay.data?.actual ?? []) row(a.month).actOut += a.amount;

  const months = [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  const tProjIn = months.reduce((s, r) => s + r.projIn, 0);
  const tProjOut = months.reduce((s, r) => s + r.projOut, 0);
  const tActIn = months.reduce((s, r) => s + r.actIn, 0);
  const tActOut = months.reduce((s, r) => s + r.actOut, 0);

  // Gom theo tháng / quý / năm.
  const bucketOf = (m: string): { key: string; label: string } => {
    if (m === "—") return { key: "—", label: "Chưa có hạn" };
    const parts = m.split("-");
    const y = parts[0] ?? "", mo = parts[1] ?? "";
    if (period === "year") return { key: y, label: `Năm ${y}` };
    if (period === "quarter") { const qn = Math.ceil(Number(mo) / 3); return { key: `${y}-Q${qn}`, label: `Q${qn}/${y}` }; }
    return { key: m, label: `Th${Number(mo)}/${y}` };
  };
  const gmap = new Map<string, GroupRow>();
  for (const r of months) {
    const b = bucketOf(r.month);
    let g = gmap.get(b.key);
    if (!g) { g = { key: b.key, label: b.label, projIn: 0, projOut: 0, actIn: 0, actOut: 0 }; gmap.set(b.key, g); }
    g.projIn += r.projIn; g.projOut += r.projOut; g.actIn += r.actIn; g.actOut += r.actOut;
  }
  const rows = [...gmap.values()].sort((a, b) => a.key.localeCompare(b.key));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="w-5 h-5 text-green-400" />
        <div>
          <h2 className="text-base font-semibold text-white">Dòng tiền hợp nhất</h2>
          <p className="text-xs text-slate-500">Hợp đồng (đã duyệt) + lương nhân sự · {pay.data?.headcount ?? 0} NV · lương DK {vnd(pay.data?.monthlyProjected ?? 0)}/tháng</p>
        </div>
      </div>

      {/* Tổng quan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Thu dự kiến" value={tProjIn} cls="text-cyan-400" icon={TrendingUp} />
        <Card label="Chi dự kiến" value={tProjOut} cls="text-amber-400" icon={TrendingDown} />
        <Card label="Đã thu (thật)" value={tActIn} cls="text-emerald-400" icon={TrendingUp} />
        <Card label="Đã chi (thật)" value={tActOut} cls="text-red-400" icon={TrendingDown} />
      </div>

      {/* Toggle kỳ: Tháng / Quý / Năm */}
      <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg w-fit">
        {([["month", "Tháng"], ["quarter", "Quý"], ["year", "Năm"]] as [Period, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setPeriod(k)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${period === k ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}>{label}</button>
        ))}
      </div>

      {months.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500">Chưa có dữ liệu dòng tiền. Tạo hợp đồng có lịch thanh toán hoặc bảng lương.</div>
      ) : (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800 text-right">
                <th className="py-2.5 px-3 text-left">Kỳ</th>
                <th className="px-2">Thu DK</th><th className="px-2">Chi DK</th><th className="px-2">Net DK</th>
                <th className="px-2 border-l border-slate-800">Thu thật</th><th className="px-2">Chi thật</th><th className="px-3">Net thật</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.map((r) => {
                const netDk = r.projIn - r.projOut;
                const netThat = r.actIn - r.actOut;
                return (
                  <tr key={r.key} className="text-right text-slate-300">
                    <td className="py-2 px-3 text-left text-slate-200">{r.label}</td>
                    <td className="px-2 text-cyan-300">{r.projIn ? vnd(r.projIn) : "—"}</td>
                    <td className="px-2 text-amber-300">{r.projOut ? vnd(r.projOut) : "—"}</td>
                    <td className={`px-2 font-medium ${netDk >= 0 ? "text-emerald-300" : "text-red-300"}`}>{vnd(netDk)}</td>
                    <td className="px-2 border-l border-slate-800 text-emerald-300">{r.actIn ? vnd(r.actIn) : "—"}</td>
                    <td className="px-2 text-red-300">{r.actOut ? vnd(r.actOut) : "—"}</td>
                    <td className={`px-3 font-medium ${netThat >= 0 ? "text-emerald-300" : "text-red-300"}`}>{vnd(netThat)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="text-right font-semibold text-white border-t border-slate-700">
                <td className="py-2.5 px-3 text-left">Tổng</td>
                <td className="px-2 text-cyan-300">{vnd(tProjIn)}</td>
                <td className="px-2 text-amber-300">{vnd(tProjOut)}</td>
                <td className={`px-2 ${tProjIn - tProjOut >= 0 ? "text-emerald-300" : "text-red-300"}`}>{vnd(tProjIn - tProjOut)}</td>
                <td className="px-2 border-l border-slate-800 text-emerald-300">{vnd(tActIn)}</td>
                <td className="px-2 text-red-300">{vnd(tActOut)}</td>
                <td className={`px-3 ${tActIn - tActOut >= 0 ? "text-emerald-300" : "text-red-300"}`}>{vnd(tActIn - tActOut)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-[11px] text-slate-600 flex items-center gap-1.5">
        <Users size={12} /> Chi lương = chi phí doanh nghiệp (gross + BHXH phần DN đóng). Dự kiến lấy theo nhân viên đang làm việc; thật lấy theo bảng lương đã chi.
      </p>
    </div>
  );
}

function Card({ label, value, cls, icon: Icon }: { label: string; value: number; cls: string; icon: React.ElementType }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Icon size={12} className={cls} /> {label}</div>
      <div className={`text-base font-semibold mt-1 ${cls}`}>{vnd(value)}</div>
    </div>
  );
}
