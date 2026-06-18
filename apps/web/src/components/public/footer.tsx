// src/components/public/footer.tsx
import Link from "next/link";
import { BarChart3, Phone, Mail, MapPin } from "lucide-react";

const MODULES = ["Kế Toán Tổng Hợp", "Hóa Đơn Điện Tử", "Nhân Sự & Lương", "Bán Hàng & CRM", "AI Agent System"];

const COMPANY_LINKS = [
  { href: "/about", label: "Về chúng tôi" },
  { href: "/pricing", label: "Bảng giá" },
  { href: "/testimonials", label: "Khách hàng" },
  { href: "/contact", label: "Liên hệ" },
];

export function PublicFooter() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">

          {/* Brand */}
          <div>
            <Link href="/" className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 bg-cyan-600 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-serif font-black text-white">vSME</span>
            </Link>
            <p className="text-gray-400 text-sm leading-relaxed mb-5">
              Nền tảng quản lý doanh nghiệp SME toàn diện tích hợp AI — đồng hành cùng sự phát triển của bạn.
            </p>
            <div className="flex space-x-3">
              {["F", "in", "TW"].map(s => (
                <div key={s} className="w-8 h-8 bg-gray-800 hover:bg-cyan-600 rounded-lg flex items-center justify-center text-xs font-bold cursor-pointer transition-colors">
                  {s}
                </div>
              ))}
            </div>
          </div>

          {/* Modules */}
          <div>
            <h4 className="text-base font-serif font-bold text-white mb-5">Modules</h4>
            <ul className="space-y-2 text-sm">
              {MODULES.map(m => (
                <li key={m}>
                  <Link href="/services" className="text-gray-400 hover:text-cyan-400 transition-colors">
                    {m}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-base font-serif font-bold text-white mb-5">Công ty</h4>
            <ul className="space-y-2 text-sm">
              {COMPANY_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-gray-400 hover:text-cyan-400 transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
              <li><a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors">Blog & Tin tức</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-base font-serif font-bold text-white mb-5">Liên hệ</h4>
            <div className="space-y-3 text-sm text-gray-400">
              <div className="flex items-center space-x-2">
                <Phone className="w-4 h-4 text-cyan-500 flex-shrink-0" />
                <span>1800 6789 (miễn phí)</span>
              </div>
              <div className="flex items-center space-x-2">
                <Mail className="w-4 h-4 text-cyan-500 flex-shrink-0" />
                <span>hello@vsme.vn</span>
              </div>
              <div className="flex items-start space-x-2">
                <MapPin className="w-4 h-4 text-cyan-500 flex-shrink-0 mt-0.5" />
                <span>Hà Nội · TP.HCM · Đà Nẵng</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-10 pt-6 flex flex-col md:flex-row justify-between items-center text-gray-500 text-sm">
          <span>© 2026 vSME. Bảo lưu mọi quyền.</span>
          <div className="flex space-x-5 mt-3 md:mt-0">
            <a href="#" className="hover:text-gray-300 transition-colors">Điều khoản dịch vụ</a>
            <a href="#" className="hover:text-gray-300 transition-colors">Chính sách bảo mật</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
