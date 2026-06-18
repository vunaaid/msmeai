"use client";

// src/app/(dashboard)/contracts/[id]/contract-detail.tsx
// Chi tiết hợp đồng: thông tin chung · giá trị · các bên ký · lịch thanh toán · vòng đời.

import { useState } from "react";
import { Loader2, Plus, Trash2, CheckCircle2, Send, PenLine, XCircle, Banknote, Scale, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Markdown } from "@/components/markdown";
import { apiSend, useApi } from "@/lib/api/client";
import {
  DIRECTION_LABEL, TYPE_LABEL, STATUS_LABEL, STATUS_COLOR,
  PAYMENT_METHOD_LABEL, PAYMENT_TERM_LABEL, SCHEDULE_STATUS_LABEL,
  formatVnd, formatDate,
  type Direction, type ContractType, type ContractStatus,
  type PaymentMethod, type PaymentTerm, type ScheduleStatus,
} from "../contract-meta";

interface Schedule {
  id: string; installmentNo: number; description: string | null; dueDate: string | null;
  amount: string; paidAmount: string; percent: number | null; status: ScheduleStatus;
}
interface Signatory {
  id: string; party: string; name: string; status: string; signedAt: string | null; signMethod: string | null;
}
interface Contract {
  id: string; number: string; title: string; direction: Direction; type: ContractType; status: ContractStatus;
  partyType: string; partyName: string; partyTaxCode: string | null; partyAddress: string | null;
  currency: string; valueBeforeTax: string; taxRate: number; taxAmount: string; value: string;
  paymentMethod: PaymentMethod | null; paymentTerm: PaymentTerm | null; netDays: number | null;
  signDate: string | null; startDate: string | null; endDate: string | null; description: string | null;
  metadata?: { legalReview?: { text: string; at: string } } | null;
  schedules: Schedule[]; signatories: Signatory[];
}

