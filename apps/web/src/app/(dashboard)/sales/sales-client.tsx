"use client";

// src/app/(dashboard)/sales/sales-client.tsx
// Đối tác — Khách hàng & Nhà cung cấp (nền Bán hàng/CRM, AR/AP, Hợp đồng).

import { useState } from "react";
import { Handshake, Plus, RefreshCw, Loader2, X, Pencil, Trash2, Users, Truck, CheckCircle2, ShoppingCart, Headphones } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useApi, apiSend } from "@/lib/api/client";
import { SalesAssistant } from "./sales-assistant";

type Kind = "customer" | "vendor" | "both";
interface Partner {
  id: string; kind: Kind; name: string; code: string | null; taxCode: string | null;
  address: string | null; phone: string | null; email: string | null;
  contactPerson: string | null; contactPhone: string | null;
  creditLimit: number | null; paymentTermDays: number | null; note: string | null; isActive: boolean;
}
type Tab = "customer" | "vendor" | "orders" | "care";

const vnd = (n: number) => `${Math.round(n ?? 0).toLocaleString("vi-VN")} đ`;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("vi-VN") : "—");

// Module-level (KHÔNG đặt trong component — tránh remount/mất focus khi gõ).
const inp = "w-full px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40";
function F({ label, cls, children }: { label: string; cls?: string; children: React.ReactNode }) {
  return <label className={`block space-y-1 ${cls ?? ""}`}><span className="text-xs font-medium text-slate-300">{label}</span>{children}</label>;
}

export function SalesClient({ canManage, roleName, roleLevel }: { canManage: boolean; roleName: string | null; roleLevel: string | null }) {
  const [tab, setTab] = useState<Tab>("customer");
  const isPartner = tab === "customer" || tab === "vendor";
  const list = useApi<Partner[]>(isPartner ? `/api/partners?kind=${tab}&limit=100` : null);
  const [modal, setModal] = useState<Partner | "new" | null>(null);

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "customer", label: "Khách hàng",   icon: Users },
    { key: "vendor",   label: "Nhà cung cấp", icon: Truck },
    { key: "orders",   label: "Đơn hàng",     icon: ShoppingCart },
    { key: "care",     label: "CSKH",         icon: Headphones },
  ];

  return (
    <div className="max-w-[1500px] mx-auto px-4 py-6">
      <PageHeader icon={Handshake} iconColor="text-teal-400" title="Bán Hàng & CRM" subtitle="Khách hàng · nhà cung cấp · đơn hàng · CSKH" />

      <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
        <div className="lg:flex-[3] min-w-0">
          <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit max-w-full overflow-x-auto mb-4">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 whitespace-nowrap ${
                    tab === t.key ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}>
                  <Icon size={14} /> {t.label}
                </button>
              );
            })}
          </div>

          {isPartner ? (
            <>
              <div className="flex items-center justify-end gap-2 mb-3">
                {canManage && (
                  <button onClick={() => setModal("new")}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-lg">
                    <Plus size={15} /> Thêm
                  </button>
                )}
                <button onClick={list.refresh} title="Làm mới" className="p-2 text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg"><RefreshCw size={14} /></button>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[300px]">
                {list.loading ? (
                  <div className="flex items-center justify-center py-20"><Loader2 size={26} className="animate-spin text-teal-500" /></div>
                ) : (list.data ?? []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    {tab === "customer" ? <Users size={30} className="mb-3 opacity-40" /> : <Truck size={30} className="mb-3 opacity-40" />}
                    <p className="text-sm">{tab === "customer" ? "Chưa có khách hàng" : "Chưa có nhà cung cấp"}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {(list.data ?? []).map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40">
                        <div className="w-9 h-9 rounded-lg bg-teal-700/30 border border-teal-700/40 flex items-center justify-center text-xs font-medium text-teal-200 flex-shrink-0">
                          {p.name.trim().split(" ").map(w => w[0]).slice(-2).join("").toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-200">{p.name}</span>
                            {p.kind === "both" && <span className="text-[10px] px-1.5 py-0.5 rounded border border-purple-700/40 text-purple-300">KH+NCC</span>}
                            {!p.isActive && <span className="text-[10px] text-slate-500">Ngừng</span>}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                            {p.taxCode && <span>MST {p.taxCode}</span>}
                            {p.contactPerson && <span>{p.contactPerson}{p.contactPhone ? ` · ${p.contactPhone}` : ""}</span>}
                            {p.phone && <span>{p.phone}</span>}
                            {p.creditLimit ? <span>Hạn mức {vnd(p.creditLimit)}</span> : null}
                            {p.paymentTermDays != null ? <span>NET {p.paymentTermDays}n</span> : null}
                          </div>
                        </div>
                        {canManage && (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setModal(p)} className="p-1.5 text-slate-500 hover:text-white"><Pencil size={14} /></button>
                            <button onClick={async () => { if (confirm(`Xóa "${p.name}"?`)) { try { await apiSend(`/api/partners/${p.id}`, "DELETE"); list.refresh(); } catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); } } }}
                              className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : tab === "orders" ? (
            <OrdersPane canManage={canManage} />
          ) : (
            <CarePane canManage={canManage} />
          )}
        </div>

        <div className="w-full lg:flex-1 min-w-0">
          <SalesAssistant roleName={roleName} roleLevel={roleLevel} />
        </div>
      </div>

      {modal && (
        <PartnerModal value={modal === "new" ? null : modal} defaultKind={tab === "vendor" ? "vendor" : "customer"}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); list.refresh(); }} />
      )}
    </div>
  );
}

