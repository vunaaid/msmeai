"use client";

// src/components/debts/debts-client.tsx
// Công nợ dùng chung cho AR (receivable) & AP (payable). kind quyết định nhãn + endpoint.

import { useState } from "react";
import { Coins, Plus, RefreshCw, Loader2, X, Pencil, Trash2, Wallet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useApi, apiSend } from "@/lib/api/client";
import { DebtsAssistant } from "./debts-assistant";

type Kind = "receivable" | "payable";
type Status = "open" | "partial" | "paid";
interface Partner { id: string; name: string }
interface Debt {
  id: string; description: string; amount: number; paidAmount: number;
  issueDate: string | null; dueDate: string | null; status: Status; note: string | null;
  partner: { id: string; name: string } | null; contract: { id: string; number: string } | null;
}
interface Stats { count: number; outstanding: number; overdue: number; upcoming: number }

const vnd = (n: number) => `${Math.round(n ?? 0).toLocaleString("vi-VN")} đ`;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("vi-VN") : "—");
const isOverdue = (d: Debt) => d.status !== "paid" && d.dueDate != null && new Date(d.dueDate).getTime() < Date.now();
const ST: Record<Status, { label: string; cls: string }> = {
  open:    { label: "Chưa TT",   cls: "text-amber-400 bg-amber-900/20 border-amber-800/40" },
  partial: { label: "TT một phần", cls: "text-cyan-400 bg-cyan-900/20 border-cyan-800/40" },
  paid:    { label: "Đã tất toán", cls: "text-emerald-400 bg-emerald-900/20 border-emerald-800/40" },
};

