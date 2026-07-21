// src/app/(dashboard)/admin/company/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { userCan } from "@/lib/auth/rbac";
import { CompanyClient } from "./company-client";

export const metadata: Metadata = { title: "Cài Đặt Công Ty" };

export default async function CompanyPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Xem thông tin cần admin:read; sửa cần admin:configure — trang này để sửa.
  if (!(await userCan(session, "admin", "configure"))) {
    redirect("/admin");
  }

  return <CompanyClient />;
}
