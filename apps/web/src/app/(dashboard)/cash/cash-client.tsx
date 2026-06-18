"use client";

// src/app/(dashboard)/cash/cash-client.tsx
// Ngân quỹ — sổ quỹ thu/chi (tiền mặt & ngân hàng) + số dư.

import { useState } from "react";
import { Wallet, Plus, RefreshCw, Loader2, X, Trash2, Landmark, Banknote, ArrowDownCircle, ArrowUpCircle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useApi, apiSend } from "@/lib/api/client";
import { CashAssistant } from "./cash-assistant";

type AccType = "cash" | "bank";
type TxKind = "receipt" | "payment";
interface Account { id: string; name: string; type: AccType; bankName: string | null; accountNo: string | null; openingBalance: number; balance: number; isActive: boolean }
interface Tx {
  id: string; kind: TxKind; amount: number; date: string; category: string | null; description: string;
  account: { id: string; name: string } | null; partner: { id: string; name: string } | null;
}
interface Stats { totalBalance: number; monthIn: number; monthOut: number; accounts: number }
type Tab = "transactions" | "accounts";

const vnd = (n: number) => `${Math.round(n ?? 0).toLocaleString("vi-VN")} đ`;
const fmt = (d: string) => new Date(d).toLocaleDateString("vi-VN");

