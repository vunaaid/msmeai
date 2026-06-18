"use client";

// src/app/(dashboard)/tax/tax-client.tsx
// Thuế — cấu hình + tự tính GTGT/TNDN/TNCN + tờ khai + cảnh báo hạn nộp.

import { useState } from "react";
import { Landmark, RefreshCw, Loader2, X, Trash2, Calculator, AlertTriangle, Wallet, Settings2, CheckCircle2, FileCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useApi, apiSend } from "@/lib/api/client";
import { TaxAssistant } from "./tax-assistant";

type TaxType = "vat" | "cit" | "pit";
type RStatus = "draft" | "filed" | "paid";
interface TaxReturn {
  id: string; type: TaxType; period: string; revenue: number; deductible: number;
  outputTax: number; inputTax: number; taxableIncome: number; rate: number; payable: number;
  dueDate: string | null; status: RStatus; note: string | null;
}
interface Setting {
  businessType: string | null; industry: string | null; vatMethod: "deduction" | "direct";
  vatDirectRate: number; citRate: number; citIncentiveRate: number | null; incentiveNote: string | null;
  incentiveStartDate: string | null; incentiveYearsExempt: number; incentiveYearsReduced: number;
  lossCarryforward: number;
}
interface Stats { unpaidTotal: number; overdueTotal: number; upcoming: TaxReturn[] }

const vnd = (n: number) => `${Math.round(n ?? 0).toLocaleString("vi-VN")} đ`;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("vi-VN") : "—");
const TYPE: Record<TaxType, string> = { vat: "GTGT", cit: "TNDN", pit: "TNCN" };
const RST: Record<RStatus, { label: string; cls: string }> = {
  draft: { label: "Nháp", cls: "text-slate-400 bg-slate-800/40 border-slate-700/40" },
  filed: { label: "Đã nộp tờ khai", cls: "text-cyan-400 bg-cyan-900/20 border-cyan-800/40" },
  paid:  { label: "Đã nộp tiền", cls: "text-emerald-400 bg-emerald-900/20 border-emerald-800/40" },
};
const isOverdue = (r: TaxReturn) => r.status !== "paid" && r.dueDate != null && new Date(r.dueDate).getTime() < Date.now();

