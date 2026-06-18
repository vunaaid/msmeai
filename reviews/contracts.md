# Rà soát quy trình: Hợp Đồng (contracts)

> Ngày: 2026-06-08 · Người rà: AI audit · Phạm vi: contracts.router, UI contracts/

## 1. Phạm vi (3.1)
HĐ đầu vào/đầu ra, mẫu biểu, lịch thanh toán, vòng đời ký-duyệt, dòng tiền theo HĐ, trợ lý AI pháp lý.

## 2. SWOT (3.2)
**Điểm mạnh:** cấu trúc sạch (route literal trước `/:id`, Zod, audit log, soft-delete); multi-tenant + `@@unique([companyId,number])`; phân quyền đọc theo `allowedRoleIds`; mô hình hóa đúng VN (chiều in/out, khung pháp lý cho AI, payment term/method); tiền Decimal(18,2); cash-flow suy từ direction + `remaining`.
**Điểm yếu:** `partyId` trước đây không kiểm tra tenant; vòng đời thiếu nhất quán (`pending_signature` không bao giờ đạt; `expired`/`completed` không tự set); 1 quyền `contracts:write` gộp mọi thao tác (không tách trách nhiệm); AI extract/legal-review chạy đồng bộ dài, không rate-limit.
**Cơ hội:** cron tự hết hạn/gia hạn; nối `ContractPaymentSchedule.invoiceId`/`Debt` vào AR/AP; thông báo sắp hết hạn/quá hạn TT; lưu bản thảo AI thành `ContractVersion` (model có sẵn, chưa dùng).
**Thách thức:** tự duyệt (thiếu SoD) trên HĐ có giá trị tiền; endpoint AI không giới hạn = rủi ro chi phí.

## 3. Phát hiện & xử lý (3.3–3.5)
| # | Mức | Phát hiện | Trạng thái |
|---|---|---|---|
| 1 | CRITICAL | Tự duyệt: cùng người submit có thể tự approve | ✅ **Đã fix** (chặn `createdBy=approver` trừ chủ DN/admin + yêu cầu quyền `approve`) |
| 2 | HIGH | `partyId` không kiểm tra thuộc công ty (rò chéo tenant) | ✅ **Đã fix** (validate partner company-scope khi customer/vendor) |
| 3 | HIGH | Sinh số HĐ sort chuỗi → sai/đụng khi qua mốc 999 | ✅ **Đã fix** (lấy MAX theo số, pad 4) |
| 4 | HIGH | Đua sinh số → P2002 500 | ✅ **Giảm nhẹ** (error-handler trả 409 toàn cục) |
| 5 | HIGH | Vòng đời: approve nhảy thẳng active, bỏ `pending_signature`; `expired`/`completed` không tự set | ⬜ Đề xuất (cron + bước ký) |
| 6 | LOW | `pay` cho phép quá số tiền (remaining âm) | ⬜ Đề xuất (clamp) |
| 7 | LOW | SchedulesPanel seed state 1 lần, không resync sau refresh | ⬜ Đề xuất |

## 4. Đề xuất cải tiến SME
1. Tách quyền `write`/`approve`/`sign`/`terminate` + chặn tự duyệt (đã làm phần lõi).
2. Cron tự hết hạn/gia hạn + nhắc sắp hết hạn/quá hạn TT (qua `notifyUsers`).
3. Nối lịch thanh toán → AR/AP + hóa đơn (đóng vòng kế toán).
4. Versioning bản thảo AI vào `ContractVersion` + PDF ký bất biến.
5. Rate-limit + chạy nền cho AI extract/legal-review; clamp `pay`.
