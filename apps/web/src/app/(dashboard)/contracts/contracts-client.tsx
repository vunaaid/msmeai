"use client";

// src/app/(dashboard)/contracts/contracts-client.tsx
// Module Hợp Đồng — 4 tab: Đầu ra · Đầu vào · Lịch thanh toán · Mẫu biểu.

import { useState } from "react";
import Link from "next/link";
import {
  FileSignature, Plus, Loader2, TrendingUp, TrendingDown,
  CalendarClock, AlertTriangle, FileText, Lock,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { apiFetch, useApi } from "@/lib/api/client";
import {
  DIRECTION_LABEL, TYPE_LABEL, STATUS_LABEL, STATUS_COLOR, SCHEDULE_STATUS_LABEL,
  formatVnd, formatDate,
  type Direction, type ContractType, type ContractStatus, type ScheduleStatus, type ContractPrefill,
} from "./contract-meta";
import { CreateContractModal } from "./create-contract-modal";
import { ContractsAssistant } from "./contracts-assistant";

type Tab = "outbound" | "inbound" | "schedules" | "templates";

interface ContractItem {
  id: string;
  number: string;
  title: string;
  direction: Direction;
  type: ContractType;
  status: ContractStatus;
  partyName: string;
  value: string;
  currency: string;
  endDate: string | null;
  _count?: { schedules: number; signatories: number };
}
interface Stats {
  outbound: { count: number; totalValue: string };
  inbound: { count: number; totalValue: string };
  expiringSoon: number;
  overduePayments: number;
}
interface TemplateItem {
  id: string; name: string; description?: string | null; fileType: string;
  isSystem: boolean; companyId: string | null;
}

export function ContractsClient({ canManage, roleName, roleLevel }: {
  canManage: boolean;
  roleName: string | null;
  roleLevel: string | null;
}) {
  const [tab, setTab] = useState<Tab>("outbound");
  const [creating, setCreating] = useState<null | Direction>(null);
  const [prefill, setPrefill] = useState<ContractPrefill | null>(null);

  const stats = useApi<Stats>("/api/contracts/stats");
  const listPath =
    tab === "outbound" ? "/api/contracts?direction=outbound&limit=100" :
    tab === "inbound" ? "/api/contracts?direction=inbound&limit=100" :
    null;
  const list = useApi<ContractItem[]>(listPath);
  const templates = useApi<TemplateItem[]>(tab === "templates" ? "/api/contracts/templates" : null);

  return (
    <>
      <PageHeader
        icon={FileSignature}
        title="Hợp Đồng"
        subtitle="Quản lý hợp đồng đầu vào / đầu ra, mẫu biểu & lịch thanh toán"
        actions={
          canManage ? (
            <button
              onClick={() => setCreating(tab === "inbound" ? "inbound" : "outbound")}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
            >
              <Plus size={15} /> Tạo hợp đồng
            </button>
          ) : null
        }
      />

      {/* Bố cục 2 cột: nội dung (trái) + Trợ lý AI Hợp đồng (phải) */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4">
      <div className="min-w-0">
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard icon={TrendingUp} color="text-emerald-400" label="Đầu ra (hiệu lực)"
          value={stats.data ? formatVnd(stats.data.outbound.totalValue) : "…"}
          sub={stats.data ? `${stats.data.outbound.count} hợp đồng` : ""} />
        <StatCard icon={TrendingDown} color="text-rose-400" label="Đầu vào (hiệu lực)"
          value={stats.data ? formatVnd(stats.data.inbound.totalValue) : "…"}
          sub={stats.data ? `${stats.data.inbound.count} hợp đồng` : ""} />
        <StatCard icon={CalendarClock} color="text-amber-400" label="Sắp hết hạn (30 ngày)"
          value={stats.data ? String(stats.data.expiringSoon) : "…"} sub="hợp đồng" />
        <StatCard icon={AlertTriangle} color="text-orange-400" label="Đợt TT quá hạn"
          value={stats.data ? String(stats.data.overduePayments) : "…"} sub="đợt" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-slate-800 overflow-x-auto">
        {([
          ["outbound", "Đầu ra"],
          ["inbound", "Đầu vào"],
          ["schedules", "Lịch thanh toán"],
          ["templates", "Mẫu biểu"],
        ] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === v ? "border-cyan-500 text-cyan-300" : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {(tab === "outbound" || tab === "inbound") && <ContractList state={list} />}
      {tab === "schedules" && <SchedulesTab />}
      {tab === "templates" && <TemplateList state={templates} />}
      </div>

      {/* Cột phải: Trợ lý AI Hợp đồng */}
      <aside className="min-w-0">
        <div className="xl:sticky xl:top-4">
          <ContractsAssistant
            roleName={roleName}
            roleLevel={roleLevel}
            canManage={canManage}
            onCreateFromDraft={(p) => { setCreating(null); setPrefill(p); }}
          />
        </div>
      </aside>
      </div>

      <CreateContractModal
        direction={creating}
        prefill={prefill}
        onClose={() => { setCreating(null); setPrefill(null); }}
        onSuccess={() => { setCreating(null); setPrefill(null); list.refresh(); stats.refresh(); }}
      />
    </>
  );
}

// ─── KPI card ───────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, color, label, value, sub }: {
  icon: React.ElementType; color: string; label: string; value: string; sub: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
        <Icon className={`w-4 h-4 ${color}`} /> {label}
      </div>
      <div className="text-white font-bold text-lg leading-tight">{value}</div>
      <div className="text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

// ─── Danh sách hợp đồng ───────────────────────────────────────────────────────
function ContractList({ state }: { state: ReturnType<typeof useApi<ContractItem[]>> }) {
  if (state.loading) return <Centered><Loader2 className="animate-spin" /> Đang tải…</Centered>;
  if (state.error) return <Centered className="text-red-400">⚠ {state.error}</Centered>;
  const items = state.data ?? [];
  if (!items.length) return <Empty text="Chưa có hợp đồng. Bấm “Tạo hợp đồng” để bắt đầu." />;

  return (
    <div className="grid gap-2">
      {items.map((c) => (
        <Link key={c.id} href={`/contracts/${c.id}`}
          className="flex items-center gap-3 px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors">
          <FileSignature className="w-6 h-6 shrink-0 text-cyan-400" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-white font-medium truncate hover:text-cyan-300">{c.title}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_COLOR[c.status]}`}>{STATUS_LABEL[c.status]}</span>
            </div>
            <div className="text-xs text-slate-500 truncate">
              {c.number} · {TYPE_LABEL[c.type]} · {c.partyName}
              {c.endDate ? ` · hết hạn ${formatDate(c.endDate)}` : ""}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-white font-semibold text-sm">{formatVnd(c.value, c.currency)}</div>
            <div className="text-[11px] text-slate-500">{DIRECTION_LABEL[c.direction]}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Tab lịch thanh toán (cross-contract) ─────────────────────────────────────
interface ScheduleRow {
  id: string; installmentNo: number; description: string | null; dueDate: string | null;
  amount: string; paidAmount: string; status: ScheduleStatus;
  contract: { id: string; number: string; title: string; direction: Direction; currency: string };
}
function SchedulesTab() {
  // Gộp lịch từ cả 2 chiều: lấy danh sách hợp đồng rồi map đợt. Đơn giản hóa giai đoạn 1:
  // dùng endpoint chi tiết qua list — ở đây ta gọi một lần list cả công ty và đọc _count,
  // nhưng để hiển thị đợt thực, ta fetch riêng. Giai đoạn 1: hiển thị hướng dẫn + link.
  const out = useApi<ContractItem[]>("/api/contracts?limit=100");
  if (out.loading) return <Centered><Loader2 className="animate-spin" /> Đang tải…</Centered>;
  const items = (out.data ?? []).filter((c) => (c._count?.schedules ?? 0) > 0);
  if (!items.length) return <Empty text="Chưa có hợp đồng nào thiết lập lịch thanh toán. Mở một hợp đồng để thêm các đợt." />;
  return (
    <div className="grid gap-2">
      <p className="text-xs text-slate-500 mb-1">Các hợp đồng đã có lịch thanh toán — bấm để xem & ghi nhận từng đợt:</p>
      {items.map((c) => (
        <Link key={c.id} href={`/contracts/${c.id}`}
          className="flex items-center gap-3 px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors">
          <CalendarClock className="w-5 h-5 shrink-0 text-amber-400" />
          <div className="flex-1 min-w-0">
            <div className="text-white font-medium truncate">{c.title}</div>
            <div className="text-xs text-slate-500">{c.number} · {DIRECTION_LABEL[c.direction]} · {c._count?.schedules} đợt</div>
          </div>
          <div className="text-white font-semibold text-sm">{formatVnd(c.value, c.currency)}</div>
        </Link>
      ))}
    </div>
  );
}

// ─── Tab mẫu biểu ─────────────────────────────────────────────────────────────
function TemplateList({ state }: { state: ReturnType<typeof useApi<TemplateItem[]>> }) {
  async function download(id: string) {
    try {
      const { data } = await apiFetch<{ url: string }>(`/api/documents/templates/${id}/download`);
      if (data?.url) window.open(data.url, "_blank");
    } catch { /* ignore */ }
  }
  if (state.loading) return <Centered><Loader2 className="animate-spin" /> Đang tải…</Centered>;
  if (state.error) return <Centered className="text-red-400">⚠ {state.error}</Centered>;
  const items = state.data ?? [];
  if (!items.length) {
    return <Empty text="Chưa có mẫu biểu hợp đồng. Tải mẫu lên ở module Tài Liệu với phân loại (category) = contract." />;
  }
  return (
    <div className="grid gap-2">
      {items.map((t) => {
        const isSystem = t.isSystem || t.companyId === null;
        return (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl">
            <FileText className="w-6 h-6 shrink-0 text-blue-400" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium truncate">{t.name}</span>
                {isSystem ? (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <Lock size={9} /> Hệ thống
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">Công ty</span>
                )}
              </div>
              {t.description ? <div className="text-xs text-slate-500 truncate">{t.description}</div> : null}
            </div>
            <button onClick={() => download(t.id)} className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg">
              Tải về
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Centered({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex items-center justify-center gap-2 py-16 text-slate-400 text-sm ${className}`}>{children}</div>;
}
function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <FileSignature className="w-10 h-10 text-slate-600 mb-3" />
      <p className="text-slate-400 text-sm max-w-md">{text}</p>
    </div>
  );
}