export function TaxClient({ canManage, roleName, roleLevel }: { canManage: boolean; roleName: string | null; roleLevel: string | null }) {
  const returns = useApi<TaxReturn[]>("/api/tax/returns");
  const stats = useApi<Stats>("/api/tax/stats");
  const setting = useApi<Setting>("/api/tax/settings");
  const [settingOpen, setSettingOpen] = useState(false);
  const [computeOpen, setComputeOpen] = useState(false);
  const refreshAll = () => { returns.refresh(); stats.refresh(); };

  const setStatus = async (r: TaxReturn, status: RStatus) => {
    try { await apiSend(`/api/tax/returns/${r.id}`, "PATCH", { status }); refreshAll(); }
    catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); }
  };

  return (
    <div className="max-w-[1500px] mx-auto px-4 py-6">
      <PageHeader icon={Landmark} iconColor="text-rose-400" title="Khai Báo Thuế" subtitle="GTGT · TNDN · TNCN · tự tính + lịch nộp" />

      <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
        <div className="lg:flex-[3] min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Phải nộp (chưa nộp)" value={stats.data?.unpaidTotal ?? 0} cls="text-rose-300" icon={Wallet} />
            <Stat label="Quá hạn" value={stats.data?.overdueTotal ?? 0} cls="text-red-400" icon={AlertTriangle} />
          </div>

          {/* Cấu hình tóm tắt */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap text-xs">
            <span className="text-slate-400">Cấu hình:</span>
            <span className="text-slate-200">{setting.data?.businessType || "—"}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-300">GTGT: {setting.data?.vatMethod === "direct" ? `Trực tiếp ${setting.data?.vatDirectRate}%` : "Khấu trừ"}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-300">TNDN: {setting.data?.citIncentiveRate != null ? <span className="text-emerald-300">{setting.data.citIncentiveRate}% (ưu đãi)</span> : `${setting.data?.citRate ?? 20}%`}</span>
            {setting.data?.industry && <><span className="text-slate-500">·</span><span className="text-slate-400">{setting.data.industry}</span></>}
            {canManage && <button onClick={() => setSettingOpen(true)} className="ml-auto flex items-center gap-1 text-cyan-400 hover:text-cyan-300"><Settings2 size={13} /> Sửa</button>}
          </div>

          <div className="flex items-center justify-end gap-2">
            {canManage && (
              <button onClick={() => setComputeOpen(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white rounded-lg">
                <Calculator size={15} /> Tự tính kỳ
              </button>
            )}
            <button onClick={refreshAll} className="p-2 text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg"><RefreshCw size={14} /></button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[260px]">
            {returns.loading ? <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-rose-500" /></div>
            : (returns.data ?? []).length === 0 ? <div className="flex flex-col items-center justify-center py-16 text-slate-500"><Landmark size={28} className="mb-3 opacity-40" /><p className="text-sm">Chưa có tờ khai — bấm "Tự tính kỳ"</p></div>
            : (
              <div className="divide-y divide-slate-800">
                {(returns.data ?? []).map((r) => {
                  const overdue = isOverdue(r);
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 w-14 text-center flex-shrink-0">{TYPE[r.type]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-200">Kỳ {r.period}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${overdue ? "text-red-400 bg-red-900/20 border-red-800/40" : RST[r.status].cls}`}>{overdue ? "Quá hạn" : RST[r.status].label}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                          <span>Hạn: {fmt(r.dueDate)}</span>
                          {r.type === "vat" && r.outputTax > 0 && <span>Đầu ra {vnd(r.outputTax)} − Vào {vnd(r.inputTax)}</span>}
                          {r.type === "cit" && <span>TNCT {vnd(r.taxableIncome)} × {r.rate}%</span>}
                        </div>
                      </div>
                      <div className="text-right"><div className="text-sm font-semibold text-rose-300">{vnd(r.payable)}</div><div className="text-[10px] text-slate-600">phải nộp</div></div>
                      {canManage && (
                        <div className="flex items-center gap-1.5">
                          {r.status === "draft" && <button onClick={() => setStatus(r, "filed")} title="Đánh dấu đã nộp tờ khai" className="p-1.5 text-slate-500 hover:text-cyan-400"><FileCheck size={15} /></button>}
                          {r.status !== "paid" && <button onClick={() => setStatus(r, "paid")} title="Đánh dấu đã nộp tiền" className="p-1.5 text-slate-500 hover:text-emerald-400"><CheckCircle2 size={15} /></button>}
                          <button onClick={async () => { if (confirm(`Xóa tờ khai ${TYPE[r.type]} ${r.period}?`)) { try { await apiSend(`/api/tax/returns/${r.id}`, "DELETE"); refreshAll(); } catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); } } }}
                            className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:flex-1 min-w-0">
          <TaxAssistant roleName={roleName} roleLevel={roleLevel} />
        </div>
      </div>

      {settingOpen && setting.data && <SettingModal value={setting.data} onClose={() => setSettingOpen(false)} onSaved={() => { setSettingOpen(false); setting.refresh(); refreshAll(); }} />}
      {computeOpen && <ComputeModal onClose={() => setComputeOpen(false)} onDone={() => { setComputeOpen(false); refreshAll(); }} />}
    </div>
  );
}

function Stat({ label, value, cls, icon: Icon }: { label: string; value: number; cls: string; icon: React.ElementType }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Icon size={12} className={cls} /> {label}</div>
      <div className={`text-base font-semibold mt-1 ${cls}`}>{vnd(value)}</div>
    </div>
  );
}

const inp = "w-full px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/40";
function Field({ label, cls, children }: { label: string; cls?: string; children: React.ReactNode }) {
  return <label className={`block space-y-1 ${cls ?? ""}`}><span className="text-xs font-medium text-slate-300">{label}</span>{children}</label>;
}
function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function SettingModal({ value, onClose, onSaved }: { value: Setting; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    businessType: value.businessType ?? "", industry: value.industry ?? "",
    vatMethod: value.vatMethod, vatDirectRate: (value.vatDirectRate ?? 0).toString(),
    citRate: (value.citRate ?? 20).toString(), citIncentiveRate: value.citIncentiveRate?.toString() ?? "",
    incentiveNote: value.incentiveNote ?? "",
    incentiveStartDate: value.incentiveStartDate ? value.incentiveStartDate.slice(0, 10) : "",
    incentiveYearsExempt: (value.incentiveYearsExempt ?? 0).toString(),
    incentiveYearsReduced: (value.incentiveYearsReduced ?? 0).toString(),
    lossCarryforward: (value.lossCarryforward ?? 0).toString(),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setSaving(true); setErr(null);
    const body = {
      businessType: f.businessType || null, industry: f.industry || null, vatMethod: f.vatMethod,
      vatDirectRate: Number(f.vatDirectRate) || 0, citRate: Number(f.citRate) || 20,
      citIncentiveRate: f.citIncentiveRate ? Number(f.citIncentiveRate) : null, incentiveNote: f.incentiveNote || null,
      incentiveStartDate: f.incentiveStartDate || null,
      incentiveYearsExempt: Number(f.incentiveYearsExempt) || 0,
      incentiveYearsReduced: Number(f.incentiveYearsReduced) || 0,
      lossCarryforward: Number(f.lossCarryforward) || 0,
    };
    try { await apiSend("/api/tax/settings", "PUT", body); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); } finally { setSaving(false); }
  };
  return (
    <Shell title="Cấu hình thuế" onClose={onClose}>
      {err && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{err}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Loại hình DN"><input className={inp} value={f.businessType} onChange={(e) => setF({ ...f, businessType: e.target.value })} placeholder="TNHH / CP / DNTN" /></Field>
        <Field label="Ngành nghề"><input className={inp} value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} /></Field>
        <Field label="PP tính GTGT">
          <select className={inp} value={f.vatMethod} onChange={(e) => setF({ ...f, vatMethod: e.target.value as "deduction" | "direct" })}>
            <option value="deduction">Khấu trừ</option><option value="direct">Trực tiếp</option>
          </select>
        </Field>
        <Field label="Thuế suất trực tiếp (%)"><input type="number" className={inp} value={f.vatDirectRate} onChange={(e) => setF({ ...f, vatDirectRate: e.target.value })} placeholder="1/3/5" /></Field>
        <Field label="Thuế suất TNDN chuẩn (%)"><input type="number" className={inp} value={f.citRate} onChange={(e) => setF({ ...f, citRate: e.target.value })} placeholder="20" /></Field>
        <Field label="TNDN ưu đãi (%) — nếu có"><input type="number" className={inp} value={f.citIncentiveRate} onChange={(e) => setF({ ...f, citIncentiveRate: e.target.value })} placeholder="10/15/17" /></Field>
        <Field label="Căn cứ ưu đãi ngành nghề" cls="col-span-2"><textarea className={inp} rows={2} value={f.incentiveNote} onChange={(e) => setF({ ...f, incentiveNote: e.target.value })} /></Field>
        <div className="col-span-2 pt-2 border-t border-slate-800">
          <p className="text-xs text-slate-500 mb-2">Kỳ ưu đãi đầu tư (Điều 13 NĐ218/2013 & NĐ12/2023)</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Ngày bắt đầu ưu đãi"><input type="date" className={inp} value={f.incentiveStartDate} onChange={(e) => setF({ ...f, incentiveStartDate: e.target.value })} /></Field>
            <Field label="Năm miễn thuế (0%)"><input type="number" min="0" max="9" className={inp} value={f.incentiveYearsExempt} onChange={(e) => setF({ ...f, incentiveYearsExempt: e.target.value })} placeholder="4" /></Field>
            <Field label="Năm giảm 50%"><input type="number" min="0" max="9" className={inp} value={f.incentiveYearsReduced} onChange={(e) => setF({ ...f, incentiveYearsReduced: e.target.value })} placeholder="9" /></Field>
          </div>
        </div>
        <Field label="Lỗ kết chuyển (đ)" cls="col-span-2"><input type="number" min="0" className={inp} value={f.lossCarryforward} onChange={(e) => setF({ ...f, lossCarryforward: e.target.value })} placeholder="0" /></Field>
      </div>
      <div className="flex items-center justify-end gap-3 pt-4 mt-3 border-t border-slate-800">
        <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg disabled:opacity-50">Hủy</button>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white rounded-lg disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Lưu</button>
      </div>
    </Shell>
  );
}

function ComputeModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const now = new Date();
  const [type, setType] = useState<TaxType>("vat");
  const [mode, setMode] = useState<"month" | "quarter">("month");
  const [month, setMonth] = useState(now.toISOString().slice(0, 7));
  const [year, setYear] = useState(now.getUTCFullYear().toString());
  const [quarter, setQuarter] = useState(String(Math.ceil((now.getUTCMonth() + 1) / 3)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<TaxReturn | null>(null);

  const compute = async () => {
    setBusy(true); setErr(null); setResult(null);
    const period = mode === "month" ? month : `${year}-Q${quarter}`;
    try { const { data } = await apiSend<TaxReturn>("/api/tax/returns/compute", "POST", { type, period }); setResult(data); }
    catch (e) { setErr(e instanceof Error ? e.message : "Lỗi tính"); } finally { setBusy(false); }
  };

  return (
    <Shell title="Tự tính thuế theo kỳ" onClose={onClose}>
      {err && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{err}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Loại thuế">
          <select className={inp} value={type} onChange={(e) => setType(e.target.value as TaxType)}>
            <option value="vat">GTGT</option><option value="cit">TNDN</option><option value="pit">TNCN</option>
          </select>
        </Field>
        <Field label="Kỳ">
          <select className={inp} value={mode} onChange={(e) => setMode(e.target.value as "month" | "quarter")}>
            <option value="month">Tháng</option><option value="quarter">Quý</option>
          </select>
        </Field>
        {mode === "month"
          ? <Field label="Tháng" cls="col-span-2"><input type="month" className={inp} value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
          : <>
              <Field label="Năm"><input type="number" className={inp} value={year} onChange={(e) => setYear(e.target.value)} /></Field>
              <Field label="Quý"><select className={inp} value={quarter} onChange={(e) => setQuarter(e.target.value)}>{["1", "2", "3", "4"].map((q) => <option key={q} value={q}>Quý {q}</option>)}</select></Field>
            </>}
      </div>

      {result && (
        <div className="mt-3 p-3 rounded-lg bg-slate-800/60 border border-slate-700 text-xs space-y-1">
          {result.type === "vat" && Number(result.outputTax) + Number(result.inputTax) > 0 && <>
            <Row label="GTGT đầu ra" v={result.outputTax} /><Row label="GTGT đầu vào" v={result.inputTax} />
          </>}
          {result.type === "cit" && <>
            <Row label="Doanh thu" v={result.revenue} /><Row label="Chi phí được trừ" v={result.deductible} />
            <Row label="Thu nhập chịu thuế" v={result.taxableIncome} /><div className="text-slate-400">Thuế suất: {result.rate}%</div>
          </>}
          {result.type === "vat" && <div className="text-slate-400">Doanh thu kỳ: {vnd(result.revenue)}</div>}
          <div className="flex justify-between pt-1 border-t border-slate-700 font-semibold text-rose-300"><span>Thuế phải nộp</span><span>{vnd(result.payable)}</span></div>
          <div className="text-[11px] text-slate-500">Hạn nộp: {fmt(result.dueDate)} · đã lưu tờ khai (nháp)</div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 mt-3 border-t border-slate-800">
        <button onClick={result ? onDone : onClose} disabled={busy} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg disabled:opacity-50">{result ? "Xong" : "Hủy"}</button>
        <button onClick={compute} disabled={busy} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white rounded-lg disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />} {result ? "Tính lại" : "Tính"}</button>
      </div>
    </Shell>
  );
}

function Row({ label, v }: { label: string; v: number }) {
  return <div className="flex justify-between text-slate-300"><span className="text-slate-400">{label}</span><span>{vnd(v)}</span></div>;
}
