"use client";

// src/app/(auth)/login/login-form.tsx
import { useState, useTransition, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";

interface Props {
  companySlug?: string | null;
  isTenant?: boolean;
}

// Map NextAuth error codes → thông báo tiếng Việt
const AUTH_ERRORS: Record<string, string> = {
  CredentialsSignin:    "Email hoặc mật khẩu không đúng",
  AccessDenied:         "Tài khoản không có quyền truy cập",
  Verification:         "Liên kết xác thực đã hết hạn",
  Configuration:        "Lỗi cấu hình hệ thống",
  Default:              "Đăng nhập thất bại, vui lòng thử lại",
};

const DEFAULT_ERROR = "Đăng nhập thất bại, vui lòng thử lại";
const getAuthError = (code: string): string =>
  AUTH_ERRORS[code] ?? AUTH_ERRORS["Default"] ?? DEFAULT_ERROR;

export function LoginForm({ companySlug, isTenant }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl  = searchParams.get("callbackUrl");

  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [isPending,    startTransition] = useTransition();

  // Xử lý ?error= trong URL (khi NextAuth redirect về /login?error=CredentialsSignin)
  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) {
      setError(getAuthError(urlError));
      // Xóa query param khỏi URL mà không reload trang
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("error");
      cleanUrl.searchParams.delete("callbackUrl");
      window.history.replaceState({}, "", cleanUrl.toString());
    }
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const result = await signIn("credentials", {
          email,
          password,
          companySlug: companySlug ?? "",
          redirect: false,
        });

        if (!result) {
          setError(DEFAULT_ERROR);
          return;
        }

        if (result.error) {
          setError(getAuthError(result.error));
          return;
        }

        // Thành công → redirect
        const dest = callbackUrl && callbackUrl !== "/login" ? callbackUrl : "/redirect";
        router.push(dest);
        router.refresh();

      } catch (err: unknown) {
        // NextAuth v5 beta đôi khi throw thay vì return error
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("CredentialsSignin") || msg.includes("credentials")) {
          setError(getAuthError("CredentialsSignin"));
        } else {
          setError(DEFAULT_ERROR);
        }
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs leading-relaxed">
          <span className="mt-0.5 flex-shrink-0">⚠</span>
          {error}
        </div>
      )}

      {/* Email */}
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-xs font-medium text-slate-300">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder={isTenant ? "email@congty.com" : "admin@vsme.local"}
          autoComplete="email"
          className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-700/60 border border-slate-600/60 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 transition-all"
        />
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-xs font-medium text-slate-300">
          Mật khẩu
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="w-full px-3.5 py-2.5 pr-10 rounded-lg text-sm bg-slate-700/60 border border-slate-600/60 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 transition-all"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>

      {/* Forgot password */}
      <div className="flex justify-end -mt-1">
        <a href="#" className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors">
          Quên mật khẩu?
        </a>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 rounded-lg text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-800 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
      >
        {isPending ? (
          <>
            <Loader2 size={15} className="animate-spin" />
            Đang xác thực...
          </>
        ) : "Đăng nhập"}
      </button>
    </form>
  );
}
