"use client";

// src/app/(dashboard)/accounting/gl-panel.tsx
// Tab Sổ Cái (GL) — danh mục tài khoản (TT200), bút toán kép, CĐSPS.

import { useMemo, useState } from "react";
import {
  BookOpen, Plus, RefreshCw, Loader2, Trash2, Send, CheckCircle2,
  RotateCcw, X, AlertTriangle, Sparkles,
} from "lucide-react";
import { useApi, apiSend, ApiError } from "@/lib/api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Account {
  id: string; code: string; name: string;
  type: string; level: number; isLeaf: boolean; isActive: boolean;
}
interface Journal { id: string; code: string; name: string; type: string }
interface EntryRow {
  id: string; number: string; date: string; description: string | null;
  status: "draft" | "pending" | "posted" | "reversed" | "cancelled";
  totalDebit: number; totalCredit: number;
  journal: { code: string; name: string }; _count: { lines: number };
}
interface TrialBalance {
  rows: { code: string; name: string; debit: number; credit: number; balance: number }[];
  totals: { debit: number; credit: number };
  balanced: boolean;
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  asset: "Tài sản", liability: "Nợ phải trả", equity: "Vốn CSH",
  revenue: "Doanh thu", expense: "Chi phí", determination: "Xác định KQ", off_balance: "Ngoài bảng",
};

const STATUS_CFG: Record<EntryRow["status"], { label: string; cls: string }> = {
  draft:     { label: "Nháp",      cls: "text-slate-400 bg-slate-800/60" },
  pending:   { label: "Chờ duyệt", cls: "text-amber-400 bg-amber-900/20" },
  posted:    { label: "Đã ghi sổ", cls: "text-emerald-400 bg-emerald-900/20" },
  reversed:  { label: "Đã đảo",    cls: "text-purple-400 bg-purple-900/20" },
  cancelled: { label: "Đã hủy",    cls: "text-slate-500 bg-slate-800/40" },
};

const fmtVnd = (n: number) => n.toLocaleString("vi-VN");
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

type SubView = "entries" | "accounts" | "tb";

// ─── Main ───────────────────────────────────────────────────────────────────

export function GlPanel({ canManage }: { canManage: boolean }) {
  const [view, setView] = useState<SubView>("entries");
  const [showCreate, setShowCreate] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const entries = useApi<EntryRow[]>("/api/gl/entries");
  const accounts = useApi<Account[]>("/api/gl/accounts");
  const journals = useApi<Journal[]>("/api/gl/journals");

  const leafAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => a.isLeaf && a.isActive),
    [accounts.data],
  );
  const seeded = (accounts.data?.length ?? 0) > 0;

  async function seed() {
    setBusyId("seed"); setActionErr(null);
    try {
      await apiSend("/api/gl/seed", "POST");
      accounts.refresh(); journals.refresh();
    } catch (e) {
      setActionErr(e instanceof ApiError ? e.message : "Lỗi seed danh mục");
    } finally { setBusyId(null); }
  }

  async function entryAction(id: string, action: "submit" | "post" | "reverse" | "delete") {
    setBusyId(id); setActionErr(null);
    try {
      if (action === "delete") await apiSend(`/api/gl/entries/${id}`, "DELETE");
      else await apiSend(`/api/gl/entries/${id}/${action}`, "POST");
      entries.refresh();
    } catch (e) {
      setActionErr(e instanceof ApiError ? e.message : "Thao tác thất bại");
    } finally { setBusyId(null); }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 bg-slate-800/60 rounded-lg p-1">
          {([["entries", "Bút toán"], ["accounts", "Tài khoản"], ["tb", "CĐSPS"]] as [SubView, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                view === k ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {seeded && canManage && view === "entries" && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 text-sm text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg"
            >
              <Plus size={15} /> Tạo bút toán
            </button>
          )}
          {seeded && canManage && view === "accounts" && (
            <button
              onClick={() => setShowAccount(true)}
              className="flex items-center gap-1.5 text-sm text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg"
            >
              <Plus size={15} /> Thêm tài khoản
            </button>
          )}
          <button
            onClick={() => { entries.refresh(); accounts.refresh(); }}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            title="Tải lại"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {actionErr && (
        <div className="flex items-center gap-2 text-sm text-red-300 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
          <AlertTriangle size={15} /> {actionErr}
        </div>
      )}

      {/* Chưa seed danh mục TK */}
      {!accounts.loading && !seeded && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <Sparkles size={28} className="text-blue-400 mx-auto mb-3" />
          <p className="text-slate-200 font-medium">Chưa có hệ thống tài khoản</p>
          <p className="text-slate-500 text-sm mt-1 max-w-md mx-auto">
            Khởi tạo danh mục tài khoản chuẩn theo Thông tư 200/2014/TT-BTC và 5 sổ nhật ký mặc định.
          </p>
          {canManage ? (
            <button
              onClick={seed}
              disabled={busyId === "seed"}
              className="mt-4 inline-flex items-center gap-2 text-sm text-white bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg disabled:opacity-60"
            >
              {busyId === "seed" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              Khởi tạo danh mục TT200
            </button>
          ) : (
            <p className="text-slate-600 text-xs mt-3">Liên hệ quản trị để khởi tạo.</p>
          )}
        </div>
      )}

      {/* Nội dung */}
      {seeded && view === "entries" && (
        <EntriesTable
          state={entries}
          busyId={busyId}
          canManage={canManage}
          onAction={entryAction}
        />
      )}
      {seeded && view === "accounts" && <AccountsTable accounts={accounts.data ?? []} loading={accounts.loading} />}
      {seeded && view === "tb" && <TrialBalancePanel />}

      {/* Modal tạo bút toán */}
      {showCreate && (
        <CreateEntryModal
          journals={journals.data ?? []}
          accounts={leafAccounts}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); entries.refresh(); }}
        />
      )}

      {/* Modal thêm tài khoản (TK con tự gắn cha theo tiền tố mã) */}
      {showAccount && (
        <CreateAccountModal
          existing={accounts.data ?? []}
          onClose={() => setShowAccount(false)}
          onCreated={() => { setShowAccount(false); accounts.refresh(); }}
        />
      )}
    </div>
  );
}

