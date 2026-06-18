// src/app/page.tsx — Public landing page (PMS Investment Services clone)
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PublicNav } from "@/components/public/nav";
import { PublicFooter } from "@/components/public/footer";
import { FaqAccordion } from "@/components/public/faq";
import {
  Zap, ArrowRight, CheckCircle2, Brain, LayoutGrid, ShieldCheck,
  Star, ChevronRight,
} from "lucide-react";

export const metadata: Metadata = { title: "vSME — Nền tảng Quản lý Doanh nghiệp SME tích hợp AI" };

/* ─── Data ─────────────────────────────────────────────────────────────── */
const STATS = [
  { value: "500+", label: "Doanh nghiệp tin dùng" },
  { value: "13", label: "Module nghiệp vụ" },
  { value: "99.9%", label: "Uptime đảm bảo" },
  { value: "24/7", label: "Hỗ trợ kỹ thuật" },
];

const FEATURES = [
  {
    Icon: Brain,
    color: "bg-cyan-100 text-cyan-600",
    title: "AI-Powered Automation",
    desc: "Hệ thống AI Agent thế hệ mới tự động hóa quy trình kế toán, phê duyệt, báo cáo — giảm 70% công việc thủ công cho nhân viên.",
  },
  {
    Icon: LayoutGrid,
    color: "bg-amber-100 text-amber-600",
    title: "Giải pháp Toàn diện",
    desc: "13 module nghiệp vụ từ kế toán, nhân sự, bán hàng đến hóa đơn điện tử — tất cả tích hợp thành một hệ thống duy nhất.",
  },
  {
    Icon: ShieldCheck,
    color: "bg-cyan-100 text-cyan-600",
    title: "Bảo mật & Tuân thủ",
    desc: "Dữ liệu mã hóa chuẩn enterprise, RBAC phân quyền chi tiết, kiểm toán đầy đủ. Tuân thủ Thông tư 200/TT-BTC và chuẩn VAS.",
  },
];

const PRINCIPLES = [
  {
    title: "AI-First, Human-Centric",
    desc: "AI hỗ trợ quyết định, con người kiểm soát. Mọi tự động hóa đều có audit trail đầy đủ và khả năng override thủ công.",
  },
  {
    title: "Dữ liệu thời gian thực",
    desc: "Dashboard tổng hợp cập nhật real-time từ tất cả phòng ban — lãnh đạo luôn có đầy đủ thông tin để ra quyết định đúng lúc.",
  },
  {
    title: "Tích hợp hệ sinh thái Việt Nam",
    desc: "Kết nối trực tiếp cổng e-invoice Tổng Cục Thuế, ngân hàng nội địa, và các sàn TMĐT hàng đầu Việt Nam.",
  },
  {
    title: "Mở rộng không giới hạn",
    desc: "Kiến trúc module hóa cho phép bật/tắt tính năng theo nhu cầu. Không trả tiền cho tính năng không dùng.",
  },
];

const STEPS = [
  { n: "1", title: "Đăng ký & Khởi tạo", desc: "Tạo tài khoản, chọn gói phù hợp. Hệ thống tự cấu hình môi trường trong 5 phút." },
  { n: "2", title: "Cấu hình doanh nghiệp", desc: "Nhập thông tin công ty, sơ đồ tổ chức, biểu đồ tài khoản kế toán chuẩn VAS." },
  { n: "3", title: "Import & Migration", desc: "Nhập dữ liệu từ Excel hoặc hệ thống cũ. Đội kỹ thuật hỗ trợ migration toàn phần." },
  { n: "4", title: "Vận hành & Tối ưu", desc: "Hệ thống sẵn sàng hoạt động. AI liên tục học và tối ưu quy trình theo thực tế." },
];

