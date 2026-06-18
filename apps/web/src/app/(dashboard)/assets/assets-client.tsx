"use client";

// src/app/(dashboard)/assets/assets-client.tsx
// Tài sản cố định (khấu hao) + Góp vốn (tiền/tài sản/QSDĐ/SHTT/khác).

import { useState } from "react";
import { Building, Plus, RefreshCw, Loader2, X, Trash2, Pencil, HandCoins, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useApi, apiSend } from "@/lib/api/client";
import { AssetsAssistant } from "./assets-assistant";

type AssetStatus = "active" | "disposed";
type CapKind = "cash" | "asset" | "land_use_right" | "ip_right" | "other";
type CapStatus = "proposed" | "valued" | "recorded";
interface Asset {
  id: string; code: string | null; name: string; category: string | null; acquisitionDate: string | null;
  cost: number; salvageValue: number; usefulLifeMonths: number | null; status: AssetStatus;
  partner: { id: string; name: string } | null; note: string | null;
  monthly: number; accumulated: number; nbv: number;
}
interface Capital {
  id: string; contributorName: string; kind: CapKind; description: string | null; value: number;
  valuationMethod: string | null; contributedDate: string | null; status: CapStatus; note: string | null;
}
interface AssetStats { count: number; active: number; totalCost: number; totalNbv: number }
interface CapStats { total: number; byKind: Record<string, number> }
type Tab = "assets" | "capital";

const vnd = (n: number) => `${Math.round(n ?? 0).toLocaleString("vi-VN")} đ`;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("vi-VN") : "—");
const CAP_KIND: Record<CapKind, string> = { cash: "Tiền mặt", asset: "Tài sản", land_use_right: "Quyền SD đất", ip_right: "Sở hữu trí tuệ", other: "Khác" };
const CAP_ST: Record<CapStatus, { label: string; cls: string }> = {
  proposed: { label: "Đề xuất", cls: "text-slate-400 bg-slate-800/40 border-slate-700/40" },
  valued:   { label: "Đã định giá", cls: "text-cyan-400 bg-cyan-900/20 border-cyan-800/40" },
  recorded: { label: "Đã ghi vốn", cls: "text-emerald-400 bg-emerald-900/20 border-emerald-800/40" },
};

