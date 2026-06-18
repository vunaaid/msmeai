// src/lib/auth/index.ts
// NextAuth.js v5 instance — single-tenant (đã bỏ subdomain/multi-tenant routing).

import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // trustHost: lấy host + protocol từ reverse proxy (X-Forwarded-Host / -Proto).
  // KHÔNG override cookies → Auth.js tự chọn Secure/__Host- theo protocol thật:
  //   https → secure cookie (__Host-/__Secure-);  http → cookie thường.
  // ⇒ Proxy BẮT BUỘC forward `X-Forwarded-Proto` đúng để cookie + redirect chuẩn.
  trustHost: true,
});

// Helper: lấy session trong Server Components / API Routes
export { auth as getServerSession };
