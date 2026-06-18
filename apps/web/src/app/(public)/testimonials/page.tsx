// src/app/(public)/testimonials/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Star, ArrowRight } from "lucide-react";

export const metadata: Metadata = { title: "Khách hàng nói gì" };

const FEATURED = [
  {
    text: "\"vSME đã thay đổi hoàn toàn cách chúng tôi vận hành. Trước kia cần 3 người kế toán làm đến 10h đêm cuối tháng, giờ AI tự động hóa 80% công việc. Xuất báo cáo tài chính chỉ mất 2 phút thay vì 3 ngày.\"",
    initials: "TH", bg: "bg-gradient-to-br from-cyan-500 to-cyan-700", name: "Trần Hải",
    role: "Giám đốc — Công ty TNHH Thương mại XYZ Việt Nam", size: "45 nhân viên",
  },
  {
    text: "\"Từ khi dùng vSME, tôi có thể quản lý cùng lúc 3 công ty con chỉ từ một màn hình. Dashboard consolidation tự động, không cần ngồi ghép Excel nữa. Giảm được 2 nhân sự kế toán mà hiệu quả tăng gấp 3.\"",
    initials: "PD", bg: "bg-gradient-to-br from-amber-500 to-amber-700", name: "Phạm Đức",
    role: "Chủ tịch HĐQT — Tập đoàn DEF Holdings", size: "200 nhân viên",
  },
];

const TESTIMONIALS = [
  { initials: "NL", bg: "bg-amber-100", tc: "text-amber-700", name: "Nguyễn Linh", role: "Kế toán trưởng — Công ty CP ABC", text: "Module hóa đơn điện tử kết nối thẳng với cổng thuế giúp chúng tôi không còn sợ bị phạt vì kê khai sai." },
  { initials: "MT", bg: "bg-cyan-100", tc: "text-cyan-700", name: "Minh Tuấn", role: "CEO — Startup GHI Tech", text: "Với quy mô startup 20 người, vSME cho chúng tôi hệ thống tài chính chuyên nghiệp như doanh nghiệp 500 người." },
  { initials: "TN", bg: "bg-cyan-100", tc: "text-cyan-700", name: "Thảo Nguyên", role: "Giám đốc Tài chính — Chuỗi F&B", text: "Quản lý 15 chi nhánh với 300 nhân viên chưa bao giờ dễ dàng đến vậy. Báo cáo tổng hợp tự động mỗi sáng." },
  { initials: "QH", bg: "bg-amber-100", tc: "text-amber-700", name: "Quang Hùng", role: "Giám đốc — Công ty Xây dựng MNO", text: "Đặc biệt ấn tượng với tính năng quản lý hợp đồng và giải ngân theo tiến độ. Phù hợp hoàn toàn với ngành xây dựng." },
  { initials: "LM", bg: "bg-cyan-100", tc: "text-cyan-700", name: "Lê Mai", role: "Chủ tịch — Tập đoàn Bán lẻ PQR", text: "Tích hợp với các sàn TMĐT và POS giúp đồng bộ đơn hàng và tồn kho tự động. Không còn chênh lệch số liệu." },
  { initials: "HD", bg: "bg-amber-100", tc: "text-amber-700", name: "Hoàng Duy", role: "CFO — Công ty Logistics STU", text: "Module nhân sự và lương tự động tính BHXH, thuế TNCN chính xác. Tiết kiệm 40 giờ/tháng cho bộ phận HR." },
];

const METRICS = [
  { value: "70%", label: "Giảm thời gian xử lý", desc: "Tự động hóa quy trình thủ công" },
  { value: "98%", label: "Tỉ lệ tái ký hợp đồng", desc: "Khách hàng gắn bó dài hạn" },
  { value: "80%", label: "Giới thiệu khách mới", desc: "Qua chương trình referral" },
];

export default function TestimonialsPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-50 to-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Khách hàng nói gì</div>
          <h1 className="text-5xl font-serif font-black text-gray-900 mb-6 leading-tight">
            Câu chuyện <span className="text-cyan-600">thành công</span> thực tế
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            500+ doanh nghiệp SME Việt Nam đã tin tưởng vSME để vận hành hiệu quả hơn mỗi ngày.
          </p>
        </div>
      </section>

      {/* Featured */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {FEATURED.map(({ text, initials, bg, name, role, size }) => (
              <div key={name} className={`${bg} rounded-2xl p-10 text-white relative overflow-hidden`}>
                <div className="absolute top-6 right-8 text-8xl font-serif font-black opacity-10">&ldquo;</div>
                <div className="flex mb-4">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-5 h-5 text-amber-300 fill-amber-300" />)}
                </div>
                <p className="text-white/90 text-lg leading-relaxed mb-8 italic">{text}</p>
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-xl font-bold">
                    {initials}
                  </div>
                  <div>
                    <div className="font-serif font-bold text-lg">{name}</div>
                    <div className="text-white/70 text-sm">{role}</div>
                    <div className="text-white/60 text-xs mt-1">Quy mô: {size}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Grid */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-serif font-black text-gray-900 mb-4">Thêm chia sẻ từ khách hàng</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {TESTIMONIALS.map(({ initials, bg, tc, name, role, text }) => (
              <div key={name} className="bg-white border border-gray-100 rounded-2xl p-8 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
                <div className="flex mb-5">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />)}
                </div>
                <p className="text-gray-600 mb-6 italic leading-relaxed">&ldquo;{text}&rdquo;</p>
                <div className="flex items-center">
                  <div className={`w-12 h-12 rounded-full ${bg} flex items-center justify-center mr-3 font-bold ${tc}`}>
                    {initials}
                  </div>
                  <div>
                    <div className="font-serif font-bold text-gray-900">{name}</div>
                    <div className="text-sm text-gray-500">{role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Metrics */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-serif font-black text-gray-900 mb-4">Kết quả đo lường được</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {METRICS.map(({ value, label, desc }) => (
              <div key={label} className="text-center bg-gradient-to-br from-cyan-50 to-white border border-cyan-100 rounded-2xl p-10">
                <div className="text-6xl font-serif font-black text-cyan-600 mb-3">{value}</div>
                <div className="text-xl font-serif font-bold text-gray-900 mb-2">{label}</div>
                <div className="text-gray-500">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-cyan-600">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-serif font-black text-white mb-4">Bắt đầu hành trình của bạn</h2>
          <p className="text-xl text-cyan-100 mb-10">Gia nhập cộng đồng 500+ doanh nghiệp SME đang vận hành thông minh hơn.</p>
          <Link href="/login" className="inline-flex items-center bg-white text-cyan-600 hover:bg-gray-100 font-medium px-8 py-4 rounded-xl text-lg transition-colors">
            Dùng thử miễn phí 30 ngày <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
        </div>
      </section>
    </>
  );
}