export function AssetsClient({ canManage, roleName, roleLevel }: { canManage: boolean; roleName: string | null; roleLevel: string | null }) {
  const [tab, setTab] = useState<Tab>("assets");
  const assets = useApi<Asset[]>("/api/assets");
  const aStats = useApi<AssetStats>("/api/assets/stats");
  const capital = useApi<Capital[]>("/api/assets/capital");
  const cStats = useApi<CapStats>("/api/assets/capital/stats");
  const [assetModal, setAssetModal] = useState<Asset | "new" | null>(null);
  const [capModal, setCapModal] = useState<Capital | "new" | null>(null);

  const refreshAll = () => { assets.refresh(); aStats.refresh(); capital.refresh(); cStats.refresh(); };

  return (
    <div className="max-w-[1500px] mx-auto px-4 py-6">
      <PageHeader icon={Building} iconColor="text-orange-400" title="Tài Sản & Góp Vốn" subtitle="Tài sản cố định (khấu hao) · góp vốn" />

      <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
        <div className="lg:flex-[3] min-w-0 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {tab === "assets" ? <>
              <Stat label="Nguyên giá" value={aStats.data?.totalCost ?? 0} cls="text-orange-400" />
              <Stat label="Giá trị còn lại" value={aStats.data?.totalNbv ?? 0} cls="text-emerald-400" />
              <Stat label="Đang dùng" value={aStats.data?.active ?? 0} cls="text-slate-300" raw />
            </> : <>
              <Stat label="Tổng vốn góp" value={cStats.data?.total ?? 0} cls="text-orange-400" />
              <Stat label="Bằng tiền" value={cStats.data?.byKind?.cash ?? 0} cls="text-emerald-400" />
              <Stat label="Bằng tài sản/khác" value={(cStats.data?.total ?? 0) - (cStats.data?.byKind?.cash ?? 0)} cls="text-cyan-400" />
            </>}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit">
              {([["assets", "Tài sản cố định"], ["capital", "Góp vốn"]] as [Tab, string][]).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === k ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}>{label}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {canManage && (
                <button onClick={() => (tab === "assets" ? setAssetModal("new") : setCapModal("new"))}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-500 text-white rounded-lg">
                  <Plus size={15} /> Thêm
                </button>
              )}
              <button onClick={refreshAll} className="p-2 text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg"><RefreshCw size={14} /></button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[280px]">
            {tab === "assets" ? (
              assets.loading ? <Spin /> : (assets.data ?? []).length === 0 ? <EmptyBox icon={Building} text="Chưa có tài sản" /> : (
                <div className="divide-y divide-slate-800">
                  {(assets.data ?? []).map((a) => (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40">
                      <Building size={16} className="text-orange-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-200">{a.name}</span>
                          {a.status === "disposed" && <span className="text-[10px] text-slate-500">Đã thanh lý</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                          {a.category && <span>{a.category}</span>}
                          <span>NG: {vnd(a.cost)}</span>
                          {a.usefulLifeMonths ? <span>KH/tháng: {vnd(a.monthly)}</span> : null}
                          <span>Mua: {fmt(a.acquisitionDate)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-emerald-300">{vnd(a.nbv)}</div>
                        <div className="text-[10px] text-slate-600">còn lại</div>
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setAssetModal(a)} className="p-1.5 text-slate-500 hover:text-white"><Pencil size={14} /></button>
                          <button onClick={async () => { if (confirm(`Xóa "${a.name}"?`)) { try { await apiSend(`/api/assets/${a.id}`, "DELETE"); refreshAll(); } catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); } } }}
                            className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : (
              capital.loading ? <Spin /> : (capital.data ?? []).length === 0 ? <EmptyBox icon={HandCoins} text="Chưa có khoản góp vốn" /> : (
                <div className="divide-y divide-slate-800">
                  {(capital.data ?? []).map((c) => (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40">
                      <HandCoins size={16} className="text-orange-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-200">{c.contributorName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700/40 text-slate-300">{CAP_KIND[c.kind]}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${CAP_ST[c.status].cls}`}>{CAP_ST[c.status].label}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                          {c.description && <span>{c.description}</span>}
                          {c.valuationMethod && <span>ĐG: {c.valuationMethod}</span>}
                          <span>{fmt(c.contributedDate)}</span>
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-orange-300">{vnd(c.value)}</div>
                      {canManage && (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setCapModal(c)} className="p-1.5 text-slate-500 hover:text-white"><Pencil size={14} /></button>
                          <button onClick={async () => { if (confirm("Xóa khoản góp vốn?")) { try { await apiSend(`/api/assets/capital/${c.id}`, "DELETE"); refreshAll(); } catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); } } }}
                            className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>

        <div className="w-full lg:flex-1 min-w-0">
          <AssetsAssistant roleName={roleName} roleLevel={roleLevel} />
        </div>
      </div>

      {assetModal && <AssetModal value={assetModal === "new" ? null : assetModal} onClose={() => setAssetModal(null)} onSaved={() => { setAssetModal(null); refreshAll(); }} />}
      {capModal && <CapitalModal value={capModal === "new" ? null : capModal} onClose={() => setCapModal(null)} onSaved={() => { setCapModal(null); refreshAll(); }} />}
    </div>
  );
}

function Spin() { return <div className="flex items-center justify-center py-20"><Loader2 size={26} className="animate-spin text-orange-500" /></div>; }
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

const inp = "w-full px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40";
function Field({ label, cls, children }: { label: string; cls?: string; children: React.ReactNode }) {
  return <label className={`block space-y-1 ${cls ?? ""}`}><span className="text-xs font-medium text-slate-300">{label}</span>{children}</label>;
}
function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 sticky top-0 bg-slate-900">
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
      <button onClick={onSave} disabled={saving || disabled} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-500 text-white rounded-lg disabled:opacity-50">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Lưu
      </button>
    </div>
  );
}

function AssetModal({ value, onClose, onSaved }: { value: Asset | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: value?.name ?? "", code: value?.code ?? "", category: value?.category ?? "",
    acquisitionDate: value?.acquisitionDate?.slice(0, 10) ?? "", cost: value?.cost?.toString() ?? "",
    salvageValue: value?.salvageValue?.toString() ?? "", usefulLifeMonths: value?.usefulLifeMonths?.toString() ?? "",
    status: (value?.status ?? "active") as AssetStatus, note: value?.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setSaving(true); setErr(null);
    const body = {
      name: f.name, code: f.code || null, category: f.category || null,
      acquisitionDate: f.acquisitionDate || null, cost: f.cost ? Number(f.cost) : 0,
      salvageValue: f.salvageValue ? Number(f.salvageValue) : 0,
      usefulLifeMonths: f.usefulLifeMonths ? Number(f.usefulLifeMonths) : null,
      status: f.status, note: f.note || null,
    };
    try {
      if (value) await apiSend(`/api/assets/${value.id}`, "PATCH", body);
      else await apiSend("/api/assets", "POST", body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); } finally { setSaving(false); }
  };
  return (
    <Shell title={value ? "Sửa tài sản" : "Thêm tài sản cố định"} onClose={onClose}>
      {err && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{err}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tên tài sản *" cls="col-span-2"><input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Mã"><input className={inp} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        <Field label="Nhóm"><input className={inp} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="máy móc, xe, nhà..." /></Field>
        <Field label="Nguyên giá *"><input type="number" className={inp} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
        <Field label="Giá trị thu hồi"><input type="number" className={inp} value={f.salvageValue} onChange={(e) => setF({ ...f, salvageValue: e.target.value })} /></Field>
        <Field label="Ngày mua"><input type="date" className={inp} value={f.acquisitionDate} onChange={(e) => setF({ ...f, acquisitionDate: e.target.value })} /></Field>
        <Field label="Thời gian SD (tháng)"><input type="number" className={inp} value={f.usefulLifeMonths} onChange={(e) => setF({ ...f, usefulLifeMonths: e.target.value })} /></Field>
        <Field label="Trạng thái" cls="col-span-2">
          <select className={inp} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as AssetStatus })}>
            <option value="active">Đang dùng</option><option value="disposed">Đã thanh lý</option>
          </select>
        </Field>
        <Field label="Ghi chú" cls="col-span-2"><textarea className={inp} rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <Actions onClose={onClose} onSave={save} saving={saving} disabled={!f.name.trim() || !f.cost} />
    </Shell>
  );
}

function CapitalModal({ value, onClose, onSaved }: { value: Capital | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    contributorName: value?.contributorName ?? "", kind: (value?.kind ?? "cash") as CapKind,
    value: value?.value?.toString() ?? "", description: value?.description ?? "",
    valuationMethod: value?.valuationMethod ?? "", contributedDate: value?.contributedDate?.slice(0, 10) ?? "",
    status: (value?.status ?? "proposed") as CapStatus, note: value?.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setSaving(true); setErr(null);
    const body = {
      contributorName: f.contributorName, kind: f.kind, value: f.value ? Number(f.value) : 0,
      description: f.description || null, valuationMethod: f.valuationMethod || null,
      contributedDate: f.contributedDate || null, status: f.status, note: f.note || null,
    };
    try {
      if (value) await apiSend(`/api/assets/capital/${value.id}`, "PATCH", body);
      else await apiSend("/api/assets/capital", "POST", body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); } finally { setSaving(false); }
  };
  const needValuation = f.kind !== "cash";
  return (
    <Shell title={value ? "Sửa góp vốn" : "Thêm khoản góp vốn"} onClose={onClose}>
      {err && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{err}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Người/đơn vị góp *" cls="col-span-2"><input className={inp} value={f.contributorName} onChange={(e) => setF({ ...f, contributorName: e.target.value })} /></Field>
        <Field label="Hình thức góp">
          <select className={inp} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as CapKind })}>
            <option value="cash">Tiền mặt</option><option value="asset">Tài sản</option>
            <option value="land_use_right">Quyền sử dụng đất</option><option value="ip_right">Sở hữu trí tuệ</option>
            <option value="other">Tài sản khác</option>
          </select>
        </Field>
        <Field label="Giá trị *"><input type="number" className={inp} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
        <Field label="Mô tả" cls="col-span-2"><input className={inp} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {needValuation && <Field label="Phương pháp định giá" cls="col-span-2"><input className={inp} value={f.valuationMethod} onChange={(e) => setF({ ...f, valuationMethod: e.target.value })} placeholder="thẩm định giá, thỏa thuận HĐTV..." /></Field>}
        <Field label="Ngày góp"><input type="date" className={inp} value={f.contributedDate} onChange={(e) => setF({ ...f, contributedDate: e.target.value })} /></Field>
        <Field label="Trạng thái">
          <select className={inp} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as CapStatus })}>
            <option value="proposed">Đề xuất</option><option value="valued">Đã định giá</option><option value="recorded">Đã ghi vốn</option>
          </select>
        </Field>
        <Field label="Ghi chú" cls="col-span-2"><textarea className={inp} rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <Actions onClose={onClose} onSave={save} saving={saving} disabled={!f.contributorName.trim() || !f.value} />
    </Shell>
  );
}
