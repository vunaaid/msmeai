"use client";

// src/components/sw-register.tsx
// Đăng ký Service Worker khi app load (chạy ở client)

import { useEffect } from "react";

export function SWRegister() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(reg => {
          console.log("[SW] Registered:", reg.scope);
        })
        .catch(err => {
          console.error("[SW] Registration failed:", err);
        });
    }
  }, []);

  return null;
}
