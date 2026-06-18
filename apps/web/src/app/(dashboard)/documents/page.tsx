// src/app/(dashboard)/documents/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DocumentsClient } from "./documents-client";

export const metadata: Metadata = { title: "Tài Liệu" };

export default async function DocumentsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const isAdmin =
    session.user.accountType === "company_admin" || session.user.isSuperAdmin;

  return <DocumentsClient canManage={isAdmin} />;
}
