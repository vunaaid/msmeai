"use client";
// src/components/public/faq.tsx

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "vSME có phù hợp với doanh nghiệp mới thành lập không?",
    a: "Hoàn toàn phù hợp! Gói Starter được thiết kế đặc biệt cho doanh nghiệp mới với chi phí thấp nhưng đầy đủ tính năng kế toán cơ bản và hóa đơn điện tử. Bạn có thể nâng cấp dễ dàng khi doanh nghiệp phát triển.",
  },
  {
    q: "Dữ liệu của tôi có an toàn không?",
    a: "Tuyệt đối an toàn. Chúng tôi sử dụng mã hóa AES-256 cho dữ liệu lưu trữ và TLS 1.3 cho dữ liệu truyền tải. Hệ thống backup tự động 3 lần/ngày, lưu trữ geo-redundant tại Việt Nam. Đạt tiêu chuẩn ISO 27001.",
  },
  {
    q: "Tôi có thể chuyển dữ liệu từ phần mềm kế toán cũ không?",
    a: "Được! vSME hỗ trợ import từ hầu hết phần mềm kế toán phổ biến tại Việt Nam (MISA, Fast, Effect...) và từ Excel. Đội kỹ thuật của chúng tôi sẽ hỗ trợ migration hoàn toàn miễn phí trong gói Pro và Enterprise.",
  },
  {
    q: "AI Agent hoạt động như thế nào?",
    a: "AI Agent của vSME được xây dựng trên LLM thế hệ mới, có khả năng đọc hiểu nghiệp vụ kế toán, nhân sự và bán hàng. Nó có thể tự động phân loại chứng từ, đề xuất bút toán, tóm tắt báo cáo và cảnh báo bất thường — tất cả đều có audit trail và cần phê duyệt của người dùng.",
  },
  {
    q: "Có hỗ trợ kết nối với ngân hàng không?",
    a: "Có! vSME kết nối API với hơn 20 ngân hàng tại Việt Nam để import sao kê tự động, đối chiếu giao dịch và thanh toán trực tuyến. Danh sách ngân hàng bao gồm Vietcombank, BIDV, VietinBank, Techcombank, MB Bank và nhiều ngân hàng khác.",
  },
  {
    q: "Chi phí có bao gồm phí ẩn không?",
    a: "Hoàn toàn không! Giá niêm yết bao gồm tất cả tính năng trong gói bạn chọn. Phí add-on chỉ phát sinh nếu bạn dùng vượt hạn mức (hóa đơn xuất, dung lượng lưu trữ). Tất cả đều được thông báo rõ ràng trước.",
  },
];

export function FaqAccordion() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {FAQS.map((faq, i) => (
        <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-50 transition-colors"
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
          >
            <span className="font-serif font-bold text-gray-900 pr-4">{faq.q}</span>
            <ChevronDown
              className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform duration-300 ${
                openIdx === i ? "rotate-180" : ""
              }`}
            />
          </button>
          {openIdx === i && (
            <div className="px-6 pb-5 text-gray-600 leading-relaxed border-t border-gray-100 pt-4">
              {faq.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
