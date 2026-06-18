// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { SWRegister } from "@/components/sw-register";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: {
    template: "%s | vSME",
    default: "vSME — Nền tảng Quản lý Doanh nghiệp SME tích hợp AI",
  },
  description: "vSME là nền tảng quản lý doanh nghiệp SME toàn diện tích hợp AI — Kế toán · Nhân sự · Bán hàng · Hóa đơn điện tử · AI Agent System.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "vSME",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <SWRegister />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
