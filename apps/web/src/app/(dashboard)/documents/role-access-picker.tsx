"use client";

// src/app/(dashboard)/documents/role-access-picker.tsx
// Chọn các vai trò được phép xem tài liệu. Bỏ trống = toàn công ty.

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

interface Role { id: string; name: string; level: string }

export function RoleAccessPicker({ value, onChange }: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Role[]>("/api/documents/role-options")
      .then((r) => setRoles(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-300">Quyền xem (theo vai trò)</label>
      <p className="text-[11px] text-slate-500">Bỏ trống = mọi người trong công ty đều xem được.</p>
      <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/50 divide-y divide-slate-800/70">
        {loading ? (
          <p className="px-3 py-2 text-xs text-slate-500">Đang tải vai trò…</p>
        ) : roles.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">Không có vai trò</p>
        ) : (
          roles.map((r) => (
            <label key={r.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-800">
              <input type="checkbox" checked={value.includes(r.id)} onChange={() => toggle(r.id)}
                className="w-3.5 h-3.5 accent-cyan-500 shrink-0" />
              <span className="text-sm text-slate-200 flex-1 truncate">{r.name}</span>
              <span className="text-[10px] text-slate-500">{r.level}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
