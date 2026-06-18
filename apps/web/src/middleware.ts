// src/middleware.ts
// Next.js middleware — xác thực (SINGLE-TENANT: đã bỏ subdomain/multi-tenant routing).
// Mọi công ty dùng chung 1 host; phạm vi dữ liệu lấy theo session.user.companyId.

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Trang public (không cần đăng nhập)
const PUBLIC_PAGES = new Set([
  '/', '/about', '/services', '/pricing',
  '/testimonials', '/contact', '/login', '/redirect', '/signup',
]);

export default auth(req => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isPublicPage = PUBLIC_PAGES.has(pathname);
  const isApiRoute = pathname.startsWith('/api/');

  if (isPublicPage) {
    // Đã login mà vào /login → đưa vào dashboard theo loại tài khoản
    if (session && pathname === '/login') {
      const dest = session.user.accountType === 'system_admin' ? '/sysadmin' : '/admin';
      return NextResponse.redirect(new URL(dest, req.url));
    }
    return NextResponse.next();
  }

  // Chưa login → API trả 401 JSON, page thì redirect /login
  if (!session) {
    if (isApiRoute) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' } },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // /sysadmin/* và /api/sysadmin/* — chỉ system_admin
  if (pathname.startsWith('/sysadmin') || pathname.startsWith('/api/sysadmin')) {
    if (session.user.accountType !== 'system_admin') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/admin', req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Bỏ qua: static assets, PWA files, api/auth/* (NextAuth tự xử lý), api/signup/* (đăng ký — public)
    "/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|manifest\\.json|sw\\.js|robots\\.txt|sitemap\\.xml|.*\\.png|.*\\.jpg|.*\\.webp|.*\\.svg|.*\\.ico|.*\\.woff2?|api/auth|api/signup).*)",
  ],
};
