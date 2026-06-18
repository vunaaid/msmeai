// src/app/(dashboard)/work/project/[id]/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ProjectDetailClient } from "./project-detail-client";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const { id } = await params;
  return <ProjectDetailClient id={id} userId={session.user.id} />;
}
