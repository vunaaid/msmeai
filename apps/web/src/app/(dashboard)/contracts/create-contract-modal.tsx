"use client";

// src/app/(dashboard)/contracts/create-contract-modal.tsx
// Modal tạo hợp đồng mới (POST /api/contracts). Số HĐ tự sinh theo chiều.

import { useState, useEffect } from "react";
import { X, FileSignature, Loader2 } from "lucide-react";
import { apiSend } from "@/lib/api/client";
import {
  DIRECTION_LABEL, TYPE_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_TERM_LABEL,
  type Direction, type ContractType, type PaymentMethod, type PaymentTerm, type PartyType,
  type ContractPrefill,
} from "./contract-meta";

interface Props {
  direction: Direction | null;        // mở form trống theo chiều
  prefill?: ContractPrefill | null;    // mở form điền sẵn (từ bản thảo AI)
  onClose: () => void;
  onSuccess: () => void;
}

const TYPE_KEYS = Object.keys(TYPE_LABEL) as ContractType[];
const METHOD_KEYS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[];
const TERM_KEYS = Object.keys(PAYMENT_TERM_LABEL) as PaymentTerm[];

export function CreateContractModal({ direction, prefill, onClose, onSuccess }: Props) {
  const [dir, setDir] = useState<Direction>("outbound");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ContractType>("sales");
  const [partyName, setPartyName] = useState("");
  const [partyTaxCode, setPartyTaxCode] = useState("");
  const [valueBeforeTax, setValueBeforeTax] = useState("");
  const [taxRate, setTaxRate] = useState("10");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = direction !== null || prefill != null;

  useEffect(() => {
    if (prefill) {
      setDir(prefill.direction);
      setTitle(prefill.title); setType(prefill.type); setPartyName(prefill.partyName);
      setPartyTaxCode(prefill.partyTaxCode);
      setValueBeforeTax(prefill.valueBeforeTax ? String(prefill.valueBeforeTax) : "");
      setTaxRate(String(prefill.taxRate ?? 10));
      setPaymentMethod(prefill.paymentMethod ?? ""); setPaymentTerm(prefill.paymentTerm ?? "");
      setStartDate(prefill.startDate ?? ""); setEndDate(prefill.endDate ?? "");
      setDescription(prefill.description ?? ""); setError(null);
    } else if (direction) {
      setDir(direction);
      setTitle(""); setType("sales"); setPartyName(""); setPartyTaxCode("");
      setValueBeforeTax(""); setTaxRate("10"); setPaymentMethod(""); setPaymentTerm("");
      setStartDate(""); setEndDate(""); setDescription(""); setError(null);
    }
  }, [direction, prefill]);

  if (!open) return null;

  const partyType: PartyType = dir === "inbound" ? "vendor" : dir === "internal" ? "employee" : "customer";
  const partyLabel = dir === "inbound" ? "Nhà cung cấp" : dir === "internal" ? "Người lao động" : "Khách hàng";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !partyName.trim()) { setError("Nhập tên hợp đồng và đối tác"); return; }
    setBusy(true); setError(null);
    try {
      const before = valueBeforeTax ? Number(valueBeforeTax) : 0;
      const rate = taxRate ? Number(taxRate) : 0;
      const { data } = await apiSend<{ id: string }>("/api/contracts", "POST", {
        title: title.trim(),
        direction: dir,
        type,
        partyType,
        partyName: partyName.trim(),
        partyTaxCode: partyTaxCode.trim() || undefined,
        valueBeforeTax: before,
        taxRate: rate,
        paymentMethod: paymentMethod || undefined,
        paymentTerm: paymentTerm || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        description: description.trim() || undefined,
      });
      onSuccess();
      if (data?.id) window.location.href = `/contracts/${data.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi kết nối");
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 sticky top-0 bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-cyan-500/10 rounded-lg"><FileSignature size={16} className="text-cyan-400" /></div>
            <h2 className="text-base font-semibold text-white">Tạo hợp đồng</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X size={16} /></button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">⚠ {error}</div>}

          {/* Chiều hợp đồng */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Chiều hợp đồng</label>
            <div className="grid grid-cols-3 gap-2">
              {(["outbound", "inbound", "internal"] as Direction[]).map((d) => (
                <button key={d} type="button" onClick={() => setDir(d)}
                  className={`px-2 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    dir === d ? "border-cyan-500 bg-cyan-500/10 text-cyan-300" : "border-slate-700 text-slate-400 hover:text-white"
                  }`}>
                  {DIRECTION_LABEL[d]}
                </button>
              ))}
            </div>
          </div>

          <Field label="Tên hợp đồng">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: HĐ cung cấp dịch vụ marketing Q3" className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Loại hợp đồng">
              <select value={type} onChange={(e) => setType(e.target.value as ContractType)} className={inputCls}>
                {TYPE_KEYS.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </Field>
            <Field label={partyLabel}>
              <input value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder={`Tên ${partyLabel.toLowerCase()}`} className={inputCls} />
            </Field>
          </div>

          <Field label="Mã số thuế đối tác (tùy chọn)">
            <input value={partyTaxCode} onChange={(e) => setPartyTaxCode(e.target.value)} placeholder="MST" className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Giá trị trước thuế (VND)">
              <input type="number" min="0" value={valueBeforeTax} onChange={(e) => setValueBeforeTax(e.target.value)} placeholder="0" className={inputCls} />
            </Field>
            <Field label="Thuế suất (%)">
              <input type="number" min="0" max="100" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phương thức TT">
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className={inputCls}>
                <option value="">— Chọn —</option>
                {METHOD_KEYS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
              </select>
            </Field>
            <Field label="Điều khoản TT">
              <select value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value as PaymentTerm)} className={inputCls}>
                <option value="">— Chọn —</option>
                {TERM_KEYS.map((t) => <option key={t} value={t}>{PAYMENT_TERM_LABEL[t]}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Ngày bắt đầu">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Ngày hết hạn">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Nội dung / điều khoản (bản thảo)">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={prefill ? 8 : 3}
              placeholder="Nội dung, điều khoản hợp đồng…" className={`${inputCls} resize-y font-mono text-[11px] leading-relaxed`} />
          </Field>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg disabled:opacity-50">Hủy</button>
            <button type="submit" disabled={busy} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Đang tạo…</> : "Tạo hợp đồng"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-300">{label}</label>
      {children}
    </div>
  );
}