export function DebtsClient({ kind, canManage, roleName, roleLevel }: {
  kind: Kind; canManage: boolean; roleName: string | null; roleLevel: string | null;
}) {
  const list = useApi<Debt[]>(`/api/debts?kind=${kind}&limit=100`);
  const stats = useApi<Stats>(`/api/debts/stats?kind=${kind}`);
  const partners = useApi<Partner[]>(`/api/partners?kind=${kind === "receivable" ? "customer" : "vendor"}&limit=200`);
  const [modal, setModal] = useState<Debt | "new" | null>(null);
  const [paying, setPaying] = useState<string | null>(null);

  const isAR = kind === "receivable";
  const title = isAR ? "Công Nợ Phải Thu" : "Công Nợ Phải Trả";
  const refreshAll = () => { list.refresh(); stats.refresh(); };

  const pay = async (d: Debt) => {
    const remain = d.amount - d.paidAmount;
    const v = prompt(`${isAR ? "Ghi nhận THU" : "Ghi nhận CHI"} cho "${d.description}" (còn ${vnd(remain)}):`, String(remain));
    if (!v) return;
    const amount = Number(v);
    if (!amount || amount <= 0) return;
    setPaying(d.id);
    try { await apiSend(`/api/debts/${d.id}/pay`, "POST", { amount }); refreshAll(); }
    catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); } finally { setPaying(null); }
  };

  return (
    <div className="max-w-[1500px] mx-auto px-4 py-6">
      <PageHeader icon={Coins} iconColor={isAR ? "text-emerald-400" : "text-amber-400"} title={title}
        subtitle={isAR ? "Khách hàng nợ công ty" : "Công ty nợ nhà cung cấp"} />

      <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
        <div className="lg:flex-[3] min-w-0 space-y-4">
          {/* Tổng quan */}
          <div className="grid grid-cols-3 gap-3">
            <Stat label={`Còn phải ${isAR ? "thu" : "trả"}`} value={stats.data?.outstanding ?? 0} cls="text-cyan-400" icon={Wallet} />
            <Stat label="Quá hạn" value={stats.data?.overdue ?? 0} cls="text-red-400" icon={AlertTriangle} />
            <Stat label="Trong hạn" value={stats.data?.upcoming ?? 0} cls="text-slate-300" icon={CheckCircle2} />
          </div>

          <div className="flex items-center justify-end gap-2">
            {canManage && (
              <button onClick={() => setModal("new")} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg">
                <Plus size={15} /> Thêm công nợ
              </button>
            )}
            <button onClick={refreshAll} className="p-2 text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg"><RefreshCw size={14} /></button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[280px]">
            {list.loading ? (
              <div className="flex items-center justify-center py-20"><Loader2 size={26} className="animate-spin text-cyan-500" /></div>
            ) : (list.data ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500"><Coins size={30} className="mb-3 opacity-40" /><p className="text-sm">Chưa có công nợ</p></div>
            ) : (
              <div className="divide-y divide-slate-800">
                {(list.data ?? []).map((d) => {
                  const overdue = isOverdue(d);
                  const remain = d.amount - d.paidAmount;
                  return (
                    <div key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-200 truncate">{d.description}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${overdue ? "text-red-400 bg-red-900/20 border-red-800/40" : ST[d.status].cls}`}>{overdue ? "Quá hạn" : ST[d.status].label}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                          {d.partner && <span>{d.partner.name}</span>}
                          {d.contract && <span>HĐ {d.contract.number}</span>}
                          <span>Hạn: {fmt(d.dueDate)}</span>
                          <span>Còn: <span className="text-slate-300">{vnd(remain)}</span> / {vnd(d.amount)}</span>
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-1.5">
                          {d.status !== "paid" && (
                            <button onClick={() => pay(d)} disabled={paying === d.id}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-emerald-300 bg-emerald-600/15 border border-emerald-700/40 hover:bg-emerald-600/30 disabled:opacity-50">
                              {paying === d.id ? <Loader2 size={12} className="animate-spin" /> : <Wallet size={12} />} {isAR ? "Thu" : "Trả"}
                            </button>
                          )}
                          <button onClick={() => setModal(d)} className="p-1.5 text-slate-500 hover:text-white"><Pencil size={14} /></button>
                          <button onClick={async () => { if (confirm("Xóa công nợ này?")) { try { await apiSend(`/api/debts/${d.id}`, "DELETE"); refreshAll(); } catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); } } }}
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
          <DebtsAssistant roleName={roleName} roleLevel={roleLevel} />
        </div>
      </div>

      {modal && (
        <DebtModal kind={kind} value={modal === "new" ? null : modal} partners={partners.data ?? []}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); refreshAll(); }} />
      )}
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

const inp = "w-full px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40";
function Field({ label, cls, children }: { label: string; cls?: string; children: React.ReactNode }) {
  return <label className={`block space-y-1 ${cls ?? ""}`}><span className="text-xs font-medium text-slate-300">{label}</span>{children}</label>;
}

function DebtModal({ kind, value, partners, onClose, onSaved }: {
  kind: Kind; value: Debt | null; partners: Partner[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({
    description: value?.description ?? "", amount: value?.amount?.toString() ?? "",
    partnerId: value?.partner?.id ?? "", issueDate: value?.issueDate?.slice(0, 10) ?? "",
    dueDate: value?.dueDate?.slice(0, 10) ?? "", note: value?.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true); setErr(null);
    const body = {
      kind, description: f.description, amount: f.amount ? Number(f.amount) : 0,
      partnerId: f.partnerId || null, issueDate: f.issueDate || null, dueDate: f.dueDate || null, note: f.note || null,
    };
    try {
      if (value) await apiSend(`/api/debts/${value.id}`, "PATCH", body);
      else await apiSend("/api/debts", "POST", body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <h2 className="text-base font-semibold text-white">{value ? "Sửa công nợ" : "Thêm công nợ"}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {err && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{err}</div>}
          <Field label="Diễn giải *"><input className={inp} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Số tiền *"><input type="number" className={inp} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label={kind === "receivable" ? "Khách hàng" : "Nhà cung cấp"}>
              <select className={inp} value={f.partnerId} onChange={(e) => setF({ ...f, partnerId: e.target.value })}>
                <option value="">— Không —</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Ngày phát sinh"><input type="date" className={inp} value={f.issueDate} onChange={(e) => setF({ ...f, issueDate: e.target.value })} /></Field>
            <Field label="Hạn thanh toán"><input type="date" className={inp} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
          </div>
          <Field label="Ghi chú"><textarea className={inp} rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
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
