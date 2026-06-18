// src/lib/auth/auth.config.ts
// NextAuth.js v5 configuration

import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

const EXPRESS_API = process.env["EXPRESS_API_URL"] ?? "http://localhost:4000";

const loginSchema = z.object({
  email:       z.string().email(),
  password:    z.string().min(1),
  companySlug: z.string().optional(),
});

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email:       { label: "Email",        type: "email" },
        password:    { label: "Mật khẩu",     type: "password" },
        companySlug: { label: "Company Slug", type: "text" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password, companySlug } = parsed.data;

        try {
          // Gọi Express API để xác thực credentials
          const res = await fetch(`${EXPRESS_API}/api/auth/login`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ email, password, companySlug: companySlug || null }),
          });

          if (!res.ok) return null;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const json = await res.json() as { success: boolean; data: any };
          if (!json.success || !json.data) return null;

          // NextAuth chấp nhận bất kỳ object nào có id — cast về any để thoát type check
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return json.data as any;
        } catch {
          // Express API không phản hồi
          return null;
        }
      },
    }),
  ],

  callbacks: {
    // Sau next start sau nginx, Next.js chuẩn hoá host về localhost:3000 nên NextAuth
    // tự detect baseUrl sai → redirect mặc định đẩy callbackUrl đúng domain về localhost.
    // Whitelist theo root domain (mọi *.example.com) để logout/redirect giữ đúng subdomain.
    async redirect({ url, baseUrl }) {
      const rootDomain = process.env["NEXT_PUBLIC_ROOT_DOMAIN"] ?? "localhost";
      // URL tương đối → gắn vào baseUrl
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        const target = new URL(url);
        // Cùng origin với baseUrl → cho phép
        if (target.origin === new URL(baseUrl).origin) return url;
        // Cùng root domain (vd acme.example.com, sme.example.com) → cho phép
        const host = target.hostname;
        if (host === rootDomain || host.endsWith(`.${rootDomain}`)) return url;
      } catch {
        /* URL không hợp lệ → fallback baseUrl */
      }
      return baseUrl;
    },

    async jwt({ token, user }) {
      if (user) {
        // Khi đăng nhập lần đầu, copy data vào token
        token["id"] = user.id;
        token["accountType"] = (user as { accountType: string }).accountType;
        token["companyId"] = (user as { companyId: string }).companyId;
        token["companyName"] = (user as { companyName: string }).companyName;
        token["companySlug"] = (user as { companySlug: string | null }).companySlug;
        token["roleId"] = (user as { roleId: string | null }).roleId;
        token["roleName"] = (user as { roleName: string | null }).roleName;
        token["roleLevel"] = (user as { roleLevel: string | null }).roleLevel;
        token["isSuperAdmin"] = (user as { isSuperAdmin: boolean }).isSuperAdmin;
        token["avatarUrl"] = (user as { avatarUrl: string | null }).avatarUrl;
        // permissions KHÔNG lưu vào JWT — load từ DB theo roleId khi cần
        // (tránh cookie phình to gây 502 ở nginx). Xem lib/auth/permissions.ts
        token["aiMode"] = (user as { aiMode?: string }).aiMode ?? "assistant";
      }
      return token;
    },

    async session({ session, token }) {
      // Gán token data vào session
      session.user.id = token["id"] as string;
      session.user.accountType = token["accountType"] as "system_admin" | "company_admin" | "user";
      session.user.companyId = token["companyId"] as string;
      session.user.companyName = token["companyName"] as string;
      session.user.companySlug = token["companySlug"] as string | null;
      session.user.roleId = token["roleId"] as string | null;
      session.user.roleName = token["roleName"] as string | null;
      session.user.roleLevel = token["roleLevel"] as string | null;
      session.user.isSuperAdmin = token["isSuperAdmin"] as boolean;
      session.user.avatarUrl = token["avatarUrl"] as string | null;
      session.user.aiMode = token["aiMode"] as "full" | "assistant";
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 giờ
  },

  // Không bật debug trong production
  debug: process.env["NODE_ENV"] === "development",
};
