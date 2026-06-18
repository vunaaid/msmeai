"use client";

// src/components/layout/sign-out-button.tsx

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut, Loader2 } from "lucide-react";

export function SignOutButton() {
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    await signOut({ callbackUrl: `${window.location.origin}/login` });
  };

  return (
    <button
      onClick={() => void handleSignOut()}
      disabled={loading}
      className="text-slate-500 hover:text-white transition-colors disabled:opacity-50"
      title="Đăng xuất"
    >
      {loading
        ? <Loader2 size={16} className="animate-spin" />
        : <LogOut size={16} />
      }
    </button>
  );
}
