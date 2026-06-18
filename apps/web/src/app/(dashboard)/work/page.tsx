// src/app/(dashboard)/work/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { WorkDashboard } from "./work-dashboard";

export const metadata: Metadata = { title: "Quản Lý Công Việc" };

export default async function WorkPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <WorkDashboard
      userId={session.user.id}
      userName={session.user.name ?? session.user.email}
      roleName={session.user.roleName}
      roleLevel={session.user.roleLevel}
      canManage={session.user.accountType !== "user"}
    />
  );
}
