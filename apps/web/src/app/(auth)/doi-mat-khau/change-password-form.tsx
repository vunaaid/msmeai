"use client";

// src/app/(auth)/doi-mat-khau/change-password-form.tsx
import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

interface Props {
  email: string;
  companySlug?: string | null;
}

const DEFAULT_ERROR = "Đổi mật khẩu thất bại, vui lòng thử lại";

export function ChangePasswordForm({ email, companySlug }: Props) {
  const [password,    setPassword]    = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm,     setConfirm]     = useState("");
  const [showPw,      setShowPw]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [isPending,   startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirm) {
      setError("Xác nhận mật khẩu không khớp");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/account/change-password", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            email,
            password,
            newPassword,
            companySlug: companySlug ?? null,
          }),
        });

        const json = await res.json() as {
          success: boolean;
          error?: { message?: string };
        };

        if (!res.ok || !json.success) {
          setError(json.error?.message ?? DEFAULT_ERROR);
          return;
        }

        // Mật khẩu đã đổi → session cũ còn cờ mustChangePassword nên phải
        // đăng nhập lại để nhận session sạch.
        await signOut({ callbackUrl: "/login?changed=1" });
      } catch {
        setError(DEFAULT_ERROR);
      }
    });
  };

  const inputClass =
    "w-full px-3.5 py-2.5 pr-10 rounded-lg text-sm bg-slate-700/60 border border-slate-600/60 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 transition-all";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs leading-relaxed">
          <span className="mt-0.5 flex-shrink-0">⚠</span>
          {error}
        </div>
      )}

      {/* Mật khẩu hiện tại */}
      <div className="space-y-1.5">
        <label htmlFor="current" className="block text-xs font-medium text-slate-300">
          Mật khẩu hiện tại
        </label>
        <div className="relative">
          <input
            id="current"
            type={showPw ? "text" : "password"}
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className={inputClass}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPw(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>

      {/* Mật khẩu mới */}
      <div className="space-y-1.5">
        <label htmlFor="new" className="block text-xs font-medium text-slate-300">
          Mật khẩu mới
        </label>
        <input
          id="new"
          type="password"
          required
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          className={inputClass}
        />
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và chữ số.
        </p>
      </div>

      {/* Xác nhận */}
      <div className="space-y-1.5">
        <label htmlFor="confirm" className="block text-xs font-medium text-slate-300">
          Xác nhận mật khẩu mới
        </label>
        <input
          id="confirm"
          type="password"
          required
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 rounded-lg text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-800 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
      >
        {isPending ? (
          <>
            <Loader2 size={15} className="animate-spin" />
            Đang cập nhật...
          </>
        ) : "Đổi mật khẩu"}
      </button>
    </form>
  );
}
