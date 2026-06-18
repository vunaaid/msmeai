// src/app/(public)/services/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "Tính năng & Modules" };

const MODULES = [
  {
    icon: "📊",
    key: "gl",
    name: "Kế Toán Tổng Hợp",
    desc: "Quản lý toàn bộ sổ cái, bút toán kép, đối chiếu tài khoản và báo cáo tài chính theo chuẩn VAS.",
    features: ["Sổ cái & nhật ký chung", "Báo cáo tài chính tự động", "Tuân thủ Thông tư 200", "Kết chuyển cuối kỳ AI"],
    highlight: false,
  },
  {
    icon: "🧾",
    key: "einvoice",
    name: "Hóa Đơn Điện Tử",
    desc: "Phát hành và quản lý hóa đơn điện tử kết nối trực tiếp với cổng TCT. Không cần phần mềm thứ 3.",
    features: ["Kết nối API TCT trực tiếp", "Ký số điện tử", "Hóa đơn điều chỉnh/hủy", "Lưu trữ 10 năm"],
    highlight: false,
  },
  {
    icon: "👥",
    key: "hr",
    name: "Nhân Sự & Lương",
    desc: "Quản lý hồ sơ nhân viên, chấm công, tính lương và đóng BHXH theo quy định Việt Nam.",
    features: ["Chấm công đa phương thức", "Tính lương tự động", "Quyết toán BHXH/BHYT", "Khai báo thuế TNCN"],
    highlight: false,
  },
  {
    icon: "💰",
    key: "crm",
    name: "Bán Hàng & CRM",
    desc: "Pipeline bán hàng, quản lý khách hàng, đơn hàng và doanh thu thời gian thực trên một nền tảng.",
    features: ["Pipeline bán hàng Kanban", "Quản lý khách hàng 360°", "Báo giá & hợp đồng", "Phân tích doanh thu AI"],
    highlight: false,
  },
  {
    icon: "✨",
    key: "ai",
    name: "AI Agent System",
    desc: "Trợ lý AI tích hợp sâu vào nghiệp vụ — phân tích dữ liệu, tự động hóa quy trình và hỗ trợ ra quyết định.",
    features: ["Phân tích tài chính tự động", "Cảnh báo bất thường", "Tóm tắt báo cáo LLM", "Workflow tự động hóa"],
    highlight: true,
  },
  {
    icon: "📈",
    key: "report",
    name: "Báo Cáo & BI",
    desc: "Dashboard tùy chỉnh, báo cáo đa chiều và phân tích xu hướng giúp lãnh đạo ra quyết định nhanh.",
    features: ["Dashboard tùy chỉnh", "Báo cáo đa chiều (Pivot)", "Dự báo dòng tiền", "Export Excel/PDF"],
    highlight: false,
  },
];

const DIFFERENTIATORS = [
  {
    title: "Tất cả trong một",
    desc: "Không cần mua nhiều phần mềm rời rạc. vSME tích hợp 13+ module trong một nền tảng, dữ liệu thông suốt giữa các phòng ban.",
  },
  {
    title: "Xây dựng cho Việt Nam",
    desc: "Tuân thủ Thông tư 200, hóa đơn điện tử TCT, biểu mẫu thuế chuẩn, tiếng Việt 100% — không phải dịch từ phần mềm ngoại.",
  },
  {
    title: "AI thực sự hữu ích",
    desc: "AI Agent không chỉ là chatbot — nó hiểu nghiệp vụ kế toán, nhân sự và có thể thực hiện tác vụ thực với sự phê duyệt của bạn.",
  },
];

export default function ServicesPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-50 to-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Tính năng</div>
          <h1 className="text-5xl font-serif font-black text-gray-900 mb-6 leading-tight">
            Tất cả công cụ bạn cần<br />
            <span className="text-cyan-600">trong một nền tảng</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            13 module nghiệp vụ tích hợp liền mạch — từ kế toán, nhân sự, bán hàng đến AI Agent System thế hệ mới.
          </p>
        </div>
      </section>

      {/* Module Grid */}
      <section id="modules" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {MODULES.map(({ icon, name, desc, features, highlight }) => (
              <div
                key={name}
                className={`rounded-2xl p-8 border-2 hover:shadow-xl hover:-translate-y-1 transition-all duration-200 ${
                  highlight
                    ? "border-cyan-600 bg-white shadow-lg"
                    : "border-gray-100 bg-white shadow-sm"
                }`}
              >
                {highlight && (
                  <div className="inline-flex items-center bg-cyan-50 text-cyan-700 text-xs font-semibold px-3 py-1 rounded-full mb-4">
                    ✨ AI-Powered
                  </div>
                )}
                <div className="text-4xl mb-4">{icon}</div>
                <h3 className="text-xl font-serif font-bold text-gray-900 mb-3">{name}</h3>
                <p className="text-gray-600 leading-relaxed mb-5">{desc}</p>
                <ul className="space-y-2">
                  {features.map(f => (
                    <li key={f} className="flex items-center space-x-2 text-sm text-gray-700">
                      <CheckCircle2 className="w-4 h-4 text-cyan-600 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Differentiators */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Lợi thế</div>
            <h2 className="text-4xl font-serif font-black text-gray-900 mb-4">Điều khiến vSME khác biệt</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {DIFFERENTIATORS.map(({ title, desc }, i) => (
              <div key={title} className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
                <div className="w-12 h-12 bg-cyan-600 text-white rounded-xl flex items-center justify-center font-serif font-black text-lg mb-5">
                  {i + 1}
                </div>
                <h3 className="text-xl font-serif font-bold text-gray-900 mb-3">{title}</h3>
                <p className="text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Triển khai</div>
            <h2 className="text-4xl font-serif font-black text-gray-900 mb-4">Bắt đầu trong 4 bước</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
            <div className="hidden md:block absolute top-8 left-[12.5%] right-[12.5%] h-0.5 bg-cyan-100" />
            {["Đăng ký & Khởi tạo", "Cấu hình doanh nghiệp", "Import & Migration", "Vận hành & Tối ưu"].map((title, i) => (
              <div key={title} className="text-center relative z-10">
                <div className="w-16 h-16 bg-cyan-600 text-white rounded-full flex items-center justify-center mx-auto mb-5 text-2xl font-serif font-black shadow-lg">
                  {i + 1}
                </div>
                <h3 className="text-lg font-serif font-bold text-gray-900">{title}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-cyan-600">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-serif font-black text-white mb-4">Sẵn sàng trải nghiệm?</h2>
          <p className="text-xl text-cyan-100 mb-10">30 ngày miễn phí, không cần thẻ tín dụng, hủy bất cứ lúc nào.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login" className="inline-flex items-center bg-white text-cyan-600 hover:bg-gray-100 font-medium px-8 py-4 rounded-xl text-lg transition-colors">
              Dùng thử miễn phí 30 ngày <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
            <Link href="/contact" className="inline-flex items-center border-2 border-white text-white hover:bg-white hover:text-cyan-600 font-medium px-8 py-4 rounded-xl text-lg transition-colors">
              Đặt lịch tư vấn
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
