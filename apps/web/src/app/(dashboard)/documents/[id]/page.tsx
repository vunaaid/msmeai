// src/app/(dashboard)/documents/[id]/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DocumentDetailClient } from "./document-client";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const { id } = await params;
  return <DocumentDetailClient id={id} userName={session.user.name ?? session.user.email} />;
}
