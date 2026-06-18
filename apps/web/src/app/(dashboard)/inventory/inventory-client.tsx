"use client";

// src/app/(dashboard)/inventory/inventory-client.tsx
// Hàng tồn kho — sản phẩm (tồn realtime) + phiếu nhập/xuất/điều chỉnh.

import { useState } from "react";
import { Boxes, Plus, RefreshCw, Loader2, X, Pencil, Trash2, Package, ArrowDownCircle, ArrowUpCircle, SlidersHorizontal, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useApi, apiSend } from "@/lib/api/client";
import { InventoryAssistant } from "./inventory-assistant";

type MoveKind = "in" | "out" | "adjust";
interface Product {
  id: string; sku: string | null; name: string; unit: string; category: string | null;
  costPrice: number; salePrice: number; note: string | null; isActive: boolean; onHand: number; stockValue: number;
}
interface Movement {
  id: string; kind: MoveKind; quantity: number; unitCost: number | null; date: string; reference: string | null;
  product: { id: string; name: string; unit: string } | null; partner: { id: string; name: string } | null; note: string | null;
}
interface Stats { products: number; stockValue: number }
type Tab = "products" | "movements";

const vnd = (n: number) => `${Math.round(n ?? 0).toLocaleString("vi-VN")} đ`;
const qty = (n: number) => (n ?? 0).toLocaleString("vi-VN");
const fmt = (d: string) => new Date(d).toLocaleDateString("vi-VN");
const MOVE: Record<MoveKind, { label: string; cls: string; icon: React.ElementType }> = {
  in:     { label: "Nhập",      cls: "text-emerald-400", icon: ArrowDownCircle },
  out:    { label: "Xuất",      cls: "text-red-400",     icon: ArrowUpCircle },
  adjust: { label: "Điều chỉnh", cls: "text-amber-400",  icon: SlidersHorizontal },
};

