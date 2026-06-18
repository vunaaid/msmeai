"use client";

// src/components/providers.tsx
// Client-side providers wrapper — bọc toàn bộ app

import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
    </SessionProvider>
  );
}
