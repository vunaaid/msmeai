// src/app/(public)/pricing/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle, ArrowRight } from "lucide-react";

export const metadata: Metadata = { title: "Bảng giá" };

const PLANS = [
  {
    name: "Starter",
    sub: "Dành cho doanh nghiệp nhỏ, mới thành lập",
    price: "2.5tr",
    features: [
      { label: "Tối đa 10 người dùng", ok: true },
      { label: "Kế Toán Tổng Hợp", ok: true },
      { label: "Hóa Đơn Điện Tử (500 hóa đơn/tháng)", ok: true },
      { label: "Dashboard cơ bản", ok: true },
      { label: "Hỗ trợ email (giờ hành chính)", ok: true },
      { label: "5GB lưu trữ", ok: true },
      { label: "Module Nhân Sự & Lương", ok: false },
      { label: "AI Agent System", ok: false },
      { label: "Bán Hàng & CRM", ok: false },
      { label: "Hỗ trợ điện thoại", ok: false },
    ],
    popular: false,
    href: "/login",
    cta: "Bắt đầu miễn phí",
  },
  {
    name: "Professional",
    sub: "Dành cho SME đang phát triển, 10–50 nhân viên",
    price: "6tr",
    features: [
      { label: "Tối đa 50 người dùng", ok: true },
      { label: "Kế Toán Tổng Hợp", ok: true },
      { label: "Hóa Đơn Điện Tử (không giới hạn)", ok: true },
      { label: "Dashboard & Báo cáo nâng cao", ok: true },
      { label: "Hỗ trợ điện thoại ưu tiên", ok: true },
      { label: "50GB lưu trữ", ok: true },
      { label: "Module Nhân Sự & Lương", ok: true },
      { label: "AI Agent cơ bản", ok: true },
      { label: "Bán Hàng & CRM", ok: true },
      { label: "SLA 99.9% uptime", ok: true },
    ],
    popular: true,
    href: "/login",
    cta: "Bắt đầu miễn phí",
  },
  {
    name: "Enterprise",
    sub: "Dành cho doanh nghiệp vừa, tập đoàn",
    price: "Liên hệ",
    features: [
      { label: "Người dùng không giới hạn", ok: true },
      { label: "Toàn bộ 13 module nghiệp vụ", ok: true },
      { label: "Hóa Đơn Điện Tử (không giới hạn)", ok: true },
      { label: "Dashboard tùy chỉnh theo yêu cầu", ok: true },
      { label: "Dedicated support 24/7", ok: true },
      { label: "Lưu trữ không giới hạn", ok: true },
      { label: "AI Agent toàn phần (C-Suite mode)", ok: true },
      { label: "On-premise hoặc Private Cloud", ok: true },
      { label: "Tích hợp API tùy chỉnh", ok: true },
      { label: "SLA tùy chỉnh + bồi thường", ok: true },
    ],
    popular: false,
    href: "/contact",
    cta: "Liên hệ tư vấn",
  },
];