export function InventoryClient({ canManage, roleName, roleLevel }: { canManage: boolean; roleName: string | null; roleLevel: string | null }) {
  const [tab, setTab] = useState<Tab>("products");
  const products = useApi<Product[]>("/api/inventory/products");
  const movements = useApi<Movement[]>("/api/inventory/movements");
  const stats = useApi<Stats>("/api/inventory/stats");
  const [prodModal, setProdModal] = useState<Product | "new" | null>(null);
  const [moveModal, setMoveModal] = useState(false);

  const refreshAll = () => { products.refresh(); movements.refresh(); stats.refresh(); };

  return (
    <div className="max-w-[1500px] mx-auto px-4 py-6">
      <PageHeader icon={Boxes} iconColor="text-indigo-400" title="Hàng Tồn Kho" subtitle="Sản phẩm · nhập / xuất · tồn kho" />

      <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
        <div className="lg:flex-[3] min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Số sản phẩm" value={stats.data?.products ?? 0} cls="text-indigo-400" raw />
            <Stat label="Giá trị tồn kho" value={stats.data?.stockValue ?? 0} cls="text-emerald-400" />
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit">
              {([["products", "Sản phẩm"], ["movements", "Nhập / Xuất"]] as [Tab, string][]).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === k ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}>{label}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {canManage && (
                <button onClick={() => (tab === "products" ? setProdModal("new") : setMoveModal(true))}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg">
                  <Plus size={15} /> {tab === "products" ? "Sản phẩm" : "Phiếu kho"}
                </button>
              )}
              <button onClick={refreshAll} className="p-2 text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg"><RefreshCw size={14} /></button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[280px]">
            {tab === "products" ? (
              products.loading ? <Spin /> : (products.data ?? []).length === 0 ? <EmptyBox icon={Package} text="Chưa có sản phẩm" /> : (
                <div className="divide-y divide-slate-800">
                  {(products.data ?? []).map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40">
                      <Package size={16} className="text-indigo-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-200">{p.name}</span>
                          {p.sku && <span className="text-[11px] text-slate-500">{p.sku}</span>}
                          {!p.isActive && <span className="text-[10px] text-slate-500">Ngừng</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                          {p.category && <span>{p.category}</span>}
                          <span>Giá vốn {vnd(p.costPrice)}</span>
                          <span>Giá bán {vnd(p.salePrice)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-semibold ${p.onHand <= 0 ? "text-red-300" : "text-indigo-300"}`}>{qty(p.onHand)} {p.unit}</div>
                        <div className="text-[10px] text-slate-600">{vnd(p.stockValue)}</div>
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setProdModal(p)} className="p-1.5 text-slate-500 hover:text-white"><Pencil size={14} /></button>
                          <button onClick={async () => { if (confirm(`Xóa "${p.name}"?`)) { try { await apiSend(`/api/inventory/products/${p.id}`, "DELETE"); refreshAll(); } catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); } } }}
                            className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : (
              movements.loading ? <Spin /> : (movements.data ?? []).length === 0 ? <EmptyBox icon={Boxes} text="Chưa có phiếu nhập/xuất" /> : (
                <div className="divide-y divide-slate-800">
                  {(movements.data ?? []).map((m) => {
                    const cfg = MOVE[m.kind]; const Icon = cfg.icon;
                    return (
                      <div key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40">
                        <Icon size={18} className={`${cfg.cls} flex-shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border border-slate-700/40 ${cfg.cls}`}>{cfg.label}</span>
                            <span className="text-sm text-slate-200 truncate">{m.product?.name ?? "—"}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                            <span>{fmt(m.date)}</span>
                            {m.reference && <span>{m.reference}</span>}
                            {m.partner && <span>{m.partner.name}</span>}
                          </div>
                        </div>
                        <div className={`text-sm font-semibold ${cfg.cls}`}>{m.kind === "out" ? "−" : m.kind === "in" ? "+" : ""}{qty(m.quantity)} {m.product?.unit ?? ""}</div>
                        {canManage && (
                          <button onClick={async () => { if (confirm("Xóa phiếu kho?")) { try { await apiSend(`/api/inventory/movements/${m.id}`, "DELETE"); refreshAll(); } catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); } } }}
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
          <InventoryAssistant roleName={roleName} roleLevel={roleLevel} />
        </div>
      </div>

      {prodModal && <ProductModal value={prodModal === "new" ? null : prodModal} onClose={() => setProdModal(null)} onSaved={() => { setProdModal(null); refreshAll(); }} />}
      {moveModal && <MoveModal products={products.data ?? []} onClose={() => setMoveModal(false)} onSaved={() => { setMoveModal(false); refreshAll(); }} />}
    </div>
  );
}

function Spin() { return <div className="flex items-center justify-center py-20"><Loader2 size={26} className="animate-spin text-indigo-500" /></div>; }
function EmptyBox({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return <div className="flex flex-col items-center justify-center py-20 text-slate-500"><Icon size={30} className="mb-3 opacity-40" /><p className="text-sm">{text}</p></div>;
}
function Stat({ label, value, cls, raw }: { label: string; value: number; cls: string; raw?: boolean }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`text-base font-semibold mt-1 ${cls}`}>{raw ? value : vnd(value)}</div>
    </div>
  );
}

const inp = "w-full px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40";
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
function Actions({ onClose, onSave, saving, disabled }: { onClose: () => void; onSave: () => void; saving: boolean; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-end gap-3 pt-4 mt-3 border-t border-slate-800">
      <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg disabled:opacity-50">Hủy</button>
      <button onClick={onSave} disabled={saving || disabled} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Lưu
      </button>
    </div>
  );
}

function ProductModal({ value, onClose, onSaved }: { value: Product | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: value?.name ?? "", sku: value?.sku ?? "", unit: value?.unit ?? "cái", category: value?.category ?? "",
    costPrice: value?.costPrice?.toString() ?? "", salePrice: value?.salePrice?.toString() ?? "", note: value?.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setSaving(true); setErr(null);
    const body = {
      name: f.name, sku: f.sku || null, unit: f.unit || "cái", category: f.category || null,
      costPrice: f.costPrice ? Number(f.costPrice) : 0, salePrice: f.salePrice ? Number(f.salePrice) : 0, note: f.note || null,
    };
    try {
      if (value) await apiSend(`/api/inventory/products/${value.id}`, "PATCH", body);
      else await apiSend("/api/inventory/products", "POST", body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); } finally { setSaving(false); }
  };
  return (
    <Shell title={value ? "Sửa sản phẩm" : "Thêm sản phẩm"} onClose={onClose}>
      {err && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{err}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tên sản phẩm *" cls="col-span-2"><input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="SKU"><input className={inp} value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} /></Field>
        <Field label="Đơn vị tính"><input className={inp} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
        <Field label="Nhóm"><input className={inp} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
        <Field label="Giá vốn"><input type="number" className={inp} value={f.costPrice} onChange={(e) => setF({ ...f, costPrice: e.target.value })} /></Field>
        <Field label="Giá bán" cls="col-span-2"><input type="number" className={inp} value={f.salePrice} onChange={(e) => setF({ ...f, salePrice: e.target.value })} /></Field>
        <Field label="Ghi chú" cls="col-span-2"><textarea className={inp} rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <Actions onClose={onClose} onSave={save} saving={saving} disabled={!f.name.trim()} />
    </Shell>
  );
}

function MoveModal({ products, onClose, onSaved }: { products: Product[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    productId: products[0]?.id ?? "", kind: "in" as MoveKind, quantity: "", unitCost: "",
    date: new Date().toISOString().slice(0, 10), reference: "", note: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setSaving(true); setErr(null);
    const body = {
      productId: f.productId, kind: f.kind, quantity: Number(f.quantity),
      unitCost: f.unitCost ? Number(f.unitCost) : null, date: f.date || null, reference: f.reference || null, note: f.note || null,
    };
    try { await apiSend("/api/inventory/movements", "POST", body); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); } finally { setSaving(false); }
  };
  return (
    <Shell title="Phiếu nhập / xuất kho" onClose={onClose}>
      {err && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{err}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Loại">
          <select className={inp} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as MoveKind })}>
            <option value="in">Nhập kho</option><option value="out">Xuất kho</option><option value="adjust">Điều chỉnh (±)</option>
          </select>
        </Field>
        <Field label="Sản phẩm">
          <select className={inp} value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={f.kind === "adjust" ? "Số lượng (±) *" : "Số lượng *"}><input type="number" className={inp} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
        <Field label="Đơn giá"><input type="number" className={inp} value={f.unitCost} onChange={(e) => setF({ ...f, unitCost: e.target.value })} /></Field>
        <Field label="Ngày"><input type="date" className={inp} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Số chứng từ"><input className={inp} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Ghi chú" cls="col-span-2"><input className={inp} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <Actions onClose={onClose} onSave={save} saving={saving} disabled={!f.productId || !f.quantity} />
    </Shell>
  );
}
