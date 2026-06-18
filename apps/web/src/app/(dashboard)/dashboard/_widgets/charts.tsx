"use client";

// src/app/(dashboard)/dashboard/_widgets/charts.tsx
// Biểu đồ SVG thuần (zero-dependency) — Line & Pie. Dùng cho Cụm Tài Chính.
// Không phụ thuộc thư viện ngoài (pnpm add đang bị chặn do Node 20 / pnpm 11 — xem memory).

import type { ReactNode } from "react";

export interface LineSeries {
  label: string;
  color: string;
  values: number[]; // cùng độ dài với categories
}

/** Biểu đồ đường nhiều chuỗi, có đường 0, chấm điểm, tooltip & chú thích. */
export function LineChart({
  series,
  categories,
  format = (n) => String(n),
  height = 140,
}: {
  series: LineSeries[];
  categories: string[];
  format?: (n: number) => string;
  height?: number;
}) {
  // Chưa có dữ liệu → vẫn hiển thị khung chart (mờ) + chú thích, để user biết có mục này.
  const hasData = series.some((s) => s.values.some((v) => Number.isFinite(v) && v !== 0));
  if (!hasData) return <EmptyChart variant="line" height={height} categories={categories} />;

  const W = 320;
  const H = height;
  const padL = 8, padR = 8, padT = 12, padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = categories.length;

  const all = series.flatMap((s) => s.values);
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const range = max - min || 1;

  const x = (i: number) => (n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);
  const y = (v: number) => padT + (1 - (v - min) / range) * plotH;
  const zeroY = y(0);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet" role="img">
        {/* đường 0 */}
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="#334155" strokeWidth={1} strokeDasharray="3 3" />
        {/* nhãn trục X */}
        {categories.map((c, i) => (
          <text key={c + i} x={x(i)} y={H - 6} fill="#64748b" fontSize={10} textAnchor="middle">
            {c}
          </text>
        ))}
        {/* các chuỗi */}
        {series.map((s) => (
          <g key={s.label}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill={s.color}>
                <title>{`${s.label} · ${categories[i]}: ${format(v)}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
    </div>
  );
}

/** Biểu đồ tròn (donut) — kèm chú thích + %. */
export function PieChart({
  data,
  size = 132,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const slices = data.filter((d) => d.value > 0);
  const total = slices.reduce((s, d) => s + d.value, 0);
  const cx = size / 2, cy = size / 2, r = size / 2 - 2, rInner = r * 0.58;

  // Chưa có dữ liệu → vẫn hiển thị khung tròn (mờ) + chú thích.
  if (total <= 0) return <EmptyChart variant="pie" height={size} />;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="flex-shrink-0" role="img">
        {slices.length === 1 ? (
          <circle cx={cx} cy={cy} r={(r + rInner) / 2} fill="none" stroke={slices[0]!.color} strokeWidth={r - rInner}>
            <title>{`${slices[0]!.label}: 100%`}</title>
          </circle>
        ) : (
          (() => {
            let angle = 0;
            return slices.map((d) => {
              const start = angle;
              const end = angle + (d.value / total) * 360;
              angle = end;
              return (
                <path key={d.label} d={arc(cx, cy, r, rInner, start, end)} fill={d.color}>
                  <title>{`${d.label}: ${Math.round((d.value / total) * 100)}%`}</title>
                </path>
              );
            });
          })()
        )}
      </svg>
      <Legend
        vertical
        items={slices.map((d) => ({
          label: d.label,
          color: d.color,
          right: total > 0 ? `${Math.round((d.value / total) * 100)}%` : "",
        }))}
      />
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** Path cho 1 lát donut (vòng ngoài r, vòng trong rInner) từ start→end (độ, theo chiều kim đồng hồ). */
function arc(cx: number, cy: number, r: number, rInner: number, start: number, end: number): string {
  const [ox1, oy1] = polar(cx, cy, r, start);
  const [ox2, oy2] = polar(cx, cy, r, end);
  const [ix2, iy2] = polar(cx, cy, rInner, end);
  const [ix1, iy1] = polar(cx, cy, rInner, start);
  const large = end - start > 180 ? 1 : 0;
  return [
    `M ${ox1} ${oy1}`,
    `A ${r} ${r} 0 ${large} 1 ${ox2} ${oy2}`,
    `L ${ix2} ${iy2}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${ix1} ${iy1}`,
    "Z",
  ].join(" ");
}

function Legend({
  items,
  vertical = false,
}: {
  items: { label: string; color: string; right?: ReactNode }[];
  vertical?: boolean;
}) {
  return (
    <ul className={vertical ? "space-y-1 text-xs min-w-0" : "flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs"}>
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: it.color }} />
          <span className="text-slate-400 truncate">{it.label}</span>
          {it.right !== undefined && <span className="text-slate-300 ml-auto pl-2">{it.right}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Khung chart khi CHƯA có dữ liệu — vẫn vẽ khung (mờ) + chú thích, để user biết
 * có mục này và có thể kích hoạt/sử dụng phân hệ tương ứng.
 */
function EmptyChart({
  variant,
  height,
  categories = [],
  hint = "Sẽ hiển thị khi phân hệ có số liệu",
}: {
  variant: "line" | "pie";
  height: number;
  categories?: string[];
  hint?: string;
}) {
  return (
    <div className="relative" style={{ minHeight: height }}>
      <div className="opacity-30 pointer-events-none">
        {variant === "line" ? <LineSkeleton height={height} categories={categories} /> : <PieSkeleton size={height} />}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
        <span className="text-sm text-slate-400">Chưa có dữ liệu</span>
        <span className="text-[11px] text-slate-500 mt-0.5">{hint}</span>
      </div>
    </div>
  );
}

/** Khung đường mờ (trục 0 + đường mẫu) cho trạng thái rỗng. */
function LineSkeleton({ height, categories }: { height: number; categories: string[] }) {
  const W = 320, H = height, padL = 8, padR = 8, padT = 12, padB = 20;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const cats = categories.length ? categories : ["", "", "", ""];
  const n = cats.length;
  const x = (i: number) => (n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);
  const ratio = [0.6, 0.45, 0.55, 0.4];
  const y = (i: number) => padT + plotH * (ratio[i % ratio.length] ?? 0.5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <line x1={padL} y1={padT + plotH / 2} x2={W - padR} y2={padT + plotH / 2} stroke="#334155" strokeWidth={1} strokeDasharray="3 3" />
      <polyline fill="none" stroke="#475569" strokeWidth={2} strokeDasharray="4 4" points={cats.map((_, i) => `${x(i)},${y(i)}`).join(" ")} />
      {cats.map((c, i) => (
        <text key={i} x={x(i)} y={H - 6} fill="#475569" fontSize={10} textAnchor="middle">{c}</text>
      ))}
    </svg>
  );
}

/** Khung tròn mờ cho trạng thái rỗng. */
function PieSkeleton({ size }: { size: number }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 2, rInner = r * 0.58;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
      <circle cx={cx} cy={cy} r={(r + rInner) / 2} fill="none" stroke="#334155" strokeWidth={r - rInner} strokeDasharray="5 4" />
    </svg>
  );
}

/** Bảng màu dùng cho pie. */
export const CHART_PALETTE = [
  "#38bdf8", "#34d399", "#fbbf24", "#f472b6", "#a78bfa",
  "#fb7185", "#22d3ee", "#facc15", "#4ade80", "#94a3b8",
];
