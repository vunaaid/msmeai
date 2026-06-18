// src/app/(dashboard)/admin/modules/page.tsx
import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ModulesClient } from "./modules-client";

export const metadata: Metadata = { title: "Cấu Hình Modules" };

export default function ModulesPage() {
  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        icon="Settings"
        iconColor="text-blue-400"
        backHref="/admin"
        title="Cấu Hình Modules"
        subtitle="Bật/tắt các phân hệ nghiệp vụ cho công ty bạn"
      />
      <ModulesClient />
    </div>
  );
}