const TESTIMONIALS = [
  {
    text: "\"vSME đã thay đổi hoàn toàn cách chúng tôi vận hành. Trước kia cần 3 người kế toán làm đến 10h đêm cuối tháng, giờ AI tự động hóa 80% công việc. Xuất báo cáo tài chính chỉ mất 2 phút.\"",
    initials: "TH", bg: "bg-cyan-100", text_color: "text-cyan-700",
    name: "Trần Hải", role: "Giám đốc — Công ty TNHH Thương mại XYZ",
  },
  {
    text: "\"Module hóa đơn điện tử kết nối thẳng với cổng thuế giúp chúng tôi không còn sợ bị phạt vì kê khai sai. Đội ngũ hỗ trợ của vSME phản hồi nhanh, chuyên nghiệp — tôi rất hài lòng.\"",
    initials: "NL", bg: "bg-amber-100", text_color: "text-amber-700",
    name: "Nguyễn Linh", role: "Kế toán trưởng — Công ty Cổ phần ABC",
  },
  {
    text: "\"Từ khi dùng vSME, tôi có thể quản lý cùng lúc 3 công ty con chỉ từ một màn hình. Dashboard consolidation tự động, không cần ngồi ghép Excel nữa. Đây là bước ngoặt với doanh nghiệp tôi.\"",
    initials: "PD", bg: "bg-cyan-100", text_color: "text-cyan-700",
    name: "Phạm Đức", role: "Chủ tịch HĐQT — Tập đoàn DEF Holdings",
  },
];

const PRICING = [
  {
    name: "Starter",
    sub: "Dành cho doanh nghiệp nhỏ",
    price: "2.5tr",
    popular: false,
    features: ["Tối đa 10 người dùng", "Kế Toán + Hóa Đơn Điện Tử", "Dashboard cơ bản", "Hỗ trợ email", "5GB lưu trữ"],
    cta: "Bắt đầu miễn phí", href: "/signup",
  },
  {
    name: "Professional",
    sub: "Dành cho SME đang tăng trưởng",
    price: "6tr",
    popular: true,
    features: ["Tối đa 50 người dùng", "Tất cả module Core", "AI Agent cơ bản", "Nhân Sự + Bán Hàng + CRM", "Hỗ trợ điện thoại ưu tiên", "50GB lưu trữ"],
    cta: "Bắt đầu miễn phí", href: "/signup",
  },
  {
    name: "Enterprise",
    sub: "Dành cho doanh nghiệp vừa",
    price: "Liên hệ",
    popular: false,
    features: ["Người dùng không giới hạn", "Toàn bộ 13 module", "AI Agent toàn phần (C-Suite)", "On-premise hoặc Private Cloud", "SLA 99.9% + hỗ trợ 24/7", "Lưu trữ không giới hạn"],
    cta: "Liên hệ tư vấn", href: "/contact",
  },
];

