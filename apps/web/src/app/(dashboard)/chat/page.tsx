// src/app/(dashboard)/chat/page.tsx
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ChatClient } from "./chat-client";

export default async function ChatPage() {
  const session = await auth();
  if (!session) redirect("/login");
  return (
    <Suspense fallback={null}>
      <ChatClient userId={session.user.id} userName={session.user.name ?? session.user.email} />
    </Suspense>
  );
}
