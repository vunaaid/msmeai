// src/app/(auth)/redirect/page.tsx
// Server-side redirect sau khi login (SINGLE-TENANT: cùng 1 host, không tenant URL).
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AuthRedirectPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Super Admin → khu quản trị nền tảng.
  if (session.user.accountType === "system_admin") {
    redirect("/sysadmin");
  }

  // Mọi user còn lại → Dashboard trên cùng host hiện tại.
  redirect("/dashboard");
}
