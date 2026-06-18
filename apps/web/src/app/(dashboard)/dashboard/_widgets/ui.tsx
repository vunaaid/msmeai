"use client";

// src/app/(dashboard)/dashboard/_widgets/ui.tsx
// UI dùng chung cho các widget dashboard: thẻ Card, định dạng tiền/ngày,
// trạng thái loading/lỗi/rỗng, badge trạng thái.

import Link from "next/link";
import type { ReactNode } from "react";

/** Thẻ widget chuẩn — header (icon + tiêu đề + đếm) + link "Xem" + body. */
export function Card({
  title,
  icon,
  href,
  count,
  accent = "text-slate-400",
  children,
}: {
  title: string;
  icon: ReactNode;
  href?: string;
  count?: number | string;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col">
      <header className="flex items-center gap-2 mb-3">
        <span className={accent}>{icon}</span>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {count !== undefined && count !== "" && (
          <span className="text-xs bg-slate-800 text-slate-300 rounded-full px-2 py-0.5">
            {count}
          </span>
        )}
        {href && (
          <Link
            href={href}
            className="ml-auto text-xs text-slate-500 hover:text-slate-300 whitespace-nowrap"
          >
            Xem tất cả →
          </Link>
        )}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

/** Bọc trạng thái của useApi: loading skeleton / lỗi / rỗng / nội dung. */
export function State({
  loading,
  error,
  empty,
  emptyText = "Không có dữ liệu",
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText?: string;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div className="space-y-2 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 bg-slate-800/70 rounded-lg" />
        ))}
      </div>
    );
  if (error) return <p className="text-sm text-red-400/80">{error}</p>;
  if (empty) return <p className="text-sm text-slate-500 py-2">{emptyText}</p>;
  return <>{children}</>;
}

/** Một dòng KPI lớn (số + nhãn). */
export function Kpi({
  label,
  value,
  tone = "text-white",
  sub,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  sub?: ReactNode;
}) {
  return (
    <div>
      <div className={`text-xl font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

/** Dòng danh sách gọn: tiêu đề + meta phải. */
export function Row({
  href,
  title,
  meta,
  right,
}: {
  href?: string;
  title: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
}) {
  const body = (
    <div className="flex items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-200 truncate">{title}</div>
        {meta && <div className="text-[11px] text-slate-500 truncate">{meta}</div>}
      </div>
      {right && <div className="flex-shrink-0 text-xs">{right}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:bg-slate-800/50 rounded-md px-2 -mx-2">
      {body}
    </Link>
  ) : (
    <div className="px-2 -mx-2">{body}</div>
  );
}

// ─── Định dạng ────────────────────────────────────────────────────────────────

/** Tiền VND rút gọn: 1.2 tỷ · 350 tr · 12k · 0. */
export function vndShort(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e9) return `${sign}${trim(a / 1e9)} tỷ`;
  if (a >= 1e6) return `${sign}${trim(a / 1e6)} tr`;
  if (a >= 1e3) return `${sign}${Math.round(a / 1e3)}k`;
  return `${sign}${Math.round(a)}`;
}

function trim(x: number): string {
  return (Math.round(x * 10) / 10).toString();
}

/** Tiền VND đầy đủ: 1.234.567 ₫ */
export function vndFull(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(n))} ₫`;
}

/** Ngày dd/MM. */
export function fmtDate(d?: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

const PRIORITY_TONE: Record<string, string> = {
  urgent: "text-red-400",
  high: "text-amber-400",
  normal: "text-slate-400",
  low: "text-slate-500",
};

export function priorityTone(p?: string): string {
  return PRIORITY_TONE[p ?? "normal"] ?? "text-slate-400";
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  pending_approval: "Chờ duyệt",
  pending: "Chờ duyệt",
  active: "Đang mở",
  in_progress: "Đang làm",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
  posted: "Đã ghi sổ",
  reversed: "Đã đảo",
  rejected: "Từ chối",
  planning: "Lập kế hoạch",
  on_hold: "Tạm dừng",
};

export function statusLabel(s?: string): string {
  return STATUS_LABEL[s ?? ""] ?? s ?? "";
}

export function Badge({ children, tone = "bg-slate-800 text-slate-300" }: { children: ReactNode; tone?: string }) {
  return <span className={`text-[11px] rounded px-1.5 py-0.5 ${tone}`}>{children}</span>;
}

/** Bút toán quá hạn? dueDate < hôm nay và chưa hoàn thành. */
export function isOverdue(dueDate?: string | null, status?: string): boolean {
  if (!dueDate) return false;
  if (status === "completed" || status === "cancelled") return false;
  return new Date(dueDate).getTime() < Date.now();
}
