// src/types/next-auth.d.ts
// Extend NextAuth types với custom fields

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      accountType: "system_admin" | "company_admin" | "user";
      companyId: string;
      companyName: string;
      companySlug: string | null;
      roleId: string | null;
      roleName: string | null;
      roleLevel: string | null;
      isSuperAdmin: boolean;
      avatarUrl: string | null;
      aiMode?: "full" | "assistant";
    } & DefaultSession["user"];
  }

  interface User {
    accountType: "system_admin" | "company_admin" | "user";
    companyId: string;
    companyName: string;
    companySlug: string | null;
    roleId: string | null;
    roleName: string | null;
    roleLevel: string | null;
    isSuperAdmin: boolean;
    avatarUrl: string | null;
  }
}
