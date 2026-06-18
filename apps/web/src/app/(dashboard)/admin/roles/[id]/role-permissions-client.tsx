"use client";

// src/app/(dashboard)/admin/roles/[id]/role-permissions-client.tsx

import { useState, useTransition } from "react";
import {
  Shield, Loader2, CheckSquare, Square,
  Info, Lock,
} from "lucide-react";
import { apiSend } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/page-header";

interface ModuleInfo {
  key: string;
  name: string;
  description: string;
  tier: string;
  icon: string;
  canDisable: boolean;
}

interface Props {
  roleId: string;
  roleName: string;
  roleLevel: string;
  isSystemRole: boolean;
  currentPermissions: Record<string, string[]>; // { moduleKey: actions[] }
  modules: ModuleInfo[];
}

const TIER_LABEL: Record<string, string> = {
  core:     "Nghiệp Vụ",
  extended: "Vận Hành",
  ai:       "AI",
};

const TIER_COLOR: Record<string, string> = {
  core:     "text-blue-400",
  extended: "text-emerald-400",
  ai:       "text-purple-400",
};

const ACTIONS = ["read", "write", "delete", "approve"] as const;
const ACTION_LABEL: Record<string, string> = {
  read:    "Xem",
  write:   "Tạo/Sửa",
  delete:  "Xóa",
  approve: "Duyệt",
};

// Modules that are always enabled (cannot be disabled for any role)
const ALWAYS_ENABLED = new Set(["admin", "foundation", "work"]);

