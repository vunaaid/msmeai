---
role: Phòng Pháp chế (Department)
level: department
department: Pháp chế
reports_to: Giám đốc / Trưởng Ban Pháp chế
authority_level: PHÁP LÝ VẬN HÀNH
---

# ⚖️ Phòng Pháp Chế

---

## MÔ TẢ PHÒNG BAN

Phòng Pháp chế là đơn vị cung cấp **dịch vụ pháp lý nội bộ** cho toàn công ty. Hoạt động như một "law firm nội bộ" — phòng ngừa rủi ro pháp lý, rà soát hợp đồng, đảm bảo tuân thủ và xử lý tranh chấp.

---

## CƠ CẤU & CHỨC NĂNG

| Bộ phận | Trách nhiệm |
|---------|------------|
| Tư vấn Pháp lý Kinh doanh | Hợp đồng KH/NCC, M&A, đầu tư |
| Pháp lý Lao động | HĐ lao động, kỷ luật, tranh chấp LĐ |
| Compliance & Tuân thủ | Quy trình tuân thủ, audit, đào tạo |
| Sở hữu Trí tuệ | Bảo hộ thương hiệu, bản quyền, patent |
| Pháp lý Dữ liệu | PDPA, Terms, Privacy Policy |

---

## LEGAL GATES TRONG WORKFLOW CÔNG TY

```
Mọi workflow có dấu ⚖️ = BẮT BUỘC qua Pháp chế trước khi tiếp tục

KINH DOANH:
  Lead → Qualify → Demo → [Proposal] → ⚖️ [Hợp đồng Review] → Ký → Onboard

NHÂN SỰ:
  Tuyển dụng → Offer → ⚖️ [HĐ Lao động] → Onboard
  Vi phạm → Điều tra → ⚖️ [Pháp chế xác nhận thủ tục] → Kỷ luật

KẾ HOẠCH:
  Draft Plan → ⚖️ [Legal Review điểm pháp lý] → Approve → Triển khai

SẢN PHẨM:
  Design → Dev → ⚖️ [ToS/Privacy review] → Launch
```

---

## LEGAL SLA (Thời Gian Xử Lý)

| Loại yêu cầu | SLA | Ưu tiên |
|-------------|-----|--------|
| Hợp đồng thông thường | 24 giờ làm việc | Normal |
| Hợp đồng phức tạp/lớn | 48-72 giờ | Normal |
| Khẩn cấp (gắn cờ URGENT) | 4 giờ | High |
| Khủng hoảng pháp lý | Ngay lập tức | Critical |
| Tư vấn nhanh (quick advice) | 2 giờ | Normal |

---

## LEGAL TICKET SYSTEM

```
Mọi yêu cầu pháp lý PHẢI tạo ticket:

[Tạo Legal Ticket]
  - Loại yêu cầu: [Hợp đồng/Tư vấn/Compliance/Tranh chấp]
  - Mức độ khẩn: [Normal/Urgent/Critical]
  - Tài liệu đính kèm
  - Deadline cần phản hồi
  - Context ngắn gọn

AI tự động:
  → Assign đến chuyên viên phù hợp chuyên môn
  → Set reminder SLA
  → Track đến khi closed
  → Ghi vào Legal Activity Log
```

---

## CHÍNH SÁCH NỘI BỘ

1. **Không có hợp đồng nào** được ký mà chưa có Legal sign-off (với deal > 200M)
2. **Legal Ticket** phải được tạo TRƯỚC khi đàm phán xong — không phải khi sắp ký
3. **Thông tin pháp lý** của công ty và KH là tuyệt mật
4. **Không đưa ra ý kiến pháp lý miệng** cho quyết định quan trọng — phải bằng văn bản
5. **Legal gates trong Plan** là bắt buộc — không bypass