// ─── Modal thêm tài khoản ─────────────────────────────────────────────────────

function CreateAccountModal({
  existing, onClose, onCreated,
}: {
  existing: Account[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Suy ra TK cha (tiền tố dài nhất đã tồn tại) để hiển thị cho người dùng.
  const parent = useMemo(() => {
    const c = code.trim();
    for (let len = c.length - 1; len >= 3; len--) {
      const p = existing.find((a) => a.code === c.slice(0, len));
      if (p) return p;
    }
    return null;
  }, [code, existing]);

  async function submit() {
    const c = code.trim(), nm = name.trim();
    if (c.length < 3 || !nm) { setErr("Nhập mã TK (≥3 số) và tên tài khoản."); return; }
    setBusy(true); setErr(null);
    try {
      await apiSend("/api/gl/accounts", "POST", { code: c, name: nm });
      onCreated();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không tạo được tài khoản");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="font-semibold text-white">Thêm tài khoản</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs text-slate-400">Mã tài khoản (theo TT200)</label>
            <input
              value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="VD: 11211 (con của 1121), 33311…"
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
            <p className="text-xs text-slate-500 mt-1">
              {parent
                ? <>Sẽ là TK con của <span className="text-slate-300 font-mono">{parent.code}</span> — {parent.name}</>
                : code.trim().length >= 3 ? "TK cấp 1 (không có cha trong danh mục)" : "Mã dài hơn = cấp sâu hơn; tự gắn cha theo tiền tố."}
            </p>
          </div>
          <div>
            <label className="text-xs text-slate-400">Tên tài khoản</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="VD: Tiền gửi ngân hàng — Vietcombank"
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-800">
          <button onClick={onClose} className="text-sm text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-800">Huỷ</button>
          <button
            onClick={submit} disabled={busy}
            className="flex items-center gap-1.5 text-sm text-white bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded-lg disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Tạo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bút toán ─────────────────────────────────────────────────────────────────

function EntriesTable({
  state, busyId, canManage, onAction,
}: {
  state: ReturnType<typeof useApi<EntryRow[]>>;
  busyId: string | null;
  canManage: boolean;
  onAction: (id: string, a: "submit" | "post" | "reverse" | "delete") => void;
}) {
  if (state.loading) return <Centered><Loader2 className="animate-spin text-slate-500" /></Centered>;
  const rows = state.data ?? [];
  if (rows.length === 0) return <Empty text="Chưa có bút toán nào. Bấm “Tạo bút toán” để bắt đầu." />;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase">
          <tr>
            <Th>Số</Th><Th>Ngày</Th><Th>Nhật ký</Th><Th>Diễn giải</Th>
            <Th right>Số tiền</Th><Th center>TT</Th><Th right>Thao tác</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((e) => {
            const busy = busyId === e.id;
            return (
              <tr key={e.id} className="hover:bg-slate-800/40">
                <Td mono>{e.number}</Td>
                <Td>{fmtDate(e.date)}</Td>
                <Td><span className="text-slate-400">{e.journal.code}</span></Td>
                <Td>{e.description || <span className="text-slate-600">—</span>}</Td>
                <Td right mono>{fmtVnd(e.totalDebit)}</Td>
                <Td center>
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_CFG[e.status].cls}`}>{STATUS_CFG[e.status].label}</span>
                </Td>
                <Td right>
                  <div className="flex items-center justify-end gap-1">
                    {busy && <Loader2 size={14} className="animate-spin text-slate-500" />}
                    {canManage && e.status === "draft" && (
                      <>
                        <IconBtn title="Nộp duyệt" onClick={() => onAction(e.id, "submit")}><Send size={14} /></IconBtn>
                        <IconBtn title="Ghi sổ" onClick={() => onAction(e.id, "post")} cls="text-emerald-400"><CheckCircle2 size={14} /></IconBtn>
                        <IconBtn title="Xóa" onClick={() => onAction(e.id, "delete")} cls="text-red-400"><Trash2 size={14} /></IconBtn>
                      </>
                    )}
                    {canManage && e.status === "pending" && (
                      <IconBtn title="Ghi sổ" onClick={() => onAction(e.id, "post")} cls="text-emerald-400"><CheckCircle2 size={14} /></IconBtn>
                    )}
                    {canManage && e.status === "posted" && (
                      <IconBtn title="Đảo bút toán" onClick={() => onAction(e.id, "reverse")} cls="text-purple-400"><RotateCcw size={14} /></IconBtn>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tài khoản ──────────────────────────────────────────────────────────────

function AccountsTable({ accounts, loading }: { accounts: Account[]; loading: boolean }) {
  if (loading) return <Centered><Loader2 className="animate-spin text-slate-500" /></Centered>;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase">
          <tr><Th>Mã TK</Th><Th>Tên tài khoản</Th><Th>Loại</Th><Th center>Cấp</Th><Th center>Hạch toán</Th></tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {accounts.map((a) => (
            <tr key={a.id} className="hover:bg-slate-800/40">
              <Td mono>{a.code}</Td>
              <Td>
                <span style={{ paddingLeft: `${(a.level - 1) * 16}px` }} className={a.isLeaf ? "" : "font-semibold text-slate-200"}>
                  {a.name}
                </span>
              </Td>
              <Td><span className="text-xs text-slate-400">{ACCOUNT_TYPE_LABEL[a.type] ?? a.type}</span></Td>
              <Td center>{a.level}</Td>
              <Td center>
                {a.isLeaf
                  ? <span className="text-xs text-emerald-400">Có</span>
                  : <span className="text-xs text-slate-600">Tổng hợp</span>}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── CĐSPS ──────────────────────────────────────────────────────────────────

function TrialBalancePanel() {
  const tb = useApi<TrialBalance>("/api/gl/reports/trial-balance");
  if (tb.loading) return <Centered><Loader2 className="animate-spin text-slate-500" /></Centered>;
  const data = tb.data;
  if (!data || data.rows.length === 0) return <Empty text="Chưa có số phát sinh (cần bút toán đã ghi sổ)." />;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase">
          <tr><Th>Mã TK</Th><Th>Tên tài khoản</Th><Th right>Phát sinh Nợ</Th><Th right>Phát sinh Có</Th><Th right>Số dư</Th></tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {data.rows.map((r) => (
            <tr key={r.code} className="hover:bg-slate-800/40">
              <Td mono>{r.code}</Td>
              <Td>{r.name}</Td>
              <Td right mono>{r.debit ? fmtVnd(r.debit) : "—"}</Td>
              <Td right mono>{r.credit ? fmtVnd(r.credit) : "—"}</Td>
              <Td right mono className={r.balance < 0 ? "text-red-400" : ""}>{fmtVnd(r.balance)}</Td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-800/40 font-semibold text-slate-200">
          <tr>
            <Td></Td><Td>Tổng cộng</Td>
            <Td right mono>{fmtVnd(data.totals.debit)}</Td>
            <Td right mono>{fmtVnd(data.totals.credit)}</Td>
            <Td right>
              {data.balanced
                ? <span className="text-xs text-emerald-400">Cân</span>
                : <span className="text-xs text-red-400">Lệch</span>}
            </Td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Modal tạo bút toán ───────────────────────────────────────────────────────

interface DraftLine { accountId: string; debit: string; credit: string; description: string }
const emptyLine = (): DraftLine => ({ accountId: "", debit: "", credit: "", description: "" });

function CreateEntryModal({
  journals, accounts, onClose, onCreated,
}: {
  journals: Journal[];
  accounts: Account[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [journalId, setJournalId] = useState(journals[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0;

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit() {
    setErr(null);
    if (!journalId) return setErr("Chọn nhật ký");
    const payloadLines = lines
      .filter((l) => l.accountId && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0))
      .map((l) => ({
        accountId: l.accountId,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        description: l.description || undefined,
      }));
    if (payloadLines.length < 2) return setErr("Cần ít nhất 2 dòng có tài khoản và số tiền");
    if (!balanced) return setErr("Tổng Nợ phải bằng tổng Có và lớn hơn 0");

    setSubmitting(true);
    try {
      await apiSend("/api/gl/entries", "POST", { journalId, date, description: description || undefined, lines: payloadLines });
      onCreated();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Tạo bút toán thất bại");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900">
          <h3 className="font-semibold text-white">Tạo bút toán</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Nhật ký">
              <select value={journalId} onChange={(e) => setJournalId(e.target.value)} className={inputCls}>
                {journals.map((j) => <option key={j.id} value={j.id}>{j.code} — {j.name}</option>)}
              </select>
            </Field>
            <Field label="Ngày">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Diễn giải">
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Nội dung..." className={inputCls} />
            </Field>
          </div>

          {/* Dòng bút toán */}
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_120px_120px_32px] gap-2 text-xs text-slate-500 px-1">
              <span>Tài khoản</span><span className="text-right">Nợ</span><span className="text-right">Có</span><span />
            </div>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_120px_32px] gap-2 items-center">
                <select value={l.accountId} onChange={(e) => setLine(i, { accountId: e.target.value })} className={inputCls}>
                  <option value="">— Chọn TK —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
                <input inputMode="numeric" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: "" })} placeholder="0" className={`${inputCls} text-right`} />
                <input inputMode="numeric" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: "" })} placeholder="0" className={`${inputCls} text-right`} />
                <button
                  onClick={() => setLines((prev) => prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev)}
                  className="text-slate-500 hover:text-red-400 disabled:opacity-30"
                  disabled={lines.length <= 2}
                ><Trash2 size={15} /></button>
              </div>
            ))}
            <button onClick={() => setLines((p) => [...p, emptyLine()])} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
              <Plus size={14} /> Thêm dòng
            </button>
          </div>

          {/* Tổng + cân */}
          <div className="flex items-center justify-end gap-6 text-sm border-t border-slate-800 pt-3">
            <span className="text-slate-400">Tổng Nợ: <span className="text-slate-100 font-mono">{fmtVnd(totalDebit)}</span></span>
            <span className="text-slate-400">Tổng Có: <span className="text-slate-100 font-mono">{fmtVnd(totalCredit)}</span></span>
            <span className={balanced ? "text-emerald-400" : "text-amber-400"}>{balanced ? "Cân ✓" : "Chưa cân"}</span>
          </div>

          {err && (
            <div className="flex items-center gap-2 text-sm text-red-300 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
              <AlertTriangle size={15} /> {err}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-800 sticky bottom-0 bg-slate-900">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-300 hover:text-white">Hủy</button>
          <button
            onClick={submit}
            disabled={submitting || !balanced}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50"
          >
            {submitting && <Loader2 size={15} className="animate-spin" />} Lưu nháp
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── UI primitives ────────────────────────────────────────────────────────────

const inputCls = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs text-slate-500 mb-1">{label}</span>{children}</label>;
}
function Th({ children, right, center }: { children?: React.ReactNode; right?: boolean; center?: boolean }) {
  return <th className={`px-4 py-2.5 font-medium ${right ? "text-right" : center ? "text-center" : "text-left"}`}>{children}</th>;
}
function Td({ children, right, center, mono, className = "" }: { children?: React.ReactNode; right?: boolean; center?: boolean; mono?: boolean; className?: string }) {
  return <td className={`px-4 py-2.5 text-slate-300 ${right ? "text-right" : center ? "text-center" : ""} ${mono ? "font-mono text-xs" : ""} ${className}`}>{children}</td>;
}
function IconBtn({ children, title, onClick, cls = "text-slate-400" }: { children: React.ReactNode; title: string; onClick: () => void; cls?: string }) {
  return <button title={title} onClick={onClick} className={`p-1.5 rounded hover:bg-slate-700 ${cls}`}>{children}</button>;
}
function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center py-16">{children}</div>;
}
function Empty({ text }: { text: string }) {
  return <div className="bg-slate-900 border border-slate-800 rounded-xl py-12 text-center text-slate-500 text-sm">{text}</div>;
}
