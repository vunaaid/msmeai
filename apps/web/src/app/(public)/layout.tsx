// src/app/(public)/layout.tsx
import { PublicNav } from "@/components/public/nav";
import { PublicFooter } from "@/components/public/footer";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <PublicNav />
      <main>{children}</main>
      <PublicFooter />
    </div>
  );
}