/* ─── Component ─────────────────────────────────────────────────────────── */
export default async function LandingPage() {
  const session = await auth();
  if (session) redirect("/admin");

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <PublicNav />

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="bg-gradient-to-br from-gray-50 to-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center bg-cyan-50 text-cyan-700 text-sm font-medium px-4 py-2 rounded-full mb-6 border border-cyan-100">
            <Zap className="w-4 h-4 mr-2 fill-cyan-500 text-cyan-500" />
            Tích hợp AI Agent thế hệ mới — Ra mắt 2026
          </div>
          <h1 className="text-5xl md:text-6xl font-serif font-black text-gray-900 mb-6 leading-tight">
            Quản Lý SME{" "}
            <span className="text-cyan-600">Thông Minh Hơn</span>
            <br className="hidden md:block" />
            {" "}với AI
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-3xl mx-auto leading-relaxed">
            Nền tảng quản lý doanh nghiệp SME toàn diện — Kế toán · Nhân sự · Bán hàng · Hóa đơn điện tử · AI Agent System. Tất cả trong một, tích hợp liền mạch.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center bg-cyan-600 hover:bg-cyan-700 text-white font-medium px-8 py-4 rounded-xl text-lg transition-colors shadow-lg"
            >
              Dùng thử miễn phí 30 ngày
              <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
            <Link
              href="/about"
              className="inline-flex items-center border-2 border-cyan-600 text-cyan-600 hover:bg-cyan-50 font-medium px-8 py-4 rounded-xl text-lg transition-colors"
            >
              Tìm hiểu thêm
            </Link>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {STATS.map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-3xl font-serif font-black text-cyan-600">{value}</div>
                <div className="text-sm text-gray-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ ABOUT ═══════════════ */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">
                Về chúng tôi
              </div>
              <h2 className="text-4xl font-serif font-black text-gray-900 mb-6">Chúng tôi là ai?</h2>
              <p className="text-lg text-gray-600 mb-5 leading-relaxed">
                vSME được xây dựng với sứ mệnh giúp các doanh nghiệp vừa và nhỏ tại Việt Nam vận hành hiệu quả hơn, minh bạch hơn và thông minh hơn thông qua công nghệ AI tiên tiến.
              </p>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                Nền tảng tích hợp AI Agent System giúp tự động hóa quy trình nghiệp vụ — từ kế toán, nhân sự đến bán hàng — đảm bảo tuân thủ pháp luật Việt Nam và kết nối với hệ thống thuế điện tử của Tổng Cục Thuế.
              </p>
              <div className="flex flex-wrap items-center gap-8">
                {[["5+", "Năm phát triển"], ["500+", "Khách hàng SME"], ["10+", "Tỉnh thành"]].map(([v, l]) => (
                  <div key={l} className="text-center">
                    <div className="text-3xl font-serif font-black text-cyan-600">{v}</div>
                    <div className="text-sm text-gray-500">{l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&auto=format&fit=crop&q=80"
                  alt="Đội ngũ vSME"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-6 -left-6 bg-white rounded-xl shadow-xl p-4 flex items-center space-x-3">
                <div className="w-12 h-12 bg-cyan-100 rounded-lg flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-cyan-600" />
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900">Tuân thủ 100%</div>
                  <div className="text-xs text-gray-500">Pháp luật Việt Nam</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ FEATURES ═══════════════ */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Lợi thế cạnh tranh</div>
            <h2 className="text-4xl font-serif font-black text-gray-900 mb-4">Tại sao chọn vSME?</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Chúng tôi không chỉ cung cấp phần mềm — chúng tôi cung cấp giải pháp quản trị doanh nghiệp toàn diện tích hợp AI.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {FEATURES.map(({ Icon, color, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
                <div className={`w-16 h-16 ${color} rounded-2xl flex items-center justify-center mb-6`}>
                  <Icon className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-serif font-bold text-gray-900 mb-3">{title}</h3>
                <p className="text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ PRINCIPLES ═══════════════ */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Triết lý phát triển</div>
            <h2 className="text-4xl font-serif font-black text-gray-900 mb-4">Nguyên tắc cốt lõi của vSME</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Chúng tôi tin vào sự minh bạch, tự động hóa thông minh và cam kết đồng hành cùng sự phát triển của doanh nghiệp bạn.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-7">
              {PRINCIPLES.map(({ title, desc }) => (
                <div key={title} className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-cyan-100 rounded-full flex items-center justify-center mt-1">
                    <CheckCircle2 className="w-4 h-4 text-cyan-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-serif font-bold text-gray-900 mb-2">{title}</h3>
                    <p className="text-gray-600 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="relative">
              <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop&q=80"
                  alt="Dashboard phân tích dữ liệu"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -right-4 top-8 bg-white rounded-xl shadow-xl p-5 w-48 hidden lg:block">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Active Modules</div>
                <div className="space-y-2">
                  {[["bg-green-400", "Kế Toán"], ["bg-green-400", "Hóa Đơn"], ["bg-green-400", "Nhân Sự"], ["bg-cyan-400", "Bán Hàng"], ["bg-cyan-400", "AI Agent"]].map(([dot, label]) => (
                    <div key={label} className="flex items-center space-x-2 text-sm text-gray-700">
                      <div className={`w-2 h-2 rounded-full ${dot}`} />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS ═══════════════ */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Quy trình triển khai</div>
            <h2 className="text-4xl font-serif font-black text-gray-900 mb-4">Bắt đầu trong 4 bước đơn giản</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Chúng tôi đồng hành cùng bạn từ ngày đầu tiên đến khi hệ thống vận hành trơn tru.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
            <div className="hidden md:block absolute top-8 left-[12.5%] right-[12.5%] h-0.5 bg-cyan-100 z-0" />
            {STEPS.map(({ n, title, desc }) => (
              <div key={n} className="text-center relative z-10">
                <div className="w-16 h-16 bg-cyan-600 text-white rounded-full flex items-center justify-center mx-auto mb-5 text-2xl font-serif font-black shadow-lg">
                  {n}
                </div>
                <h3 className="text-lg font-serif font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ TESTIMONIALS ═══════════════ */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Khách hàng nói gì</div>
            <h2 className="text-4xl font-serif font-black text-gray-900 mb-4">Câu chuyện thành công</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Lắng nghe chia sẻ từ các doanh nghiệp SME đang sử dụng vSME mỗi ngày.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {TESTIMONIALS.map(({ text, initials, bg, text_color, name, role }) => (
              <div key={name} className="bg-white border border-gray-100 rounded-2xl p-8 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
                <div className="flex mb-5">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-5 h-5 text-amber-400 fill-amber-400" />)}
                </div>
                <p className="text-gray-600 mb-6 italic leading-relaxed">{text}</p>
                <div className="flex items-center">
                  <div className={`w-12 h-12 rounded-full ${bg} flex items-center justify-center mr-4 text-lg font-bold ${text_color}`}>
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
          <div className="text-center mt-10">
            <Link href="/testimonials" className="inline-flex items-center text-cyan-600 font-medium hover:text-cyan-700">
              Xem thêm câu chuyện <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════ PRICING ═══════════════ */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Bảng giá minh bạch</div>
            <h2 className="text-4xl font-serif font-black text-gray-900 mb-4">Chọn gói phù hợp với bạn</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Giá cả minh bạch, không phí ẩn. Bắt đầu miễn phí 30 ngày, không cần thẻ tín dụng.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {PRICING.map(({ name, sub, price, popular, features, cta, href }) => (
              <div
                key={name}
                className={`bg-white rounded-2xl p-8 relative ${
                  popular
                    ? "border-2 border-cyan-600 shadow-xl"
                    : "border-2 border-gray-200 hover:shadow-lg transition-shadow"
                }`}
              >
                {popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-amber-500 text-white text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap">
                      Phổ biến nhất
                    </span>
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-2xl font-serif font-bold text-gray-900 mb-1">{name}</h3>
                  <p className="text-gray-500 text-sm">{sub}</p>
                  <div className="mt-4">
                    <span className="text-4xl font-serif font-black text-cyan-600">{price}</span>
                    {price !== "Liên hệ" && <span className="text-gray-500 text-sm ml-1">/tháng</span>}
                  </div>
                </div>
                <ul className="space-y-3 mb-8 text-sm">
                  {features.map(f => (
                    <li key={f} className="flex items-center text-gray-700">
                      <CheckCircle2 className="w-5 h-5 text-cyan-600 mr-2 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={href}
                  className="block w-full bg-cyan-600 hover:bg-cyan-700 text-white text-center font-medium py-3 rounded-xl transition-colors"
                >
                  {cta}
                </Link>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/pricing" className="inline-flex items-center text-cyan-600 font-medium hover:text-cyan-700">
              Xem bảng giá chi tiết <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════ FAQ ═══════════════ */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Hỏi đáp thường gặp</div>
            <h2 className="text-4xl font-serif font-black text-gray-900 mb-4">Câu hỏi thường gặp</h2>
            <p className="text-xl text-gray-600 leading-relaxed">
              Tìm hiểu thêm về vSME và cách chúng tôi có thể giúp doanh nghiệp bạn.
            </p>
          </div>
          <FaqAccordion />
        </div>
      </section>

      {/* ═══════════════ CTA BANNER ═══════════════ */}
      <section className="py-20 bg-cyan-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-serif font-black text-white mb-4">
            Sẵn sàng bắt đầu hành trình của bạn?
          </h2>
          <p className="text-xl text-cyan-100 mb-10 leading-relaxed">
            Dùng thử miễn phí 30 ngày. Không cần thẻ tín dụng. Hủy bất cứ lúc nào.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center bg-white text-cyan-600 hover:bg-gray-100 font-medium px-8 py-4 rounded-xl text-lg transition-colors"
            >
              Dùng thử miễn phí 30 ngày <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center border-2 border-white text-white hover:bg-white hover:text-cyan-600 font-medium px-8 py-4 rounded-xl text-lg transition-colors"
            >
              Đặt lịch tư vấn
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
