// src/app/(public)/about/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Users, Target, Heart, TrendingUp } from "lucide-react";

export const metadata: Metadata = { title: "Về chúng tôi" };

const VALUES = [
  {
    Icon: Target,
    color: "bg-cyan-100 text-cyan-600",
    title: "Sứ mệnh rõ ràng",
    desc: "Giúp doanh nghiệp SME Việt Nam vận hành hiệu quả, minh bạch và thông minh hơn thông qua công nghệ AI tiên tiến.",
  },
  {
    Icon: Heart,
    color: "bg-amber-100 text-amber-600",
    title: "Khách hàng là trọng tâm",
    desc: "Mọi quyết định phát triển sản phẩm đều xuất phát từ nhu cầu thực tế của doanh nghiệp Việt Nam, không phải xu hướng công nghệ.",
  },
  {
    Icon: TrendingUp,
    color: "bg-cyan-100 text-cyan-600",
    title: "Đổi mới liên tục",
    desc: "Chúng tôi cam kết cập nhật tính năng theo sự thay đổi của pháp luật và công nghệ — bảo đảm hệ thống luôn phù hợp với thực tế.",
  },
];

const TEAM = [
  { name: "Nguyễn Văn Minh", role: "CEO & Co-founder", initials: "NM", bg: "bg-cyan-100", tc: "text-cyan-700", bio: "10+ năm kinh nghiệm ERP, cựu TechLead tại FPT Software" },
  { name: "Trần Thị Hoa", role: "CTO & Co-founder", initials: "TH", bg: "bg-amber-100", tc: "text-amber-700", bio: "PhD Computer Science, chuyên gia AI/ML tại VinAI Research" },
  { name: "Lê Quang Dũng", role: "CFO", initials: "LD", bg: "bg-cyan-100", tc: "text-cyan-700", bio: "CPA, 15+ năm tài chính doanh nghiệp tại Big4 accounting firms" },
];

const MILESTONES = [
  { year: "2020", event: "Thành lập vSME, ra mắt module Kế Toán đầu tiên" },
  { year: "2021", event: "100 khách hàng SME đầu tiên, tích hợp hóa đơn điện tử TCT" },
  { year: "2022", event: "Series A 5 triệu USD, ra mắt module Nhân Sự & Bán Hàng" },
  { year: "2023", event: "300+ khách hàng, mở rộng hỗ trợ TP.HCM và Đà Nẵng" },
  { year: "2024", event: "Ra mắt AI Agent System — đầu tiên tại thị trường SME Việt Nam" },
  { year: "2026", event: "500+ khách hàng, nâng cấp AI Agent thế hệ mới với LLM tiên tiến" },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-50 to-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Về chúng tôi</div>
          <h1 className="text-5xl font-serif font-black text-gray-900 mb-6 leading-tight">
            Đội ngũ đằng sau <span className="text-cyan-600">vSME</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Chúng tôi là những người đam mê công nghệ và tin tưởng rằng AI có thể giúp mọi doanh nghiệp Việt Nam vận hành tốt hơn.
          </p>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Câu chuyện</div>
              <h2 className="text-4xl font-serif font-black text-gray-900 mb-6">Câu chuyện của chúng tôi</h2>
              <p className="text-lg text-gray-600 mb-5 leading-relaxed">
                vSME ra đời từ một nỗi đau thực tế: người sáng lập của chúng tôi từng điều hành một doanh nghiệp SME và trải nghiệm trực tiếp sự phân mảnh và kém hiệu quả của hệ thống quản lý truyền thống.
              </p>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                Năm 2020, chúng tôi quyết định xây dựng giải pháp mà chúng tôi ước mình có khi còn là chủ doanh nghiệp — một nền tảng tích hợp toàn diện, thông minh và phù hợp với thực tế pháp lý Việt Nam.
              </p>
              <div className="space-y-3">
                {["Xây dựng tại Việt Nam, cho doanh nghiệp Việt", "Tuân thủ Thông tư 200 và chuẩn mực VAS", "Kết nối trực tiếp với hệ thống TCT", "Hỗ trợ tiếng Việt 100%"].map(t => (
                  <div key={t} className="flex items-center space-x-3">
                    <CheckCircle2 className="w-5 h-5 text-cyan-600 flex-shrink-0" />
                    <span className="text-gray-700">{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&auto=format&fit=crop&q=80" alt="Team" className="w-full h-full object-cover" />
              </div>
              <div className="absolute -bottom-5 -right-5 bg-white rounded-xl shadow-xl p-4 border border-gray-100">
                <div className="text-2xl font-serif font-black text-cyan-600">2020</div>
                <div className="text-xs text-gray-500">Năm thành lập</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Values */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Giá trị cốt lõi</div>
            <h2 className="text-4xl font-serif font-black text-gray-900 mb-4">Những gì chúng tôi tin tưởng</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {VALUES.map(({ Icon, color, title, desc }) => (
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

      {/* Leadership */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Lãnh đạo</div>
            <h2 className="text-4xl font-serif font-black text-gray-900 mb-4">Đội ngũ sáng lập</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {TEAM.map(({ name, role, initials, bg, tc, bio }) => (
              <div key={name} className="text-center">
                <div className={`w-24 h-24 rounded-2xl ${bg} flex items-center justify-center mx-auto mb-4 text-2xl font-bold ${tc}`}>
                  {initials}
                </div>
                <h3 className="text-lg font-serif font-bold text-gray-900">{name}</h3>
                <p className="text-cyan-600 text-sm font-medium mb-2">{role}</p>
                <p className="text-gray-500 text-sm leading-relaxed">{bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[["500+", "Khách hàng SME"], ["13", "Modules tích hợp"], ["5M+", "Giao dịch/tháng"], ["99.9%", "SLA Uptime"]].map(([v, l]) => (
              <div key={l}>
                <div className="text-3xl font-serif font-black text-cyan-400 mb-1">{v}</div>
                <div className="text-gray-400 text-sm">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Hành trình</div>
            <h2 className="text-4xl font-serif font-black text-gray-900 mb-4">Cột mốc phát triển</h2>
          </div>
          <div className="space-y-6">
            {MILESTONES.map(({ year, event }) => (
              <div key={year} className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-16 text-right">
                  <span className="text-sm font-bold text-cyan-600">{year}</span>
                </div>
                <div className="flex-shrink-0 mt-1">
                  <div className="w-3 h-3 rounded-full bg-cyan-600" />
                </div>
                <p className="text-gray-700 leading-relaxed">{event}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-cyan-600">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-serif font-black text-white mb-4">Cùng nhau xây dựng tương lai</h2>
          <p className="text-xl text-cyan-100 mb-10">Tham gia cùng 500+ doanh nghiệp đang vận hành thông minh hơn với vSME.</p>
          <Link href="/login" className="inline-flex items-center bg-white text-cyan-600 hover:bg-gray-100 font-medium px-8 py-4 rounded-xl text-lg transition-colors">
            Bắt đầu miễn phí <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
        </div>
      </section>
    </>
  );
}
