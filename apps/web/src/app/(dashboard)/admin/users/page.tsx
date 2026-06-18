// src/app/(dashboard)/admin/users/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { userCan } from "@/lib/auth/rbac";
import { UsersClient } from "./users-client";

export const metadata: Metadata = { title: "Quản Lý Người Dùng" };

export default async function UsersPage() {
  const session = await auth();
  if (!session) redirect("/login");

  if (!(await userCan(session, "admin", "read"))) {
    redirect("/admin");
  }

  return <UsersClient />;
}
