// src/app/(auth)/doi-mat-khau/page.tsx
// Bắt buộc đổi mật khẩu — middleware đẩy về đây khi mustChangePassword=true.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { auth } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Đổi Mật Khẩu" };

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const forced = Boolean(session.user.mustChangePassword);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-cyan-600/10 blur-3xl rounded-full" />
      <div className="pointer-events-none fixed bottom-0 right-0 w-80 h-80 bg-slate-700/30 blur-3xl rounded-full" />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center">
            <div className="w-16 h-16 bg-cyan-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-cyan-600/30 mb-3">
              <KeyRound className="w-8 h-8 text-white" />
            </div>
            <span className="text-2xl font-serif font-black text-white">vSME</span>
            <span className="text-slate-400 text-xs mt-0.5">{session.user.email}</span>
          </div>
        </div>

        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          <h1 className="text-white font-serif font-bold text-xl mb-2">Đổi mật khẩu</h1>

          {forced && (
            <p className="text-amber-400/90 text-xs leading-relaxed mb-6 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
              Đây là lần đăng nhập đầu tiên. Bạn cần đặt mật khẩu mới trước khi
              sử dụng hệ thống.
            </p>
          )}

          <ChangePasswordForm
            email={session.user.email}
            companySlug={session.user.companySlug}
          />
        </div>

        <p className="mt-4 text-center text-slate-700 text-xs">© 2026 vSME. Bảo lưu mọi quyền.</p>
      </div>
    </div>
  );
}
