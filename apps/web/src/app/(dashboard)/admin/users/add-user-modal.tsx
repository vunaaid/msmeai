"use client";

// src/app/(dashboard)/admin/users/add-user-modal.tsx

import { useState, useEffect, useTransition } from "react";
import { X, Loader2, Eye, EyeOff, UserPlus } from "lucide-react";
import { apiFetch, apiSend } from "@/lib/api/client";

interface Role {
  id: string;
  name: string;
  level: number;
  isDefault: boolean;
}

interface ManagerOption {
  id: string;
  name: string;
  role: { name: string } | null;
}

interface AddUserModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddUserModal({ open, onClose, onSuccess }: AddUserModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState("");
  const [extraRoleIds, setExtraRoleIds] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [managerId, setManagerId] = useState("");
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Fetch roles + danh sách cấp trên tiềm năng khi mở modal
  useEffect(() => {
    if (!open) return;
    apiFetch<Role[]>("/api/roles")
      .then(({ data }) => {
        const list = data ?? [];
        setRoles(list);
        const def = list.find((r) => r.isDefault);
        if (def) setRoleId(def.id);
      })
      .catch(() => {/* ignore — dropdown trống nếu lỗi */});
    apiFetch<ManagerOption[]>("/api/users?limit=200")
      .then(({ data }) => setManagers(data ?? []))
      .catch(() => {/* ignore */});
  }, [open]);

  // Reset form khi đóng
  useEffect(() => {
    if (!open) {
      setName("");
      setEmail("");
      setPassword("");
      setPhone("");
      setRoleId("");
      setExtraRoleIds([]);
      setManagerId("");
      setError(null);
      setShowPassword(false);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await apiSend("/api/users", "POST", {
          name,
          email,
          password,
          phone: phone || undefined,
          roleId: roleId || undefined,
          extraRoleIds: extraRoleIds.length ? extraRoleIds : undefined,
          managerId: managerId || null,
        });
        onSuccess();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi kết nối máy chủ, vui lòng thử lại");
      }
    });
  };

  if (!open) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-cyan-500/10 rounded-lg">
              <UserPlus size={16} className="text-cyan-400" />
            </div>
            <h2 className="text-base font-semibold text-white">Thêm người dùng mới</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs leading-relaxed">
              <span className="mt-0.5 flex-shrink-0">⚠</span>
              {error}
            </div>
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
              placeholder="Nguyễn Văn A"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500
                         focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 transition-all"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@congty.com"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500
                         focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 transition-all"
            />
          </div>

          {/* Mật khẩu */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Mật khẩu <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 8 ký tự"
                className="w-full px-3.5 py-2.5 pr-10 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500
                           focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 transition-all"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* 2 cột: Số điện thoại + Vai trò */}
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
            <p className="text-[11px] text-slate-500">VD: Giám đốc đồng thời là thành viên HĐQT — chọn thêm để nhận việc định kỳ & đọc tài liệu của HĐQT (không cấp quyền).</p>
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
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.role ? ` — ${m.role.name}` : ""}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">Người này sẽ báo cáo / trình ký lên cấp trên đã chọn.</p>
          </div>

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
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Đang tạo...
                </>
              ) : (
                <>
                  <UserPlus size={14} />
                  Tạo người dùng
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
