"use client";
// src/components/public/nav.tsx

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { href: "/about", label: "Về chúng tôi" },
  { href: "/services", label: "Tính năng" },
  { href: "/testimonials", label: "Khách hàng" },
  { href: "/pricing", label: "Bảng giá" },
  { href: "/contact", label: "Liên hệ" },
];

export function PublicNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-cyan-600 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-serif font-black text-gray-900">vSME</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center space-x-8">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`text-sm font-medium transition-colors hover:text-cyan-600 ${
                  pathname === href ? "text-cyan-600" : "text-gray-600"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="hidden md:flex items-center space-x-3">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-cyan-600 transition-colors"
            >
              Đăng nhập
            </Link>
            <Link
              href="/signup"
              className="bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Dùng thử miễn phí
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            onClick={() => setOpen(v => !v)}
            aria-label="Toggle menu"
          >
            {open
              ? <X className="w-5 h-5 text-gray-600" />
              : <Menu className="w-5 h-5 text-gray-600" />}
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="md:hidden pb-4 border-t border-gray-100 mt-2 pt-4">
            <div className="flex flex-col space-y-3">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`text-sm font-medium hover:text-cyan-600 transition-colors ${
                    pathname === href ? "text-cyan-600" : "text-gray-600"
                  }`}
                  onClick={() => setOpen(false)}
                >
                  {label}
                </Link>
              ))}
              <div className="flex items-center space-x-3 pt-2 border-t border-gray-100">
                <Link href="/login" className="text-sm font-medium text-gray-600" onClick={() => setOpen(false)}>
                  Đăng nhập
                </Link>
                <Link
                  href="/signup"
                  className="bg-cyan-600 text-white text-sm font-medium px-4 py-2 rounded-lg"
                  onClick={() => setOpen(false)}
                >
                  Dùng thử miễn phí
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
