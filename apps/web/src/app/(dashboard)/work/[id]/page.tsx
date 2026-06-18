// src/app/(dashboard)/work/[id]/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { WorkDetailClient } from "./work-detail-client";

export default async function WorkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const { id } = await params;
  return <WorkDetailClient id={id} userId={session.user.id} />;
}