export function RolePermissionsClient({
  roleId, roleName, roleLevel, isSystemRole, currentPermissions, modules,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State: module → Set of actions
  const [permissions, setPermissions] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const [mod, actions] of Object.entries(currentPermissions)) {
      init[mod] = new Set(actions);
    }
    return init;
  });

  const hasModuleAccess = (moduleKey: string) => {
    return (permissions[moduleKey]?.size ?? 0) > 0;
  };

  const hasAction = (moduleKey: string, action: string) => {
    return permissions[moduleKey]?.has(action) ?? false;
  };

  // Tự động lưu ngay khi bật/tắt một module hoặc hành động.
  const persist = (perms: Record<string, Set<string>>) => {
    setError(null);
    startTransition(async () => {
      try {
        const modules: Record<string, string[]> = {};
        for (const [mod, actions] of Object.entries(perms)) {
          if (actions.size > 0) modules[mod] = [...actions];
        }
        // Module mặc định luôn bật cho mọi vai trò
        modules["foundation"] = ["read"];
        modules["admin"] = ["read"];
        modules["work"] = ["read", "write"];

        await apiSend(`/api/roles/${roleId}/permissions`, "PUT", { modules });

        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi kết nối máy chủ");
      }
    });
  };

  const toggleModule = (moduleKey: string) => {
    if (ALWAYS_ENABLED.has(moduleKey)) return;
    const next = { ...permissions };
    if (hasModuleAccess(moduleKey)) {
      delete next[moduleKey];
    } else {
      next[moduleKey] = new Set(["read"]);
    }
    setPermissions(next);
    persist(next);
  };

  const toggleAction = (moduleKey: string, action: string) => {
    if (!hasModuleAccess(moduleKey)) return; // module phải được bật trước
    if (action === "read") { // read là bắt buộc nếu module bật
      if (ALWAYS_ENABLED.has(moduleKey)) return;
      toggleModule(moduleKey);
      return;
    }
    const next = { ...permissions };
    const current = new Set(next[moduleKey] ?? []);
    if (current.has(action)) {
      current.delete(action);
    } else {
      current.add(action);
    }
    next[moduleKey] = current;
    setPermissions(next);
    persist(next);
  };

  // Group modules by tier
  const byTier: Record<string, ModuleInfo[]> = {};
  for (const mod of modules) {
    if (!byTier[mod.tier]) byTier[mod.tier] = [];
    byTier[mod.tier]!.push(mod);
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <PageHeader
        icon={Shield}
        iconColor="text-amber-400"
        backHref="/admin/roles"
        title={`Cấu hình quyền: ${roleName}`}
        subtitle="Chọn module và hành động vai trò này được phép thực hiện"
        actions={
          <div className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium">
            {isPending ? (
              <span className="flex items-center gap-1.5 text-cyan-400"><Loader2 size={14} className="animate-spin" /> Đang lưu...</span>
            ) : saved ? (
              <span className="text-emerald-400">✓ Đã lưu</span>
            ) : (
              <span className="text-slate-500">Tự động lưu</span>
            )}
          </div>
        }
      />

      {/* Notice */}
      {isSystemRole && (
        <div className="flex items-center gap-2 p-3 bg-amber-900/20 border border-amber-800/40 rounded-xl text-sm text-amber-300">
          <Lock size={14} className="flex-shrink-0" />
          Role hệ thống — không thể xóa, nhưng vẫn có thể chỉnh quyền bên dưới.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
          ⚠ {error}
        </div>
      )}

      {/* Info row */}
      <div className="flex items-start gap-2 p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-xs text-slate-400">
        <Info size={13} className="mt-0.5 flex-shrink-0 text-slate-500" />
        <span>
          Module <strong className="text-slate-300">Quản Lý Công Việc</strong> và <strong className="text-slate-300">Quản Trị</strong> luôn bật cho mọi vai trò.
          Thay đổi có hiệu lực khi người dùng <strong className="text-slate-300">đăng nhập lại</strong>.
        </span>
      </div>

      {/* Module groups */}
      {(["core", "extended", "ai"] as const).map(tier => {
        const tierModules = byTier[tier];
        if (!tierModules || tierModules.length === 0) return null;

        return (
          <div key={tier} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            {/* Tier header */}
            <div className="px-5 py-3 border-b border-slate-800 bg-slate-800/30">
              <h3 className={`text-xs font-semibold uppercase tracking-wider ${TIER_COLOR[tier]}`}>
                {TIER_LABEL[tier]}
              </h3>
            </div>

            <div className="divide-y divide-slate-800">
              {tierModules.map(mod => {
                const isAlways = ALWAYS_ENABLED.has(mod.key);
                const isEnabled = isAlways || hasModuleAccess(mod.key);

                return (
                  <div key={mod.key} className={`px-5 py-4 transition-colors ${isEnabled ? "" : "opacity-50"}`}>
                    {/* Module row */}
                    <div className="flex items-center gap-3">
                      {/* Toggle switch */}
                      <button
                        type="button"
                        disabled={isAlways}
                        onClick={() => toggleModule(mod.key)}
                        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                          isEnabled ? "bg-cyan-600" : "bg-slate-700"
                        } ${isAlways ? "cursor-not-allowed opacity-80" : "cursor-pointer"}`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            isEnabled ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-200">{mod.name}</span>
                          {isAlways && (
                            <span className="text-xs text-slate-600 border border-slate-700 px-1.5 py-0.5 rounded">Mặc định</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{mod.description}</p>
                      </div>
                    </div>

                    {/* Actions checkboxes — chỉ hiển thị khi module bật và không phải always-on */}
                    {isEnabled && !isAlways && (
                      <div className="mt-3 ml-14 flex flex-wrap gap-3">
                        {ACTIONS.map(action => (
                          <label
                            key={action}
                            className="flex items-center gap-1.5 cursor-pointer group"
                          >
                            <button
                              type="button"
                              disabled={action === "read"}
                              onClick={() => toggleAction(mod.key, action)}
                              className="text-slate-500 hover:text-cyan-400 transition-colors disabled:cursor-not-allowed"
                            >
                              {hasAction(mod.key, action)
                                ? <CheckSquare size={14} className="text-cyan-400" />
                                : <Square size={14} />
                              }
                            </button>
                            <span className={`text-xs ${hasAction(mod.key, action) ? "text-slate-300" : "text-slate-600"}`}>
                              {ACTION_LABEL[action]}
                              {action === "read" && <span className="text-slate-700 ml-0.5">(bắt buộc)</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
