// src/app/(dashboard)/notes/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NotesClient } from "./notes-client";

export const metadata: Metadata = { title: "Ghi Chép" };

export default async function NotesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <NotesClient
      userName={session.user.name ?? session.user.email}
      canAssign={session.user.accountType !== "user"}
    />
  );
}
