// src/app/(dashboard)/admin/recurring/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { userCan } from "@/lib/auth/rbac";
import { RecurringClient } from "./recurring-client";

export const metadata: Metadata = { title: "Công Việc Định Kỳ" };

export default async function RecurringPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!(await userCan(session, "admin", "configure"))) {
    redirect("/admin");
  }
  return <RecurringClient />;
}