function PartnerModal({ value, defaultKind, onClose, onSaved }: {
  value: Partner | null; defaultKind: Kind; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({
    kind: (value?.kind ?? defaultKind) as Kind, name: value?.name ?? "", code: value?.code ?? "",
    taxCode: value?.taxCode ?? "", address: value?.address ?? "", phone: value?.phone ?? "", email: value?.email ?? "",
    contactPerson: value?.contactPerson ?? "", contactPhone: value?.contactPhone ?? "",
    creditLimit: value?.creditLimit?.toString() ?? "", paymentTermDays: value?.paymentTermDays?.toString() ?? "",
    note: value?.note ?? "", isActive: value?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true); setErr(null);
    const body = {
      kind: f.kind, name: f.name, code: f.code || null, taxCode: f.taxCode || null,
      address: f.address || null, phone: f.phone || null, email: f.email || null,
      contactPerson: f.contactPerson || null, contactPhone: f.contactPhone || null,
      creditLimit: f.creditLimit ? Number(f.creditLimit) : null,
      paymentTermDays: f.paymentTermDays ? Number(f.paymentTermDays) : null,
      note: f.note || null, isActive: f.isActive,
    };
    try {
      if (value) await apiSend(`/api/partners/${value.id}`, "PATCH", body);
      else await apiSend("/api/partners", "POST", body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 sticky top-0 bg-slate-900">
          <h2 className="text-base font-semibold text-white">{value ? `Sửa: ${value.name}` : "Thêm đối tác"}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">
          {err && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{err}</div>}
          <div className="grid grid-cols-2 gap-3">
            <F label="Tên *" cls="col-span-2"><input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></F>
            <F label="Loại">
              <select className={inp} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Kind })}>
                <option value="customer">Khách hàng</option>
                <option value="vendor">Nhà cung cấp</option>
                <option value="both">Cả hai</option>
              </select>
            </F>
            <F label="Mã"><input className={inp} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></F>
            <F label="Mã số thuế"><input className={inp} value={f.taxCode} onChange={(e) => setF({ ...f, taxCode: e.target.value })} /></F>
            <F label="Điện thoại"><input className={inp} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></F>
            <F label="Email"><input className={inp} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></F>
            <F label="Địa chỉ" cls="col-span-2"><input className={inp} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></F>
            <F label="Người liên hệ"><input className={inp} value={f.contactPerson} onChange={(e) => setF({ ...f, contactPerson: e.target.value })} /></F>
            <F label="SĐT liên hệ"><input className={inp} value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} /></F>
            <F label="Hạn mức công nợ (KH)"><input type="number" className={inp} value={f.creditLimit} onChange={(e) => setF({ ...f, creditLimit: e.target.value })} /></F>
            <F label="Kỳ hạn TT (NET ngày)"><input type="number" className={inp} value={f.paymentTermDays} onChange={(e) => setF({ ...f, paymentTermDays: e.target.value })} /></F>
            <F label="Ghi chú" cls="col-span-2"><textarea className={inp} rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></F>
          </div>
          <label className="flex items-center gap-2 mt-3 cursor-pointer">
            <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-teal-500" />
            <span className="text-xs text-slate-300">Đang hoạt động</span>
          </label>
          <div className="flex items-center justify-end gap-3 pt-4 mt-3 border-t border-slate-800">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg disabled:opacity-50">Hủy</button>
            <button onClick={save} disabled={saving || f.name.trim().length < 1} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-lg disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Lưu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Đơn hàng ────────────────────────────────────────────────────────────────────

type OrderStatus = "draft" | "confirmed" | "delivered" | "invoiced" | "cancelled";
interface OrderLine { id?: string; itemName: string; quantity: number; unitPrice: number; amount?: number }
interface SalesOrder {
  id: string; code: string; status: OrderStatus; note: string | null; total: number; orderDate: string | null;
  customer: { id: string; name: string } | null; _count?: { lines: number }; lines?: OrderLine[];
}
interface CustomerOpt { id: string; name: string }

const ORDER_ST: Record<OrderStatus, { label: string; cls: string }> = {
  draft:     { label: "Nháp",       cls: "text-slate-400 bg-slate-800/40 border-slate-700/40" },
  confirmed: { label: "Xác nhận",   cls: "text-cyan-400 bg-cyan-900/20 border-cyan-800/40" },
  delivered: { label: "Đã giao",    cls: "text-amber-400 bg-amber-900/20 border-amber-800/40" },
  invoiced:  { label: "Đã xuất HĐ", cls: "text-emerald-400 bg-emerald-900/20 border-emerald-800/40" },
  cancelled: { label: "Hủy",        cls: "text-red-400 bg-red-900/20 border-red-800/40" },
};

function OrdersPane({ canManage }: { canManage: boolean }) {
  const orders = useApi<SalesOrder[]>("/api/sales/orders");
  const customers = useApi<CustomerOpt[]>("/api/partners?kind=customer&limit=200");
  const [modal, setModal] = useState<SalesOrder | "new" | null>(null);

  return (
    <>
      <div className="flex items-center justify-end gap-2 mb-3">
        {canManage && <button onClick={() => setModal("new")} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-lg"><Plus size={15} /> Đơn hàng</button>}
        <button onClick={orders.refresh} className="p-2 text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg"><RefreshCw size={14} /></button>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[300px]">
        {orders.loading ? <div className="flex items-center justify-center py-20"><Loader2 size={26} className="animate-spin text-teal-500" /></div>
        : (orders.data ?? []).length === 0 ? <div className="flex flex-col items-center justify-center py-20 text-slate-500"><ShoppingCart size={30} className="mb-3 opacity-40" /><p className="text-sm">Chưa có đơn hàng</p></div>
        : (
          <div className="divide-y divide-slate-800">
            {(orders.data ?? []).map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40">
                <ShoppingCart size={16} className="text-teal-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-200">{o.code}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${(ORDER_ST[o.status] ?? ORDER_ST.draft).cls}`}>{(ORDER_ST[o.status] ?? ORDER_ST.draft).label}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                    {o.customer && <span>{o.customer.name}</span>}
                    <span>{fmt(o.orderDate)}</span>
                    <span>{o._count?.lines ?? 0} dòng</span>
                  </div>
                </div>
                <div className="text-sm font-semibold text-teal-300">{vnd(o.total)}</div>
                {canManage && (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setModal(o)} className="p-1.5 text-slate-500 hover:text-white"><Pencil size={14} /></button>
                    <button onClick={async () => { if (confirm(`Xóa đơn ${o.code}?`)) { try { await apiSend(`/api/sales/orders/${o.id}`, "DELETE"); orders.refresh(); } catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); } } }}
                      className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {modal && <OrderModal value={modal === "new" ? null : modal} customers={customers.data ?? []} onClose={() => setModal(null)} onSaved={() => { setModal(null); orders.refresh(); }} />}
    </>
  );
}

function OrderModal({ value, customers, onClose, onSaved }: { value: SalesOrder | null; customers: CustomerOpt[]; onClose: () => void; onSaved: () => void }) {
  const [customerId, setCustomerId] = useState(value?.customer?.id ?? "");
  const [status, setStatus] = useState<OrderStatus>(value?.status ?? "draft");
  const [orderDate, setOrderDate] = useState(value?.orderDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(value?.note ?? "");
  const [lines, setLines] = useState<OrderLine[]>(value?.lines?.map((l) => ({ itemName: l.itemName, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })) ?? [{ itemName: "", quantity: 1, unitPrice: 0 }]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);

  const setLine = (i: number, patch: Partial<OrderLine>) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const save = async () => {
    setSaving(true); setErr(null);
    const body = {
      customerId: customerId || null, status, orderDate: orderDate || null, note: note || null,
      lines: lines.filter((l) => l.itemName.trim()).map((l) => ({ itemName: l.itemName, quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0 })),
    };
    try {
      if (value) await apiSend(`/api/sales/orders/${value.id}`, "PATCH", body);
      else await apiSend("/api/sales/orders", "POST", body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 sticky top-0 bg-slate-900">
          <h2 className="text-base font-semibold text-white">{value ? `Đơn hàng ${value.code}` : "Tạo đơn hàng"}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">
          {err && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{err}</div>}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <F label="Khách hàng" cls="col-span-1"><select className={inp} value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">— Chọn —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></F>
            <F label="Ngày"><input type="date" className={inp} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></F>
            <F label="Trạng thái"><select className={inp} value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>{(Object.keys(ORDER_ST) as OrderStatus[]).map((s) => <option key={s} value={s}>{ORDER_ST[s].label}</option>)}</select></F>
          </div>

          <div className="text-xs font-semibold text-slate-400 mb-1.5">Dòng hàng</div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={inp + " flex-[3]"} placeholder="Tên hàng/dịch vụ" value={l.itemName} onChange={(e) => setLine(i, { itemName: e.target.value })} />
                <input type="number" className={inp + " flex-1"} placeholder="SL" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} />
                <input type="number" className={inp + " flex-[2]"} placeholder="Đơn giá" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} />
                <span className="w-28 text-right text-xs text-slate-300">{vnd((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}</span>
                <button onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <button onClick={() => setLines((p) => [...p, { itemName: "", quantity: 1, unitPrice: 0 }])} className="mt-2 flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"><Plus size={12} /> Thêm dòng</button>

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
            <F label="Ghi chú" cls="flex-1 mr-4"><input className={inp} value={note} onChange={(e) => setNote(e.target.value)} /></F>
            <div className="text-right"><div className="text-[11px] text-slate-500">Tổng cộng</div><div className="text-lg font-semibold text-teal-300">{vnd(total)}</div></div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-slate-800">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg disabled:opacity-50">Hủy</button>
            <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-lg disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Lưu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CSKH ────────────────────────────────────────────────────────────────────────

type IType = "call" | "email" | "meeting" | "note" | "ticket";
type IStatus = "open" | "done";
interface Interaction { id: string; type: IType; subject: string; content: string | null; status: IStatus; date: string; partner: { id: string; name: string } | null }
const ITYPE: Record<IType, string> = { call: "Gọi điện", email: "Email", meeting: "Gặp mặt", note: "Ghi chú", ticket: "Hỗ trợ" };

function CarePane({ canManage }: { canManage: boolean }) {
  const items = useApi<Interaction[]>("/api/sales/interactions");
  const customers = useApi<CustomerOpt[]>("/api/partners?kind=customer&limit=200");
  const [modal, setModal] = useState<Interaction | "new" | null>(null);
  const toggle = async (it: Interaction) => { try { await apiSend(`/api/sales/interactions/${it.id}`, "PATCH", { status: it.status === "open" ? "done" : "open" }); items.refresh(); } catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); } };

  return (
    <>
      <div className="flex items-center justify-end gap-2 mb-3">
        {canManage && <button onClick={() => setModal("new")} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-lg"><Plus size={15} /> Ghi nhận</button>}
        <button onClick={items.refresh} className="p-2 text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg"><RefreshCw size={14} /></button>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[300px]">
        {items.loading ? <div className="flex items-center justify-center py-20"><Loader2 size={26} className="animate-spin text-teal-500" /></div>
        : (items.data ?? []).length === 0 ? <div className="flex flex-col items-center justify-center py-20 text-slate-500"><Headphones size={30} className="mb-3 opacity-40" /><p className="text-sm">Chưa có tương tác CSKH</p></div>
        : (
          <div className="divide-y divide-slate-800">
            {(items.data ?? []).map((it) => (
              <div key={it.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40">
                <button onClick={() => canManage && toggle(it)} className={`text-[10px] px-1.5 py-0.5 rounded border ${it.status === "done" ? "text-emerald-400 bg-emerald-900/20 border-emerald-800/40" : "text-amber-400 bg-amber-900/20 border-amber-800/40"}`}>{it.status === "done" ? "Xong" : "Đang xử lý"}</button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-200">{it.subject}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700/40 text-slate-400">{ITYPE[it.type] ?? it.type}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                    {it.partner && <span>{it.partner.name}</span>}
                    <span>{fmt(it.date)}</span>
                    {it.content && <span className="truncate max-w-[300px]">{it.content}</span>}
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setModal(it)} className="p-1.5 text-slate-500 hover:text-white"><Pencil size={14} /></button>
                    <button onClick={async () => { if (confirm("Xóa tương tác?")) { try { await apiSend(`/api/sales/interactions/${it.id}`, "DELETE"); items.refresh(); } catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); } } }}
                      className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {modal && <InteractionModal value={modal === "new" ? null : modal} customers={customers.data ?? []} onClose={() => setModal(null)} onSaved={() => { setModal(null); items.refresh(); }} />}
    </>
  );
}

function InteractionModal({ value, customers, onClose, onSaved }: { value: Interaction | null; customers: CustomerOpt[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    partnerId: value?.partner?.id ?? "", type: (value?.type ?? "call") as IType, subject: value?.subject ?? "",
    content: value?.content ?? "", status: (value?.status ?? "open") as IStatus, date: value?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setSaving(true); setErr(null);
    const body = { partnerId: f.partnerId || null, type: f.type, subject: f.subject, content: f.content || null, status: f.status, date: f.date || null };
    try {
      if (value) await apiSend(`/api/sales/interactions/${value.id}`, "PATCH", body);
      else await apiSend("/api/sales/interactions", "POST", body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <h2 className="text-base font-semibold text-white">{value ? "Sửa tương tác" : "Ghi nhận CSKH"}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {err && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{err}</div>}
          <div className="grid grid-cols-2 gap-3">
            <F label="Khách hàng"><select className={inp} value={f.partnerId} onChange={(e) => setF({ ...f, partnerId: e.target.value })}><option value="">— Không —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></F>
            <F label="Loại"><select className={inp} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as IType })}>{(Object.keys(ITYPE) as IType[]).map((t) => <option key={t} value={t}>{ITYPE[t]}</option>)}</select></F>
          </div>
          <F label="Tiêu đề *"><input className={inp} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></F>
          <F label="Nội dung"><textarea className={inp} rows={3} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Ngày"><input type="date" className={inp} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></F>
            <F label="Trạng thái"><select className={inp} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as IStatus })}><option value="open">Đang xử lý</option><option value="done">Xong</option></select></F>
          </div>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg disabled:opacity-50">Hủy</button>
            <button onClick={save} disabled={saving || !f.subject.trim()} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-lg disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Lưu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
