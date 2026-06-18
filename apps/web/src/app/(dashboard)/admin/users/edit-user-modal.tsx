"use client";

// src/app/(dashboard)/admin/users/edit-user-modal.tsx

import { useState, useEffect, useTransition } from "react";
import { X, Loader2, Pencil, Users } from "lucide-react";
import { apiFetch, apiSend } from "@/lib/api/client";

interface Role {
  id: string;
  name: string;
  level: number;
}

interface ManagerOption {
  id: string;
  name: string;
  role: { name: string } | null;
}

interface UserDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  role: { id: string; name: string } | null;
  extraRoleIds: string[];
  managerId: string | null;
  manager: { id: string; name: string } | null;
  reports: { id: string; name: string }[];
}

interface EditUserModalProps {
  open: boolean;
  userId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditUserModal({ open, userId, onClose, onSuccess }: EditUserModalProps) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState("");
  const [extraRoleIds, setExtraRoleIds] = useState<string[]>([]);
  const [managerId, setManagerId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<UserDetail>(`/api/users/${userId}`),
      apiFetch<Role[]>("/api/roles"),
      apiFetch<ManagerOption[]>("/api/users?limit=200"),
    ])
      .then(([u, r, m]) => {
        const d = u.data;
        if (d) {
          setDetail(d);
          setName(d.name);
          setPhone(d.phone ?? "");
          setRoleId(d.role?.id ?? "");
          setExtraRoleIds(d.extraRoleIds ?? []);
          setManagerId(d.managerId ?? "");
          setIsActive(d.isActive);
        }
        setRoles(r.data ?? []);
        setManagers(m.data ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được dữ liệu"))
      .finally(() => setLoading(false));
  }, [open, userId]);

  useEffect(() => {
    if (!open) {
      setDetail(null);
      setError(null);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setError(null);
    startTransition(async () => {
      try {
        await apiSend(`/api/users/${userId}`, "PATCH", {
          name,
          phone: phone || undefined,
          roleId: roleId || null,
          extraRoleIds,
          managerId: managerId || null,
          isActive,
        });
        onSuccess();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi kết nối máy chủ, vui lòng thử lại");
      }
    });
  };

  if (!open) return null;

  // Không cho chọn chính mình làm cấp trên (backend cũng chặn vòng lặp).
  const managerOptions = managers.filter((m) => m.id !== userId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-cyan-500/10 rounded-lg">
              <Pencil size={16} className="text-cyan-400" />
            </div>
            <h2 className="text-base font-semibold text-white">
              Sửa người dùng{detail ? ` — ${detail.name}` : ""}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-cyan-500" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs leading-relaxed">
                <span className="mt-0.5 flex-shrink-0">⚠</span>
                {error}
              </div>
            )}

            {detail && (
              <p className="text-xs text-slate-500">{detail.email}</p>
            )}

            {/* Tên */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Họ và tên <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500
                           focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 transition-all"
              />
            </div>

            {/* 2 cột: Điện thoại + Vai trò */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">Số điện thoại</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0901 234 567"
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500
                             focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">Vai trò</label>
                <select
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white
                             focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 transition-all"
                >
                  <option value="">— Mặc định —</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Vai trò bổ sung (vd thành viên HĐQT) — nhận việc định kỳ + đọc tài liệu của role đó */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Vai trò bổ sung</label>
              <div className="flex flex-wrap gap-1.5">
                {roles.filter((r) => r.id !== roleId).map((r) => {
                  const on = extraRoleIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setExtraRoleIds((prev) => on ? prev.filter((id) => id !== r.id) : [...prev, r.id])}
                      className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                        on ? "bg-cyan-600/20 border-cyan-600/50 text-cyan-300" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
                      }`}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500">VD: Giám đốc đồng thời là thành viên HĐQT — nhận việc định kỳ & đọc tài liệu của HĐQT (không cấp quyền).</p>
            </div>

            {/* Cấp trên trực tiếp */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Cấp trên trực tiếp</label>
              <select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white
                           focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 transition-all"
              >
                <option value="">— Không có (cấp cao nhất) —</option>
                {managerOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.role ? ` — ${m.role.name}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">Người này sẽ báo cáo / trình ký lên cấp trên đã chọn.</p>
            </div>

            {/* Cấp dưới hiện tại (read-only) */}
            {detail && detail.reports.length > 0 && (
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <Users size={12} className="text-slate-500" />
                  Cấp dưới trực tiếp ({detail.reports.length})
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {detail.reports.map((r) => (
                    <span key={r.id} className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-slate-800 border border-slate-700 text-slate-300">
                      {r.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Trạng thái */}
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/50"
              />
              <span className="text-xs font-medium text-slate-300">Đang hoạt động</span>
            </label>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800 mt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? (
                  <><Loader2 size={14} className="animate-spin" />Đang lưu...</>
                ) : (
                  <><Pencil size={14} />Lưu thay đổi</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
