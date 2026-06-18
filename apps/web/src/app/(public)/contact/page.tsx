// src/app/(public)/contact/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Phone, Mail, Calendar, MapPin, Clock } from "lucide-react";

export const metadata: Metadata = { title: "Liên hệ" };

const CONTACT_METHODS = [
  {
    Icon: Phone,
    color: "bg-cyan-100 text-cyan-600",
    title: "Hotline miễn phí",
    value: "1800 6789",
    desc: "Thứ 2 – Thứ 6, 8:00 – 18:00",
  },
  {
    Icon: Mail,
    color: "bg-amber-100 text-amber-600",
    title: "Email hỗ trợ",
    value: "hello@vsme.vn",
    desc: "Phản hồi trong vòng 2 giờ",
  },
  {
    Icon: Calendar,
    color: "bg-cyan-100 text-cyan-600",
    title: "Đặt lịch Demo",
    value: "Đặt lịch ngay",
    desc: "Demo 1-1 với chuyên gia trong 30 phút",
  },
];

const OFFICES = [
  {
    city: "Hà Nội (HQ)",
    addr: "Tầng 12, Tòa nhà Handico, Phạm Hùng, Nam Từ Liêm",
    tel: "024 3795 6789",
    hours: "Thứ 2–6: 8:00–17:30",
  },
  {
    city: "TP. Hồ Chí Minh",
    addr: "Tầng 8, Tòa The Vista, 628C Xa Lộ Hà Nội, Quận 9",
    tel: "028 3795 6789",
    hours: "Thứ 2–6: 8:00–17:30",
  },
  {
    city: "Đà Nẵng",
    addr: "Tầng 5, Tòa nhà VCN, 169 Nguyễn Văn Linh, Hải Châu",
    tel: "0236 3795 678",
    hours: "Thứ 2–6: 8:00–17:30",
  },
];

export default function ContactPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-50 to-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Liên hệ</div>
          <h1 className="text-5xl font-serif font-black text-gray-900 mb-6 leading-tight">
            Chúng tôi luôn <span className="text-cyan-600">sẵn sàng</span> hỗ trợ
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Đội ngũ chuyên gia của vSME sẵn sàng tư vấn và hỗ trợ bạn tìm giải pháp phù hợp nhất.
          </p>
        </div>
      </section>

      {/* Contact methods */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {CONTACT_METHODS.map(({ Icon, color, title, value, desc }) => (
              <div key={title} className="bg-gray-50 rounded-2xl p-8 text-center border border-gray-100 hover:border-cyan-200 hover:shadow-lg transition-all duration-200">
                <div className={`w-16 h-16 ${color} rounded-2xl flex items-center justify-center mx-auto mb-5`}>
                  <Icon className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-serif font-bold text-gray-900 mb-2">{title}</h3>
                <div className="text-cyan-600 font-semibold mb-2">{value}</div>
                <p className="text-gray-500 text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form + Offices */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">

            {/* Contact Form */}
            <div>
              <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Gửi tin nhắn</div>
              <h2 className="text-3xl font-serif font-black text-gray-900 mb-8">Để lại thông tin, chúng tôi sẽ liên hệ lại</h2>
              <form className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Họ</label>
                    <input type="text" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all text-gray-900" placeholder="Nguyễn" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Tên</label>
                    <input type="text" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all text-gray-900" placeholder="Văn A" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email doanh nghiệp</label>
                  <input type="email" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all text-gray-900" placeholder="you@company.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Số điện thoại</label>
                  <input type="tel" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all text-gray-900" placeholder="0912 345 678" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Chủ đề</label>
                  <select className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all text-gray-900 bg-white">
                    <option value="">Chọn chủ đề</option>
                    <option>Tư vấn sản phẩm</option>
                    <option>Báo giá</option>
                    <option>Hỗ trợ kỹ thuật</option>
                    <option>Đặt lịch demo</option>
                    <option>Hợp tác kinh doanh</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nội dung</label>
                  <textarea rows={4} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all text-gray-900 resize-none" placeholder="Mô tả nhu cầu của bạn..." />
                </div>
                <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-medium py-4 rounded-xl transition-colors text-lg">
                  Gửi tin nhắn →
                </button>
              </form>
            </div>

            {/* Offices */}
            <div>
              <div className="inline-block text-xs font-semibold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Văn phòng</div>
              <h2 className="text-3xl font-serif font-black text-gray-900 mb-8">Gặp chúng tôi trực tiếp</h2>
              <div className="space-y-6">
                {OFFICES.map(({ city, addr, tel, hours }) => (
                  <div key={city} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:border-cyan-200 transition-colors">
                    <h3 className="text-lg font-serif font-bold text-gray-900 mb-3">{city}</h3>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-start space-x-2">
                        <MapPin className="w-4 h-4 text-cyan-600 mt-0.5 flex-shrink-0" />
                        <span>{addr}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Phone className="w-4 h-4 text-cyan-600 flex-shrink-0" />
                        <span>{tel}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4 text-cyan-600 flex-shrink-0" />
                        <span>{hours}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Emergency */}
                <div className="bg-cyan-600 rounded-2xl p-6 text-white">
                  <h3 className="font-serif font-bold text-lg mb-2">🚨 Hỗ trợ khẩn cấp 24/7</h3>
                  <p className="text-cyan-100 text-sm mb-3">Dành cho khách hàng Pro và Enterprise khi gặp sự cố nghiêm trọng.</p>
                  <div className="text-xl font-bold">1800 6789 ext. 2</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-cyan-600">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-serif font-black text-white mb-4">Muốn trải nghiệm trước?</h2>
          <p className="text-xl text-cyan-100 mb-10">Bắt đầu dùng thử miễn phí 30 ngày ngay hôm nay.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login" className="inline-flex items-center bg-white text-cyan-600 hover:bg-gray-100 font-medium px-8 py-4 rounded-xl text-lg transition-colors">
              Dùng thử miễn phí
            </Link>
            <Link href="/pricing" className="inline-flex items-center border-2 border-white text-white hover:bg-white hover:text-cyan-600 font-medium px-8 py-4 rounded-xl text-lg transition-colors">
              Xem bảng giá
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