export function ContractDetail({ id, canManage }: { id: string; canManage: boolean }) {
  const c = useApi<Contract>(`/api/contracts/${id}`);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  async function act(path: string, body?: unknown, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true);
    try {
      await apiSend(`/api/contracts/${id}${path}`, "POST", body);
      c.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  // AI Pháp chế rà soát (chậm ~30-60s) — có loading riêng.
  async function legalReview() {
    setReviewing(true);
    try {
      await apiSend(`/api/contracts/${id}/legal-review`, "POST", {});
      c.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lỗi rà soát");
    } finally {
      setReviewing(false);
    }
  }

  const openPdf = () => window.open(`/api/contracts/${id}/export-pdf`, "_blank");

  if (c.loading) return <Centered><Loader2 className="animate-spin" /> Đang tải…</Centered>;
  if (c.error) return <Centered className="text-red-400">⚠ {c.error}</Centered>;
  const ct = c.data;
  if (!ct) return <Centered className="text-red-400">Không tìm thấy hợp đồng</Centered>;

  return (
    <>
      <PageHeader
        icon="FileSignature"
        title={ct.title}
        subtitle={`${ct.number} · ${DIRECTION_LABEL[ct.direction]} · ${TYPE_LABEL[ct.type]}`}
        backHref="/contracts"
        actions={<span className={`text-xs px-2 py-1 rounded border ${STATUS_COLOR[ct.status]}`}>{STATUS_LABEL[ct.status]}</span>}
      />

      {/* Hành động theo vòng đời (đúng luồng: soạn → Pháp chế rà soát → trình TGĐ → duyệt → in/ký) */}
      <div className="flex flex-wrap gap-2 mb-5">
        {canManage && ["draft", "review"].includes(ct.status) && (
          <>
            <ActionBtn onClick={legalReview} disabled={busy || reviewing} icon={reviewing ? Loader2 : Scale}
              label={reviewing ? "Đang rà soát…" : "Nhờ Pháp chế rà soát"} tone="purple" spin={reviewing} />
            <ActionBtn onClick={() => act("/submit", undefined)} disabled={busy || reviewing} icon={Send} label="Trình TGĐ phê duyệt" />
          </>
        )}
        {canManage && ct.status === "pending_approval" && (
          <>
            <ActionBtn onClick={() => act("/approve", { reason: "" })} disabled={busy} icon={CheckCircle2} label="Phê duyệt" tone="emerald" />
            <ActionBtn onClick={() => act("/reject", { reason: "" }, "Trả lại hợp đồng để chỉnh sửa?")} disabled={busy} icon={XCircle} label="Trả lại" tone="red" />
          </>
        )}
        {canManage && ct.status === "active" && (
          <>
            <ActionBtn onClick={() => act("/sign", { party: "internal" })} disabled={busy} icon={PenLine} label="Ghi nhận ký" tone="purple" />
            <ActionBtn onClick={() => act("/terminate", { reason: "" }, "Chấm dứt hợp đồng này?")} disabled={busy} icon={XCircle} label="Chấm dứt" tone="red" />
          </>
        )}
        {/* In/Xuất PDF — luôn có (TGĐ/HCTC in để ký, đóng dấu) */}
        <ActionBtn onClick={openPdf} disabled={false} icon={Printer} label="In / Xuất PDF" tone="slate" />
      </div>

      {/* Nhận xét AI Pháp chế (nếu đã rà soát) */}
      {ct.metadata?.legalReview?.text && (
        <div className="mb-4 bg-purple-950/20 border border-purple-800/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Scale size={15} className="text-purple-300" />
            <h3 className="text-sm font-semibold text-purple-200">Nhận xét Pháp chế (AI) · đối chiếu luật</h3>
            <span className="text-[11px] text-slate-500 ml-auto">{formatDate(ct.metadata.legalReview.at)}</span>
          </div>
          <Markdown className="text-xs text-slate-200">{ct.metadata.legalReview.text}</Markdown>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Thông tin chung */}
        <Card title="Đối tác" className="lg:col-span-1">
          <Row label={ct.direction === "inbound" ? "Nhà cung cấp" : ct.direction === "internal" ? "Người lao động" : "Khách hàng"} value={ct.partyName} />
          <Row label="Mã số thuế" value={ct.partyTaxCode ?? "—"} />
          <Row label="Địa chỉ" value={ct.partyAddress ?? "—"} />
        </Card>

        {/* Giá trị */}
        <Card title="Giá trị & thanh toán" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-x-6">
            <Row label="Trước thuế" value={formatVnd(ct.valueBeforeTax, ct.currency)} />
            <Row label={`Thuế (${ct.taxRate}%)`} value={formatVnd(ct.taxAmount, ct.currency)} />
            <Row label="Tổng giá trị" value={formatVnd(ct.value, ct.currency)} strong />
            <Row label="Phương thức" value={ct.paymentMethod ? PAYMENT_METHOD_LABEL[ct.paymentMethod] : "—"} />
            <Row label="Điều khoản" value={ct.paymentTerm ? PAYMENT_TERM_LABEL[ct.paymentTerm] : "—"} />
            <Row label="Hiệu lực" value={`${formatDate(ct.startDate)} → ${formatDate(ct.endDate)}`} />
          </div>
        </Card>
      </div>

      {/* Lịch thanh toán */}
      <div className="mt-4">
        <SchedulesPanel contractId={id} value={ct.value} currency={ct.currency} schedules={ct.schedules} canManage={canManage} onChange={() => c.refresh()} />
      </div>

      {/* Các bên ký */}
      <div className="mt-4">
        <Card title="Các bên ký">
          {ct.signatories.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa ghi nhận chữ ký nào.</p>
          ) : (
            <div className="grid gap-2">
              {ct.signatories.map((s) => (
                <div key={s.id} className="flex items-center gap-3 text-sm">
                  <span className={`w-2 h-2 rounded-full ${s.status === "signed" ? "bg-emerald-400" : "bg-slate-500"}`} />
                  <span className="text-white">{s.name}</span>
                  <span className="text-slate-500 text-xs">{s.party === "internal" ? "Bên ta" : "Đối tác"}</span>
                  <span className="ml-auto text-xs text-slate-400">
                    {s.status === "signed" ? `Đã ký ${formatDate(s.signedAt)}` : "Chờ ký"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {ct.description && (
        <div className="mt-4">
          <Card title="Ghi chú"><p className="text-sm text-slate-300 whitespace-pre-wrap">{ct.description}</p></Card>
        </div>
      )}
    </>
  );
}

// ─── Lịch thanh toán panel ────────────────────────────────────────────────────
function SchedulesPanel({
  contractId, value, currency, schedules, canManage, onChange,
}: {
  contractId: string; value: string; currency: string; schedules: Schedule[]; canManage: boolean; onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<{ description: string; dueDate: string; amount: string }[]>(
    schedules.map((s) => ({ description: s.description ?? "", dueDate: s.dueDate ? s.dueDate.slice(0, 10) : "", amount: String(Number(s.amount)) }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const target = Number(value);

  async function save() {
    setBusy(true); setError(null);
    try {
      await apiSend(`/api/contracts/${contractId}/schedules`, "PUT", {
        items: rows.filter((r) => r.amount).map((r) => ({
          description: r.description || undefined,
          dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : undefined,
          amount: Number(r.amount),
        })),
      });
      setEditing(false);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  async function pay(s: Schedule) {
    const remain = Number(s.amount) - Number(s.paidAmount);
    const input = prompt(`Số tiền ghi nhận thanh toán cho đợt ${s.installmentNo} (còn lại ${remain.toLocaleString("vi-VN")}):`, String(remain));
    if (!input) return;
    try {
      await apiSend(`/api/contracts/schedules/${s.id}/pay`, "POST", { amount: Number(input) });
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lỗi");
    }
  }

  return (
    <Card
      title="Lịch thanh toán"
      action={canManage && !editing ? (
        <button onClick={() => setEditing(true)} className="text-xs text-cyan-300 hover:text-cyan-200 flex items-center gap-1"><Plus size={13} /> Thiết lập</button>
      ) : null}
    >
      {!editing ? (
        schedules.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có đợt thanh toán nào.</p>
        ) : (
          <div className="grid gap-1.5">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-slate-800/50 rounded-lg text-sm">
                <span className="text-slate-500 w-6">#{s.installmentNo}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-white truncate">{s.description || `Đợt ${s.installmentNo}`}</div>
                  <div className="text-[11px] text-slate-500">Đến hạn {formatDate(s.dueDate)} · {SCHEDULE_STATUS_LABEL[s.status]}</div>
                </div>
                <div className="text-right">
                  <div className="text-white">{formatVnd(s.amount, currency)}</div>
                  {Number(s.paidAmount) > 0 && <div className="text-[11px] text-emerald-400">Đã trả {formatVnd(s.paidAmount, currency)}</div>}
                </div>
                {canManage && s.status !== "paid" && (
                  <button onClick={() => pay(s)} className="p-1.5 text-slate-400 hover:text-emerald-300 hover:bg-slate-700 rounded" title="Ghi nhận thanh toán">
                    <Banknote size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-2">
          {error && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">⚠ {error}</div>}
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={r.description} onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                placeholder={`Đợt ${i + 1}`} className="flex-1 px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white" />
              <input type="date" value={r.dueDate} onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, dueDate: e.target.value } : x))}
                className="px-2 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white" />
              <input type="number" value={r.amount} onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                placeholder="Số tiền" className="w-36 px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white" />
              <button onClick={() => setRows((p) => p.filter((_, j) => j !== i))} className="p-1.5 text-slate-400 hover:text-red-400"><Trash2 size={15} /></button>
            </div>
          ))}
          <button onClick={() => setRows((p) => [...p, { description: "", dueDate: "", amount: "" }])}
            className="text-xs text-cyan-300 hover:text-cyan-200 flex items-center gap-1"><Plus size={13} /> Thêm đợt</button>
          <div className={`text-xs ${target > 0 && Math.abs(total - target) > 1 ? "text-amber-400" : "text-slate-500"}`}>
            Tổng các đợt: {total.toLocaleString("vi-VN")} {currency} / giá trị HĐ: {target.toLocaleString("vi-VN")} {currency}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditing(false)} disabled={busy} className="px-3 py-1.5 text-sm text-slate-400 border border-slate-700 rounded-lg">Hủy</button>
            <button onClick={save} disabled={busy} className="flex items-center gap-2 px-4 py-1.5 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : "Lưu lịch"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── UI bits ──────────────────────────────────────────────────────────────────
function Card({ title, children, className = "", action }: { title: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-xl p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={strong ? "text-white font-semibold" : "text-slate-200"}>{value}</span>
    </div>
  );
}
function ActionBtn({ onClick, disabled, icon: Icon, label, tone = "cyan", spin = false }: {
  onClick: () => void; disabled: boolean; icon: React.ElementType; label: string;
  tone?: "cyan" | "emerald" | "red" | "purple" | "slate"; spin?: boolean;
}) {
  const tones: Record<string, string> = {
    cyan: "bg-cyan-600 hover:bg-cyan-500",
    emerald: "bg-emerald-600 hover:bg-emerald-500",
    red: "bg-red-600/80 hover:bg-red-500",
    purple: "bg-purple-600 hover:bg-purple-500",
    slate: "bg-slate-700 hover:bg-slate-600",
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${tones[tone]}`}>
      <Icon size={15} className={spin ? "animate-spin" : ""} /> {label}
    </button>
  );
}
function Centered({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex items-center justify-center gap-2 py-16 text-slate-400 text-sm ${className}`}>{children}</div>;
}
