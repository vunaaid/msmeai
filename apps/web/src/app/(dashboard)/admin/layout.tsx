// src/app/(dashboard)/admin/layout.tsx
// Guard toàn bộ khu /admin — chỉ vai trò quản trị (company_admin / system_admin)
// mới được vào. User thường gõ thẳng URL cũng bị đẩy về Dashboard.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isCompanyAdmin } from "@/lib/auth/rbac";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!isCompanyAdmin(session)) redirect("/dashboard");

  return <>{children}</>;
}
