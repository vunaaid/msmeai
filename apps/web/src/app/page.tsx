// src/app/page.tsx — Public landing được phục vụ tĩnh (landing/*.html) qua nginx.
// Trong app Next, "/" chỉ điều hướng: đã đăng nhập → /admin, chưa thì → /login.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function RootPage() {
  const session = await auth();
  redirect(session ? "/admin" : "/login");
}