const ADDONS = [
  { label: "Hóa đơn vượt hạn mức", price: "500đ/hóa đơn" },
  { label: "Lưu trữ thêm", price: "50k/10GB/tháng" },
  { label: "Người dùng thêm (Starter)", price: "300k/user/tháng" },
  { label: "Migration data từ hệ thống cũ", price: "Miễn phí (Pro+)" },
  { label: "Training & onboarding", price: "Miễn phí tất cả gói" },
  { label: "Tích hợp API tùy chỉnh", price: "Theo yêu cầu" },
];

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-50 to-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Bảng giá</div>
          <h1 className="text-5xl font-serif font-black text-gray-900 mb-6 leading-tight">
            Giá cả <span className="text-cyan-600">minh bạch</span>, không phí ẩn
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Bắt đầu miễn phí 30 ngày. Nâng cấp hoặc hạ cấp bất cứ lúc nào. Không cần thẻ tín dụng.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {PLANS.map(({ name, sub, price, features, popular, href, cta }) => (
              <div
                key={name}
                className={`rounded-2xl p-8 relative ${
                  popular
                    ? "border-2 border-cyan-600 shadow-xl"
                    : "border-2 border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all"
                }`}
              >
                {popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-amber-500 text-white text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap">
                      ★ Phổ biến nhất
                    </span>
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-2xl font-serif font-bold text-gray-900 mb-1">{name}</h3>
                  <p className="text-gray-500 text-sm mb-4">{sub}</p>
                  <div>
                    <span className="text-4xl font-serif font-black text-cyan-600">{price}</span>
                    {price !== "Liên hệ" && <span className="text-gray-500 text-sm ml-1">/tháng</span>}
                  </div>
                </div>
                <ul className="space-y-3 mb-8">
                  {features.map(({ label, ok }) => (
                    <li key={label} className={`flex items-start text-sm ${ok ? "text-gray-700" : "text-gray-400"}`}>
                      {ok
                        ? <CheckCircle2 className="w-5 h-5 text-cyan-600 mr-2 flex-shrink-0 mt-0.5" />
                        : <XCircle className="w-5 h-5 text-gray-300 mr-2 flex-shrink-0 mt-0.5" />
                      }
                      {label}
                    </li>
                  ))}
                </ul>
                <Link
                  href={href}
                  className={`block w-full text-center font-medium py-3.5 rounded-xl transition-colors ${
                    popular
                      ? "bg-cyan-600 hover:bg-cyan-700 text-white"
                      : "bg-cyan-600 hover:bg-cyan-700 text-white"
                  }`}
                >
                  {cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Add-ons */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Add-ons</div>
            <h2 className="text-4xl font-serif font-black text-gray-900 mb-4">Chi phí phát sinh</h2>
            <p className="text-gray-600">Các khoản phí chỉ phát sinh khi bạn sử dụng vượt hạn mức gói.</p>
          </div>
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            {ADDONS.map(({ label, price }, i) => (
              <div
                key={label}
                className={`flex items-center justify-between px-6 py-4 ${
                  i < ADDONS.length - 1 ? "border-b border-gray-100" : ""
                }`}
              >
                <span className="text-gray-700 font-medium">{label}</span>
                <span className="text-cyan-600 font-semibold">{price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ mini */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif font-black text-gray-900 mb-4">Câu hỏi về bảng giá</h2>
          </div>
          <div className="space-y-6">
            {[
              ["Có thể dùng thử miễn phí không?", "Có! Tất cả gói đều có 30 ngày dùng thử miễn phí, không cần thẻ tín dụng. Sau 30 ngày, bạn chọn gói phù hợp hoặc hủy bất kỳ lúc nào."],
              ["Có thể nâng/hạ gói không?", "Hoàn toàn có thể. Nâng cấp có hiệu lực ngay lập tức. Hạ cấp có hiệu lực vào đầu kỳ thanh toán tiếp theo."],
              ["Thanh toán như thế nào?", "Chấp nhận chuyển khoản ngân hàng, thẻ tín dụng quốc tế và ví điện tử (MoMo, VNPay). Xuất hóa đơn VAT đầy đủ."],
            ].map(([q, a]) => (
              <div key={q} className="border border-gray-200 rounded-xl p-6">
                <h3 className="font-serif font-bold text-gray-900 mb-2">{q}</h3>
                <p className="text-gray-600 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-cyan-600">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-serif font-black text-white mb-4">Không chắc gói nào phù hợp?</h2>
          <p className="text-xl text-cyan-100 mb-10">Đội tư vấn của chúng tôi sẵn sàng giúp bạn chọn gói tối ưu.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login" className="inline-flex items-center bg-white text-cyan-600 hover:bg-gray-100 font-medium px-8 py-4 rounded-xl text-lg transition-colors">
              Dùng thử miễn phí <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
            <Link href="/contact" className="inline-flex items-center border-2 border-white text-white hover:bg-white hover:text-cyan-600 font-medium px-8 py-4 rounded-xl text-lg transition-colors">
              Tải bảng giá chi tiết
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
