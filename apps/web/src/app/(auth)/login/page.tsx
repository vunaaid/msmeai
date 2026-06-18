// src/app/(auth)/login/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Suspense } from "react";
import { BarChart3, Building2, Shield, TrendingUp } from "lucide-react";
import { prisma } from "@vsme/db/client";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng Nhập" };

export default async function LoginPage() {
  const headersList = await headers();
  const companySlug = headersList.get("x-company-slug") ?? null;

  // Subdomain: load company info để branded UI
  let company: { name: string; logoUrl: string | null } | null = null;
  if (companySlug) {
    company = await prisma.company.findUnique({
      where: { slug: companySlug },
      select: { name: true, logoUrl: true },
    });
  }

  const isTenant = !!companySlug;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-12">
      {/* Back to landing — chỉ trên main domain */}
      {!isTenant && (
        <Link
          href="/"
          className="absolute top-6 left-6 flex items-center space-x-2 text-slate-400 hover:text-slate-200 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Trang chủ</span>
        </Link>
      )}

      {/* Decorative glows */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-cyan-600/10 blur-3xl rounded-full" />
      <div className="pointer-events-none fixed bottom-0 right-0 w-80 h-80 bg-slate-700/30 blur-3xl rounded-full" />

      <div className="relative w-full max-w-sm">
        {/* Logo / Company branding */}
        <div className="text-center mb-8">
          {isTenant ? (
            <div className="inline-flex flex-col items-center">
              {company?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={company.logoUrl}
                  alt={company.name}
                  className="h-16 w-16 rounded-2xl object-cover shadow-2xl mb-3"
                />
              ) : (
                <div className="w-16 h-16 bg-cyan-700 rounded-2xl flex items-center justify-center shadow-2xl shadow-cyan-600/20 mb-3">
                  <Building2 className="w-8 h-8 text-white" />
                </div>
              )}
              <span className="text-2xl font-bold text-white">
                {company?.name ?? companySlug}
              </span>
              <span className="text-slate-400 text-xs mt-0.5">Đăng nhập vào hệ thống</span>
            </div>
          ) : (
            <Link href="/" className="inline-flex flex-col items-center">
              <div className="w-16 h-16 bg-cyan-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-cyan-600/30 mb-3">
                <BarChart3 className="w-8 h-8 text-white" />
              </div>
              <span className="text-2xl font-serif font-black text-white">vSME</span>
              <span className="text-slate-400 text-xs mt-0.5">Hệ thống quản lý doanh nghiệp</span>
            </Link>
          )}
        </div>

        {/* Card */}
        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          <h1 className="text-white font-serif font-bold text-xl mb-6">
            {isTenant ? `Đăng nhập — ${company?.name ?? companySlug}` : "Đăng nhập quản trị"}
          </h1>

          <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-slate-700/40" />}>
            <LoginForm companySlug={companySlug} isTenant={isTenant} />
          </Suspense>

          <div className="mt-6 pt-5 border-t border-slate-700/50 text-center">
            {isTenant ? (
              <p className="text-slate-500 text-xs">
                Bạn là quản trị viên?{" "}
                <a
                  href={process.env.NEXT_PUBLIC_APP_URL ?? "/"}
                  className="text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Đăng nhập tại trang chủ
                </a>
              </p>
            ) : (
              <p className="text-slate-400 text-sm">
                Chưa có tài khoản?{" "}
                <Link href="/signup" className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
                  Đăng ký dùng thử
                </Link>
              </p>
            )}
          </div>
        </div>

        {/* Trust badges — chỉ main domain */}
        {!isTenant && (
          <>
            <div className="mt-6 flex items-center justify-center gap-5 text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-slate-500" />
                SSL Encrypted
              </span>
              <span className="text-slate-700">·</span>
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
                99.9% Uptime
              </span>
              <span className="text-slate-700">·</span>
              <span>ISO 27001</span>
            </div>
            <p className="mt-4 text-center text-slate-700 text-xs">© 2026 vSME. Bảo lưu mọi quyền.</p>
          </>
        )}
      </div>
    </div>
  );
}