export function CashClient({ canManage, roleName, roleLevel }: { canManage: boolean; roleName: string | null; roleLevel: string | null }) {
  const [tab, setTab] = useState<Tab>("transactions");
  const accounts = useApi<Account[]>("/api/cash/accounts");
  const txs = useApi<Tx[]>("/api/cash/transactions?limit=100");
  const stats = useApi<Stats>("/api/cash/stats");
  const [txModal, setTxModal] = useState(false);
  const [accModal, setAccModal] = useState<Account | "new" | null>(null);

  const accList = accounts.data ?? [];
  const refreshAll = () => { accounts.refresh(); txs.refresh(); stats.refresh(); };

  return (
    <div className="max-w-[1500px] mx-auto px-4 py-6">
      <PageHeader icon={Wallet} iconColor="text-green-400" title="Ngân Quỹ" subtitle="Sổ quỹ tiền mặt & ngân hàng · thu / chi" />

      <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
        <div className="lg:flex-[3] min-w-0 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Tổng số dư" value={stats.data?.totalBalance ?? 0} cls="text-green-400" icon={Wallet} />
            <Stat label="Thu tháng này" value={stats.data?.monthIn ?? 0} cls="text-emerald-400" icon={ArrowDownCircle} />
            <Stat label="Chi tháng này" value={stats.data?.monthOut ?? 0} cls="text-red-400" icon={ArrowUpCircle} />
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit">
              {([["transactions", "Giao dịch"], ["accounts", "Tài khoản quỹ"]] as [Tab, string][]).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === k ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {canManage && (
                <button onClick={() => (tab === "accounts" ? setAccModal("new") : setTxModal(true))}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-green-600 hover:bg-green-500 text-white rounded-lg">
                  <Plus size={15} /> {tab === "accounts" ? "Tài khoản" : "Phiếu thu/chi"}
                </button>
              )}
              <button onClick={refreshAll} className="p-2 text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg"><RefreshCw size={14} /></button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[280px]">
            {tab === "accounts" ? (
              accounts.loading ? <Spin /> : accList.length === 0 ? <EmptyBox icon={Landmark} text="Chưa có tài khoản quỹ" /> : (
                <div className="divide-y divide-slate-800">
                  {accList.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40">
                      {a.type === "bank" ? <Landmark size={16} className="text-green-400" /> : <Banknote size={16} className="text-green-400" />}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-slate-200">{a.name}</span>
                        <div className="text-[11px] text-slate-500 mt-0.5">{a.type === "bank" ? `${a.bankName ?? ""} ${a.accountNo ?? ""}` : "Tiền mặt"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-green-300">{vnd(a.balance)}</div>
                        <div className="text-[10px] text-slate-600">đầu kỳ {vnd(a.openingBalance)}</div>
                      </div>
                      {canManage && (
                        <button onClick={async () => { if (confirm(`Xóa tài khoản "${a.name}"?`)) { try { await apiSend(`/api/cash/accounts/${a.id}`, "DELETE"); refreshAll(); } catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); } } }}
                          className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : (
              txs.loading ? <Spin /> : (txs.data ?? []).length === 0 ? <EmptyBox icon={Wallet} text="Chưa có giao dịch" /> : (
                <div className="divide-y divide-slate-800">
                  {(txs.data ?? []).map((t) => {
                    const isIn = t.kind === "receipt";
                    return (
                      <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40">
                        {isIn ? <ArrowDownCircle size={18} className="text-emerald-400 flex-shrink-0" /> : <ArrowUpCircle size={18} className="text-red-400 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-slate-200 truncate">{t.description}</span>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                            <span>{fmt(t.date)}</span>
                            {t.account && <span>{t.account.name}</span>}
                            {t.category && <span>{t.category}</span>}
                            {t.partner && <span>{t.partner.name}</span>}
                          </div>
                        </div>
                        <div className={`text-sm font-semibold ${isIn ? "text-emerald-300" : "text-red-300"}`}>{isIn ? "+" : "−"}{vnd(t.amount)}</div>
                        {canManage && (
                          <button onClick={async () => { if (confirm("Xóa giao dịch?")) { try { await apiSend(`/api/cash/transactions/${t.id}`, "DELETE"); refreshAll(); } catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); } } }}
                            className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>

        <div className="w-full lg:flex-1 min-w-0">
          <CashAssistant roleName={roleName} roleLevel={roleLevel} />
        </div>
      </div>

      {txModal && <TxModal accounts={accList} onClose={() => setTxModal(false)} onSaved={() => { setTxModal(false); refreshAll(); }} />}
      {accModal && <AccountModal value={accModal === "new" ? null : accModal} onClose={() => setAccModal(null)} onSaved={() => { setAccModal(null); refreshAll(); }} />}
    </div>
  );
}

function Spin() { return <div className="flex items-center justify-center py-20"><Loader2 size={26} className="animate-spin text-green-500" /></div>; }
function EmptyBox({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return <div className="flex flex-col items-center justify-center py-20 text-slate-500"><Icon size={30} className="mb-3 opacity-40" /><p className="text-sm">{text}</p></div>;
}
function Stat({ label, value, cls, icon: Icon }: { label: string; value: number; cls: string; icon: React.ElementType }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Icon size={12} className={cls} /> {label}</div>
      <div className={`text-base font-semibold mt-1 ${cls}`}>{vnd(value)}</div>
    </div>
  );
}

const inp = "w-full px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/40";
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

function TxModal({ accounts, onClose, onSaved }: { accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    accountId: accounts[0]?.id ?? "", kind: "receipt" as TxKind, amount: "",
    date: new Date().toISOString().slice(0, 10), category: "", description: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await apiSend("/api/cash/transactions", "POST", {
        accountId: f.accountId, kind: f.kind, amount: Number(f.amount),
        date: f.date || null, category: f.category || null, description: f.description,
      });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); } finally { setSaving(false); }
  };
  return (
    <Shell title="Phiếu thu / chi" onClose={onClose}>
      {err && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{err}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Loại">
          <select className={inp} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as TxKind })}>
            <option value="receipt">Thu (tiền vào)</option>
            <option value="payment">Chi (tiền ra)</option>
          </select>
        </Field>
        <Field label="Tài khoản quỹ">
          <select className={inp} value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Số tiền *"><input type="number" className={inp} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Ngày"><input type="date" className={inp} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Nhóm"><input className={inp} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="lương, mua hàng..." /></Field>
        <Field label="Diễn giải *" cls="col-span-2"><input className={inp} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
      <Actions onClose={onClose} onSave={save} saving={saving} disabled={!f.accountId || !f.amount || !f.description.trim()} />
    </Shell>
  );
}

function AccountModal({ value, onClose, onSaved }: { value: Account | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: value?.name ?? "", type: (value?.type ?? "cash") as AccType,
    bankName: value?.bankName ?? "", accountNo: value?.accountNo ?? "",
    openingBalance: value?.openingBalance?.toString() ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setSaving(true); setErr(null);
    const body = { name: f.name, type: f.type, bankName: f.bankName || null, accountNo: f.accountNo || null, openingBalance: f.openingBalance ? Number(f.openingBalance) : 0 };
    try {
      if (value) await apiSend(`/api/cash/accounts/${value.id}`, "PATCH", body);
      else await apiSend("/api/cash/accounts", "POST", body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); } finally { setSaving(false); }
  };
  return (
    <Shell title={value ? "Sửa tài khoản quỹ" : "Thêm tài khoản quỹ"} onClose={onClose}>
      {err && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{err}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tên *" cls="col-span-2"><input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Quỹ tiền mặt / TK Vietcombank..." /></Field>
        <Field label="Loại">
          <select className={inp} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as AccType })}>
            <option value="cash">Tiền mặt</option>
            <option value="bank">Ngân hàng</option>
          </select>
        </Field>
        <Field label="Số dư đầu kỳ"><input type="number" className={inp} value={f.openingBalance} onChange={(e) => setF({ ...f, openingBalance: e.target.value })} /></Field>
        {f.type === "bank" && <>
          <Field label="Ngân hàng"><input className={inp} value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} /></Field>
          <Field label="Số tài khoản"><input className={inp} value={f.accountNo} onChange={(e) => setF({ ...f, accountNo: e.target.value })} /></Field>
        </>}
      </div>
      <Actions onClose={onClose} onSave={save} saving={saving} disabled={!f.name.trim()} />
    </Shell>
  );
}

function Actions({ onClose, onSave, saving, disabled }: { onClose: () => void; onSave: () => void; saving: boolean; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-end gap-3 pt-4 mt-3 border-t border-slate-800">
      <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg disabled:opacity-50">Hủy</button>
      <button onClick={onSave} disabled={saving || disabled} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-green-600 hover:bg-green-500 text-white rounded-lg disabled:opacity-50">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Lưu
      </button>
    </div>
  );
}
