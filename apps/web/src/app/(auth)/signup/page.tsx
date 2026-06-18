// src/app/(auth)/signup/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Shield, TrendingUp } from "lucide-react";
import { SignupWizard } from "./signup-wizard";

export const metadata: Metadata = { title: "Đăng Ký Dùng Thử" };

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-12">
      <Link
        href="/"
        className="absolute top-6 left-6 flex items-center space-x-2 text-slate-400 hover:text-slate-200 transition-colors text-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <span>Trang chủ</span>
      </Link>

      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-cyan-600/10 blur-3xl rounded-full" />
      <div className="pointer-events-none fixed bottom-0 right-0 w-80 h-80 bg-slate-700/30 blur-3xl rounded-full" />

      <div className="relative w-full max-w-lg">
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex flex-col items-center">
            <div className="w-14 h-14 bg-cyan-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-cyan-600/30 mb-2">
              <BarChart3 className="w-7 h-7 text-white" />
            </div>
            <span className="text-xl font-serif font-black text-white">vSME</span>
          </Link>
          <p className="text-slate-400 text-xs mt-1">Đăng ký dùng thử miễn phí — tạo công ty trong vài phút</p>
        </div>

        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-7 shadow-2xl">
          <SignupWizard />

          <div className="mt-6 pt-5 border-t border-slate-700/50 text-center">
            <p className="text-slate-400 text-sm">
              Đã có tài khoản?{" "}
              <Link href="/login" className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
                Đăng nhập
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-5 text-xs text-slate-600">
          <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-slate-500" /> SSL Encrypted</span>
          <span className="text-slate-700">·</span>
          <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-slate-500" /> 99.9% Uptime</span>
        </div>
      </div>
    </div>
  );
}
