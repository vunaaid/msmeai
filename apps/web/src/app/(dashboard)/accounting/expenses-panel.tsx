"use client";

// src/app/(dashboard)/accounting/expenses-panel.tsx
// Chi phí — theo dõi hóa đơn (có/chưa) & kê khai thuế (đã/chưa) + CẢNH BÁO. (todo02 mục 1.2)

import { useState } from "react";
import { Receipt, Plus, RefreshCw, Loader2, X, Pencil, Trash2, AlertTriangle, FileWarning, CheckCircle2, Wallet } from "lucide-react";
import { useApi, apiSend } from "@/lib/api/client";

interface Expense {
  id: string; date: string; category: string | null; description: string;
  amount: number; vatRate: number; vatAmount: number; total: number;
  hasInvoice: boolean; invoiceNo: string | null; invoiceDate: string | null;
  taxDeclared: boolean; taxPeriod: string | null; partner: { id: string; name: string } | null; note: string | null;
}
interface Stats { total: { count: number; amount: number }; noInvoice: { count: number; amount: number }; notDeclared: { count: number; amount: number } }
interface VendorOpt { id: string; name: string }

const vnd = (n: number) => `${Math.round(n ?? 0).toLocaleString("vi-VN")} đ`;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("vi-VN") : "—");

export function ExpensesPanel({ canManage }: { canManage: boolean }) {
  const [filter, setFilter] = useState<"" | "noinv" | "notdecl">("");
  const path = filter === "noinv" ? "/api/expenses?hasInvoice=false" : filter === "notdecl" ? "/api/expenses?taxDeclared=false" : "/api/expenses";
  const list = useApi<Expense[]>(path);
  const stats = useApi<Stats>("/api/expenses/stats");
  const vendors = useApi<VendorOpt[]>("/api/partners?kind=vendor&limit=200");
  const [modal, setModal] = useState<Expense | "new" | null>(null);

  const refreshAll = () => { list.refresh(); stats.refresh(); };
  const declare = async (e: Expense) => {
    const period = prompt("Kỳ kê khai (vd 2026-06 hoặc 2026-Q2):", e.taxPeriod ?? new Date().toISOString().slice(0, 7));
    if (period === null) return;
    try { await apiSend(`/api/expenses/${e.id}/declare`, "POST", { taxPeriod: period }); refreshAll(); }
    catch (err) { alert(err instanceof Error ? err.message : "Lỗi"); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button onClick={() => setFilter("")} className={`text-left bg-slate-900/60 border rounded-xl p-3 ${filter === "" ? "border-slate-500" : "border-slate-800"}`}>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Wallet size={12} className="text-cyan-400" /> Tổng chi phí ({stats.data?.total.count ?? 0})</div>
          <div className="text-base font-semibold mt-1 text-cyan-300">{vnd(stats.data?.total.amount ?? 0)}</div>
        </button>
        <button onClick={() => setFilter("noinv")} className={`text-left bg-slate-900/60 border rounded-xl p-3 ${filter === "noinv" ? "border-amber-500/60" : "border-slate-800"}`}>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><FileWarning size={12} className="text-amber-400" /> Chưa có hóa đơn ({stats.data?.noInvoice.count ?? 0})</div>
          <div className="text-base font-semibold mt-1 text-amber-300">{vnd(stats.data?.noInvoice.amount ?? 0)}</div>
        </button>
        <button onClick={() => setFilter("notdecl")} className={`text-left bg-slate-900/60 border rounded-xl p-3 ${filter === "notdecl" ? "border-red-500/60" : "border-slate-800"}`}>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><AlertTriangle size={12} className="text-red-400" /> Chưa kê khai thuế ({stats.data?.notDeclared.count ?? 0})</div>
          <div className="text-base font-semibold mt-1 text-red-300">{vnd(stats.data?.notDeclared.amount ?? 0)}</div>
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{filter === "noinv" ? "Đang lọc: chưa có hóa đơn" : filter === "notdecl" ? "Đang lọc: chưa kê khai thuế" : "Tất cả chi phí"}{filter && <button onClick={() => setFilter("")} className="ml-2 text-cyan-400 hover:text-cyan-300">· Bỏ lọc</button>}</p>
        <div className="flex items-center gap-2">
          {canManage && <button onClick={() => setModal("new")} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg"><Plus size={15} /> Chi phí</button>}
          <button onClick={refreshAll} className="p-2 text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg"><RefreshCw size={14} /></button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[240px]">
        {list.loading ? <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-cyan-500" /></div>
        : (list.data ?? []).length === 0 ? <div className="flex flex-col items-center justify-center py-16 text-slate-500"><Receipt size={28} className="mb-3 opacity-40" /><p className="text-sm">Không có chi phí</p></div>
        : (
          <div className="divide-y divide-slate-800">
            {(list.data ?? []).map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40">
                <Receipt size={16} className="text-cyan-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-200 truncate">{e.description}</span>
                    {e.hasInvoice
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded border text-emerald-400 border-emerald-800/40 bg-emerald-900/20">Có HĐ{e.invoiceNo ? ` ${e.invoiceNo}` : ""}</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded border text-amber-400 border-amber-800/40 bg-amber-900/20">Chưa HĐ</span>}
                    {e.taxDeclared
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded border text-emerald-400 border-emerald-800/40 bg-emerald-900/20">Đã kê khai{e.taxPeriod ? ` ${e.taxPeriod}` : ""}</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded border text-red-400 border-red-800/40 bg-red-900/20">Chưa kê khai</span>}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                    <span>{fmt(e.date)}</span>
                    {e.category && <span>{e.category}</span>}
                    {e.partner && <span>{e.partner.name}</span>}
                    {e.vatRate > 0 && <span>VAT {e.vatRate}%</span>}
                  </div>
                </div>
                <div className="text-right"><div className="text-sm font-semibold text-slate-200">{vnd(e.total)}</div></div>
                {canManage && (
                  <div className="flex items-center gap-1.5">
                    {!e.taxDeclared && <button onClick={() => declare(e)} title="Đánh dấu đã kê khai" className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-emerald-300 bg-emerald-600/15 border border-emerald-700/40 hover:bg-emerald-600/30"><CheckCircle2 size={12} /> Kê khai</button>}
                    <button onClick={() => setModal(e)} className="p-1.5 text-slate-500 hover:text-white"><Pencil size={14} /></button>
                    <button onClick={async () => { if (confirm("Xóa chi phí?")) { try { await apiSend(`/api/expenses/${e.id}`, "DELETE"); refreshAll(); } catch (err) { alert(err instanceof Error ? err.message : "Lỗi"); } } }}
                      className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && <ExpenseModal value={modal === "new" ? null : modal} vendors={vendors.data ?? []} onClose={() => setModal(null)} onSaved={() => { setModal(null); refreshAll(); }} />}
    </div>
  );
}

const inp = "w-full px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40";
function Field({ label, cls, children }: { label: string; cls?: string; children: React.ReactNode }) {
  return <label className={`block space-y-1 ${cls ?? ""}`}><span className="text-xs font-medium text-slate-300">{label}</span>{children}</label>;
}

function ExpenseModal({ value, vendors, onClose, onSaved }: { value: Expense | null; vendors: VendorOpt[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    description: value?.description ?? "", category: value?.category ?? "",
    amount: value?.amount?.toString() ?? "", vatRate: (value?.vatRate ?? 0).toString(),
    date: value?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    hasInvoice: value?.hasInvoice ?? false, invoiceNo: value?.invoiceNo ?? "", invoiceDate: value?.invoiceDate?.slice(0, 10) ?? "",
    taxDeclared: value?.taxDeclared ?? false, taxPeriod: value?.taxPeriod ?? "",
    partnerId: value?.partner?.id ?? "", note: value?.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const amount = Number(f.amount) || 0;
  const vat = Math.round(amount * (Number(f.vatRate) || 0) / 100);

  const save = async () => {
    setSaving(true); setErr(null);
    const body = {
      description: f.description, category: f.category || null, amount, vatRate: Number(f.vatRate) || 0,
      date: f.date || null, hasInvoice: f.hasInvoice, invoiceNo: f.invoiceNo || null, invoiceDate: f.invoiceDate || null,
      taxDeclared: f.taxDeclared, taxPeriod: f.taxPeriod || null, partnerId: f.partnerId || null, note: f.note || null,
    };
    try {
      if (value) await apiSend(`/api/expenses/${value.id}`, "PATCH", body);
      else await apiSend("/api/expenses", "POST", body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 sticky top-0 bg-slate-900">
          <h2 className="text-base font-semibold text-white">{value ? "Sửa chi phí" : "Thêm chi phí"}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">
          {err && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{err}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Diễn giải *" cls="col-span-2"><input className={inp} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <Field label="Số tiền (chưa thuế) *"><input type="number" className={inp} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="Thuế GTGT %">
              <select className={inp} value={f.vatRate} onChange={(e) => setF({ ...f, vatRate: e.target.value })}>
                {["0", "5", "8", "10"].map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </Field>
            <Field label="Nhóm chi phí"><input className={inp} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="văn phòng, marketing..." /></Field>
            <Field label="Ngày"><input type="date" className={inp} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Nhà cung cấp" cls="col-span-2">
              <select className={inp} value={f.partnerId} onChange={(e) => setF({ ...f, partnerId: e.target.value })}>
                <option value="">— Không —</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={f.hasInvoice} onChange={(e) => setF({ ...f, hasInvoice: e.target.checked })} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500" />
              <span className="text-xs text-slate-300">Đã có hóa đơn</span>
            </label>
            {f.hasInvoice && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Số hóa đơn"><input className={inp} value={f.invoiceNo} onChange={(e) => setF({ ...f, invoiceNo: e.target.value })} /></Field>
                <Field label="Ngày hóa đơn"><input type="date" className={inp} value={f.invoiceDate} onChange={(e) => setF({ ...f, invoiceDate: e.target.value })} /></Field>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={f.taxDeclared} onChange={(e) => setF({ ...f, taxDeclared: e.target.checked })} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500" />
              <span className="text-xs text-slate-300">Đã kê khai thuế</span>
            </label>
            {f.taxDeclared && <Field label="Kỳ kê khai"><input className={inp} value={f.taxPeriod} onChange={(e) => setF({ ...f, taxPeriod: e.target.value })} placeholder="2026-06 / 2026-Q2" /></Field>}
          </div>

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800 text-xs text-slate-400">
            <span>VAT: {vnd(vat)}</span>
            <span className="text-sm font-semibold text-slate-200">Tổng: {vnd(amount + vat)}</span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-slate-800">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg disabled:opacity-50">Hủy</button>
            <button onClick={save} disabled={saving || !f.description.trim() || !f.amount} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Lưu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
