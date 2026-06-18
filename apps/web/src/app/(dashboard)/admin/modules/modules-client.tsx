"use client";

// src/app/(dashboard)/admin/modules/modules-client.tsx
// Bật/tắt các phân hệ nghiệp vụ cho công ty. Gọi /api/admin/modules + toggle.

import { useState } from "react";
import {
  Shield, Settings, BookOpen, FileText, TrendingUp, TrendingDown,
  Banknote, Calculator, BarChart3, ShoppingCart, Package, Users,
  Building2, Pen, Bot, ClipboardList, FileStack, NotebookPen,
  MessagesSquare, Loader2, AlertTriangle, Lock, RefreshCw,
} from "lucide-react";
import { useApi, apiSend, ApiError } from "@/lib/api/client";

const ICON_MAP: Record<string, React.ElementType> = {
  Shield, Settings, BookOpen, FileText, TrendingUp, TrendingDown,
  Banknote, Calculator, BarChart3, ShoppingCart, Package, Users,
  Building2, Pen, Bot, ClipboardList, FileStack, NotebookPen, MessagesSquare,
};

interface ModuleRow {
  key: string;
  name: string;
  description: string;
  tier: "core" | "extended" | "ai";
  icon: string;
  dependencies: string[];
  enabled: boolean;
  canEnable: boolean;
  canDisable: boolean;
  missingDeps: string[];
  blockingDependents: string[];
}

const TIER_LABEL: Record<string, string> = {
  core: "Lõi & Nghiệp Vụ",
  extended: "Vận Hành",
  ai: "AI System",
};

export function ModulesClient() {
  const { data, loading, error, refresh, refreshing } = useApi<ModuleRow[]>("/api/admin/modules");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  async function toggle(m: ModuleRow) {
    setBusy(m.key);
    setActionErr(null);
    try {
      await apiSend(`/api/admin/modules/${m.key}/toggle`, "PUT", { enabled: !m.enabled });
      refresh();
    } catch (e) {
      setActionErr(e instanceof ApiError ? e.message : "Không thể thay đổi trạng thái module");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="animate-spin mr-2" size={18} /> Đang tải cấu hình modules...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900 border border-red-800/40 rounded-xl p-6 text-center">
        <AlertTriangle size={24} className="text-red-400 mx-auto mb-2" />
        <p className="text-red-300 text-sm">{error}</p>
        <button onClick={refresh} className="mt-3 text-sm text-slate-300 hover:text-white inline-flex items-center gap-1.5">
          <RefreshCw size={14} /> Thử lại
        </button>
      </div>
    );
  }

  const mods = data ?? [];
  const tiers: ModuleRow["tier"][] = ["core", "extended", "ai"];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {mods.filter((m) => m.enabled).length}/{mods.length} module đang bật
        </p>
        <button
          onClick={refresh}
          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          title="Tải lại"
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {actionErr && (
        <div className="flex items-center gap-2 text-sm text-red-300 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
          <AlertTriangle size={15} /> {actionErr}
        </div>
      )}

      {tiers.map((tier) => {
        const group = mods.filter((m) => m.tier === tier);
        if (group.length === 0) return null;
        return (
          <div key={tier} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{TIER_LABEL[tier]}</h2>
            </div>
            <div className="divide-y divide-slate-800">
              {group.map((m) => (
                <ModuleItem key={m.key} m={m} busy={busy === m.key} onToggle={() => toggle(m)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ModuleItem({ m, busy, onToggle }: { m: ModuleRow; busy: boolean; onToggle: () => void }) {
  const Icon = ICON_MAP[m.icon] ?? Shield;
  const mandatory = m.enabled && !m.canDisable;
  // Khóa toggle khi: đang xử lý / module bắt buộc / không đủ điều kiện bật/tắt
  const locked = busy || mandatory || (!m.enabled && !m.canEnable) || (m.enabled && !m.canDisable);

  const reason =
    mandatory ? "Module bắt buộc — không thể tắt"
      : !m.enabled && m.missingDeps.length > 0 ? `Cần bật trước: ${m.missingDeps.join(", ")}`
      : m.enabled && m.blockingDependents.length > 0 ? `Đang được dùng bởi: ${m.blockingDependents.join(", ")}`
      : "";

  return (
    <div className="flex items-center gap-4 px-5 py-4 hover:bg-slate-800/40 transition-colors">
      <div className={`p-2 rounded-lg ${m.enabled ? "bg-blue-500/10" : "bg-slate-800"}`}>
        <Icon size={18} className={m.enabled ? "text-blue-400" : "text-slate-500"} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-200">{m.name}</p>
          {mandatory && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700 inline-flex items-center gap-1">
              <Lock size={10} /> Bắt buộc
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-0.5 truncate">{m.description}</p>
        {reason && <p className="text-[11px] text-amber-500/80 mt-1">{reason}</p>}
      </div>

      <button
        onClick={onToggle}
        disabled={locked}
        title={reason || (m.enabled ? "Tắt module" : "Bật module")}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
          m.enabled ? "bg-blue-600" : "bg-slate-700"
        } ${locked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        {busy ? (
          <Loader2 size={12} className="animate-spin text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        ) : (
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${m.enabled ? "translate-x-5" : "translate-x-0"}`} />
        )}
      </button>
    </div>
  );
}
