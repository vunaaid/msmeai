# Module 12: Quản Lý Hợp Đồng Điện Tử — VietKeto

> Tuân thủ: Luật Giao dịch điện tử 2023 (Luật số 20/2023/QH15)  
> Chữ ký số: Nghị định 130/2018/NĐ-CP  
> Lưu trữ điện tử: Nghị định 01/2019/NĐ-CP

---

## 1. Tổng Quan Phân Hệ

### Mục Tiêu
Số hóa toàn bộ vòng đời hợp đồng — từ soạn thảo bằng template, lấy ý kiến nội bộ, ký điện tử nhiều bên, theo dõi thực hiện, đến lưu trữ và cảnh báo hết hạn. Tích hợp chặt với các phân hệ Bán hàng, Mua hàng, Nhân sự, Tài sản và Kế toán tổng hợp.

### Các Loại Hợp Đồng Hỗ Trợ

| Loại | Mã | Liên kết phân hệ |
|------|----|-----------------|
| Hợp đồng bán hàng | `SALE` | Sales → Invoice |
| Hợp đồng mua hàng | `PURCHASE` | Purchase → Invoice |
| Hợp đồng lao động | `EMPLOYMENT` | HR → Payroll |
| Hợp đồng dịch vụ | `SERVICE` | AR/AP |
| Hợp đồng thuê mặt bằng | `LEASE` | Assets → Chi phí |
| Hợp đồng hợp tác | `PARTNERSHIP` | GL |
| Hợp đồng vay vốn | `LOAN` | Cash → GL |
| Hợp đồng bảo hiểm | `INSURANCE` | Assets/HR |

---

## 2. Vòng Đời Hợp Đồng (Contract Lifecycle)

```
                    ┌─────────────────────────────────────┐
                    │         VÒNG ĐỜI HỢP ĐỒNG           │
                    └─────────────────────────────────────┘

[Tạo từ template]          [Soạn thảo tự do]
        │                          │
        └──────────┬───────────────┘
                   │
                   ▼
            ┌──────────────┐
            │  DRAFT        │  ← Nháp (chưa hoàn thiện)
            │  (Nháp)       │    Người soạn thảo toàn quyền sửa
            └──────┬───────┘
                   │ Gửi để review nội bộ
                   ▼
            ┌──────────────┐
            │  REVIEW       │  ← Đang lấy ý kiến nội bộ
            │  (Xét duyệt)  │    Các phòng ban góp ý, đề xuất sửa
            └──────┬───────┘
                   │ Các phòng ban approve
                   ▼
            ┌──────────────┐
            │  APPROVED     │  ← Nội bộ đã duyệt nội dung
            │  (Đã duyệt)   │    Sẵn sàng gửi đối tác ký
            └──────┬───────┘
                   │ Gửi link ký điện tử cho các bên
                   ▼
            ┌──────────────┐
            │  SIGNING      │  ← Đang ký kết
            │  (Đang ký)    │    Các bên lần lượt ký số
            └──────┬───────┘
                   │ Tất cả đã ký
                   ▼
            ┌──────────────┐
            │  ACTIVE       │  ← Hợp đồng có hiệu lực
            │  (Hiệu lực)   │    Theo dõi thực hiện, cảnh báo hạn
            └──────┬───────┘
                   │
        ┌──────────┼──────────────────┐
        │          │                  │
        ▼          ▼                  ▼
  ┌──────────┐ ┌──────────┐    ┌──────────────┐
  │ EXPIRED  │ │TERMINATED│    │  RENEWED     │
  │(Hết hạn) │ │(Thanh lý)│    │  (Gia hạn)   │
  └──────────┘ └──────────┘    └──────────────┘
                                      │
                                      ▼
                               [Tạo HĐ mới từ
                                HĐ cũ làm gốc]
```

---

## 3. Quy Trình Phê Duyệt (Approval Workflow)

### 3.1 Ma Trận Phê Duyệt Theo Giá Trị

| Giá trị HĐ | Người duyệt nội bộ | Người ký |
|------------|-------------------|---------|
| < 50 triệu | Trưởng phòng liên quan | Trưởng phòng |
| 50M – 200M | Trưởng phòng → GĐ bộ phận | GĐ bộ phận |
| 200M – 1 tỷ | TP → GĐ bộ phận → CFO | GĐ bộ phận + CFO |
| > 1 tỷ | TP → GĐ → CFO → CEO | CEO |
| Chiến lược | TP → GĐ → CFO → CEO → HĐQT | CEO + Chủ tịch HĐQT |

### 3.2 Luồng Phê Duyệt Tự Động

```
Kế toán / Kinh doanh tạo HĐ
    │
    ▼
AI đọc: Loại HĐ + Giá trị
    │
    ▼
AI tra bảng phân quyền → Tạo approval chain
VD: HĐ bán 350M → [Trưởng phòng KD] → [GĐ KD] → [CFO]
    │
    ▼
Thông báo lần lượt từng cấp:
  ┌─ Người duyệt nhận notification
  ├─ Xem nội dung HĐ trong app
  ├─ Comment / yêu cầu sửa đổi
  └─ Approve / Reject
    │
    ├── Tất cả approve → APPROVED
    └── Một người reject → DRAFT (kèm lý do + gợi ý sửa)
```

### 3.3 Vòng Lấy Ý Kiến (Review Round)

Mỗi HĐ có thể có nhiều **review rounds**:

```
Round 1: Gửi cho phòng pháp lý (nếu có) → Góp ý điều khoản
Round 2: Gửi cho phòng KD / kỹ thuật → Xác nhận scope
Round 3: Gửi cho CFO → Xác nhận điều khoản thanh toán
Round N: ...
    │
    ▼ Khi tất cả agree → Move to APPROVED
```

---

## 4. Ký Điện Tử (eSign)

### 4.1 Phương Thức Ký Hỗ Trợ

| Phương thức | Mô tả | Độ bảo mật | Pháp lý |
|-------------|-------|-----------|---------|
| **OTP Sign** | Ký qua mã OTP gửi SMS/email | Trung bình | Hợp lệ cho HĐ nội bộ |
| **Chứng thư số cá nhân** | USB Token / Soft cert (.p12) | Cao | Hợp lệ theo Nghị định 130 |
| **eSign tích hợp** | Qua VNPT eSign / Viettel eSign | Rất cao | Công nhận pháp lý đầy đủ |
| **Wet signature + Scan** | Ký tay, scan upload | - | Truyền thống |

### 4.2 Luồng Ký Điện Tử

```
HĐ đã được duyệt nội bộ (APPROVED)
    │
    ▼
Người phụ trách tạo "Signing Request":
  - Danh sách người ký: Bên A + Bên B + ...
  - Thứ tự ký (sequential hoặc parallel)
  - Deadline ký
  - Vị trí chữ ký trên PDF (drag & drop)
    │
    ▼
Hệ thống gửi email + SMS cho từng người ký:
  "Bạn có hợp đồng cần ký: [Xem và ký]"
    │
    ▼
Người ký mở link (không cần tài khoản VietKeto):
  1. Đọc toàn bộ hợp đồng
  2. Check: "Tôi đã đọc và đồng ý"
  3. Ký: OTP / Upload cert / Vẽ chữ ký / eSign
  4. Xác nhận → Hệ thống đóng dấu timestamp + IP
    │
    ▼
Tất cả đã ký
    │
    ▼
Hệ thống:
  - Tạo file PDF cuối (với chữ ký điện tử của tất cả bên)
  - Tạo audit trail certificate (ai ký lúc nào, IP nào)
  - Lưu MinIO (on-premise)
  - Status → ACTIVE
  - Thông báo tất cả bên: "HĐ đã có hiệu lực"
  - Tạo reminder: Ngày bắt đầu, ngày kết thúc
    │
    ▼
Trigger tự động:
  ├── HĐ bán hàng → Tạo Sales Order trong hệ thống
  ├── HĐ mua hàng → Tạo Purchase Order
  ├── HĐ lao động → Tạo Employee record / cập nhật hợp đồng
  └── HĐ thuê → Tạo nhắc lịch thanh toán định kỳ
```

### 4.3 Tích Hợp eSign Provider

```
VietKeto eSign Module
    │
    ├── VNPT eSign API (vnpt-esign.vn)
    │     Endpoint: POST /api/v1/sign
    │     Auth: API Key + Secret
    │     Cert: VNPT-issued certificate
    │
    ├── Viettel eSign (esign.viettel.vn)
    │     Tương tự VNPT
    │
    └── Internal OTP Sign (fallback)
          SMS qua ESMS/SpeedSMS
          Email OTP (6 số, 10 phút)
```

---

## 5. Template Hợp Đồng

### 5.1 Quản Lý Template

- Thư viện template theo loại hợp đồng
- Hỗ trợ biến động `{{ten_khach_hang}}`, `{{gia_tri_hop_dong}}`
- Version control cho template (v1, v2, ...)
- Phân quyền: Ai được dùng template nào
- Lock template (chỉ thay biến, không sửa nội dung cốt lõi)

### 5.2 Template Mặc Định Đi Kèm

| Template | Mô tả |
|----------|-------|
| `SALE-001` | HĐ cung cấp hàng hóa (mua đứt bán đoạn) |
| `SALE-002` | HĐ dịch vụ (theo dự án) |
| `SALE-003` | HĐ dịch vụ (theo tháng/subscription) |
| `PURCHASE-001` | HĐ mua hàng hóa |
| `EMPLOYMENT-001` | HĐ lao động không xác định thời hạn |
| `EMPLOYMENT-002` | HĐ lao động xác định thời hạn (12 tháng) |
| `EMPLOYMENT-003` | HĐ thử việc (2 tháng) |
| `LEASE-001` | HĐ thuê văn phòng |
| `NDA-001` | Thỏa thuận bảo mật (NDA) |

### 5.3 Biến Động Trong Template

```
{{company_name}}        → Tên công ty bên A (tự điền từ settings)
{{company_taxcode}}     → MST bên A
{{company_address}}     → Địa chỉ bên A
{{company_rep}}         → Người đại diện bên A + chức vụ

{{partner_name}}        → Tên bên B (khách hàng / NCC / nhân viên)
{{partner_taxcode}}     → MST bên B
{{partner_address}}     → Địa chỉ bên B
{{partner_rep}}         → Người đại diện bên B

{{contract_number}}     → Số HĐ (tự động)
{{contract_date}}       → Ngày ký
{{start_date}}          → Ngày bắt đầu
{{end_date}}            → Ngày kết thúc
{{contract_value}}      → Giá trị HĐ (số + chữ)
{{payment_terms}}       → Điều khoản thanh toán
{{description}}         → Mô tả dịch vụ/hàng hóa
```

---

## 6. Theo Dõi Thực Hiện Hợp Đồng

### 6.1 Dashboard Hợp Đồng

```
┌──────────────────────────────────────────────────────────────┐
│  QUẢN LÝ HỢP ĐỒNG                              [+ Tạo mới]  │
├────────────┬──────────────┬──────────────┬───────────────────┤
│ Tổng HĐ   │ Hiệu lực     │ Sắp hết hạn  │ Chờ ký           │
│    48      │    35        │    8 ⚠️       │    5 ⏳           │
├────────────┴──────────────┴──────────────┴───────────────────┤
│ CẢNH BÁO                                                     │
│ ⚠️ HĐ #BH-2024-012 (Công ty ABC) — Hết hạn trong 15 ngày   │
│ ⚠️ HĐ #LĐ-2024-008 (Nguyễn Văn A) — Hết hạn trong 7 ngày  │
│ ⏳ HĐ #MH-2024-033 — Đang chờ ký từ đối tác (3 ngày)       │
├──────────────────────────────────────────────────────────────┤
│ DANH SÁCH HỢP ĐỒNG                                          │
│ Số HĐ      │ Loại  │ Đối tác   │ Giá trị  │ Hạn     │ TT  │
│ BH-2025-001│ Bán   │ Cty ABC   │ 500M     │15/06/26 │ ✅  │
│ MH-2025-002│ Mua   │ NCC XYZ   │ 200M     │31/12/25 │ ⏳  │
│ LĐ-2025-010│ Lao động│NV Hùng  │ 20M/th   │01/01/26 │ ✅  │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 Theo Dõi Giá Trị Thực Hiện

Với hợp đồng bán hàng/mua hàng:

```
HĐ #BH-2025-001 — Giá trị: 500,000,000đ
─────────────────────────────────────────
Tiến độ thực hiện:
  ████████████░░░░░░░░ 60% — 300,000,000đ đã xuất hóa đơn

Lịch thanh toán:
  ✅ Đợt 1 (30%): 150M — Đã thanh toán 15/03/2025
  ✅ Đợt 2 (30%): 150M — Đã thanh toán 20/04/2025
  ⏳ Đợt 3 (40%): 200M — Hạn: 30/06/2025 [Tạo HĐ] [Nhắc KH]

Hóa đơn liên kết:
  HĐ-001/2025 — 150,000,000đ ✅
  HĐ-002/2025 — 150,000,000đ ✅
  HĐ-003/2025 — Chưa tạo
```

### 6.3 Điều Khoản Thanh Toán (Milestones)

```
Hợp đồng có thể chia nhỏ thành milestones:

Milestone 1: "Ký hợp đồng"          → 30% = 150M → Tạo HĐ ngay
Milestone 2: "Hoàn thành triển khai" → 30% = 150M → Tạo HĐ khi bàn giao
Milestone 3: "Nghiệm thu"            → 40% = 200M → Tạo HĐ sau nghiệm thu

AI tự động:
  - Nhắc tạo hóa đơn khi milestone đến hạn
  - Nhắc kế toán follow-up khi quá hạn thanh toán
  - Update % thực hiện khi có invoice được tạo
```

---

## 7. Cảnh Báo & Nhắc Nhở Tự Động (AI)

### 7.1 Lịch Cảnh Báo

| Thời điểm | Cảnh báo | Gửi đến |
|-----------|----------|---------|
| T-60 ngày | HĐ sắp hết hạn (lần 1) | Người phụ trách |
| T-30 ngày | HĐ sắp hết hạn (lần 2) | Người phụ trách + Trưởng phòng |
| T-15 ngày | HĐ sắp hết hạn (lần 3) + đề xuất gia hạn | Trưởng phòng + GĐ |
| T-7 ngày | Cảnh báo khẩn | GĐ + CFO |
| T=0 | HĐ hết hạn, chuyển EXPIRED | Tất cả |
| +7 ngày | Nhắc thanh lý / gia hạn chính thức | CEO |

### 7.2 Nhắc Milestone Thanh Toán

```
Cron job hàng ngày 8:00:

FOR EACH active contract milestone:
  IF milestone.due_date - TODAY <= 7 ngày AND milestone.invoice_id IS NULL:
    → Alert: "Sắp đến hạn tạo HĐ đợt [N]: [Tạo ngay]"

  IF milestone.due_date < TODAY AND milestone.paid = FALSE:
    → Alert AR: "Quá hạn thanh toán đợt [N] — [Nhắc KH]"
    → Tự gửi email nhắc nợ cho khách hàng (nếu cấu hình)
```

### 7.3 Cảnh Báo Rủi Ro AI

```
NẾU [HĐ lao động hết hạn trong 30 ngày]:
  → Nhắc HR: Cần tái ký hoặc chấm dứt HĐ
  → Draft thông báo cho nhân viên

NẾU [Đối tác chưa ký sau 5 ngày gửi link]:
  → Nhắc người phụ trách follow-up
  → Sau 10 ngày không phản hồi → Alert GĐ bộ phận

NẾU [Tổng giá trị HĐ bán với 1 KH > 30% doanh thu]:
  → Alert CFO: "Rủi ro tập trung khách hàng cao"

NẾU [HĐ có điều khoản phạt vi phạm và đang trễ milestone]:
  → Alert: "Nguy cơ bị phạt HĐ — xem điều khoản [X]"
```

---

## 8. Tích Hợp Với Các Phân Hệ

### 8.1 Sơ Đồ Tích Hợp

```
                    HỢP ĐỒNG (Module 12)
                           │
          ┌────────────────┼─────────────────┐
          │                │                 │
          ▼                ▼                 ▼
    BÁN HÀNG (06)    MUA HÀNG (PO)     NHÂN SỰ (08)
    Sales Order      Purchase Order    Employee Record
          │                │                 │
          ▼                ▼                 ▼
    HÓA ĐƠN (02)    HÓA ĐƠN (02)     LƯƠNG (08)
    Invoice Out      Invoice In        Payroll
          │                │
          ▼                ▼
      AR (03)          AP (04)
          │                │
          └────────┬───────┘
                   ▼
              GL (01) — Kế toán tổng hợp
                   │
                   ▼
         TÀI SẢN CỐ ĐỊNH (09)  ← HĐ thuê / HĐ mua TSCĐ
```

### 8.2 Trigger Tự Động Sau Khi HĐ Có Hiệu Lực

```typescript
// Sau khi contract.status → ACTIVE:

switch (contract.type) {
  case 'SALE':
    // Tạo Sales Order tự động
    salesOrders.create({
      contractId: contract.id,
      customerId: contract.partnerId,
      totalAmount: contract.value,
      milestones: contract.paymentSchedule
    })
    break

  case 'PURCHASE':
    // Tạo Purchase Order tự động
    purchaseOrders.create({
      contractId: contract.id,
      vendorId: contract.partnerId,
      totalAmount: contract.value
    })
    break

  case 'EMPLOYMENT':
    // Cập nhật hợp đồng lao động cho nhân viên
    employees.updateContract({
      employeeId: contract.linkedEmployeeId,
      contractType: contract.employmentType,  // FULL_TIME, PART_TIME...
      startDate: contract.startDate,
      endDate: contract.endDate,
      salary: contract.monthlySalary
    })
    break

  case 'LEASE':
    // Tạo lịch thanh toán tiền thuê định kỳ
    recurringPayments.create({
      contractId: contract.id,
      amount: contract.monthlyRent,
      frequency: 'MONTHLY',
      startDate: contract.startDate,
      endDate: contract.endDate
    })
    break
}
```

---

## 9. Lưu Trữ & Bảo Mật

### 9.1 Lưu Trữ File

```
MinIO (on-premise):
  /contracts/
    /{companyId}/
      /{year}/
        /{contractId}/
          contract_v1.docx         ← Bản nháp ban đầu
          contract_v2.docx         ← Sau khi review
          contract_final.pdf        ← PDF chốt gửi ký
          contract_signed.pdf       ← PDF có chữ ký điện tử
          audit_trail.pdf           ← Chứng chỉ audit trail
          attachments/              ← Tài liệu đính kèm
            phu_luc_A.pdf
            bang_bao_gia.xlsx
```

### 9.2 Audit Trail

Mỗi hợp đồng lưu đầy đủ lịch sử:

| Thời điểm | Hành động | Người thực hiện | IP | Chi tiết |
|-----------|-----------|-----------------|-----|---------|
| 01/05 09:15 | Tạo HĐ | Nguyễn Văn A | 1.2.3.4 | Từ template SALE-001 |
| 01/05 10:30 | Sửa điều khoản 5.2 | Nguyễn Văn A | 1.2.3.4 | — |
| 02/05 08:00 | Gửi review | Nguyễn Văn A | 1.2.3.4 | Gửi cho Trưởng phòng KD |
| 02/05 14:30 | Approve | Trần Thị B (TP KD) | 5.6.7.8 | — |
| 03/05 09:00 | Approve | Lê Văn C (CFO) | 9.10.11.12 | — |
| 03/05 09:05 | Gửi ký | Hệ thống | — | Gửi email đến 2 bên |
| 04/05 11:20 | Ký | Nguyễn Văn A (Bên A) | 1.2.3.4 | OTP SMS |
| 05/05 15:45 | Ký | Phạm Thị D (Bên B) | 20.21.22.23 | Chứng thư số |
| 05/05 15:45 | Có hiệu lực | Hệ thống | — | Tự động → ACTIVE |

### 9.3 Bảo Mật Phân Quyền

```
Xem danh sách HĐ:    Tất cả roles (chỉ HĐ liên quan đến bộ phận mình)
Xem nội dung HĐ:     Người phụ trách + Cấp trên + CFO + CEO
Tạo HĐ:              SALES, ACCOUNTANT, HR (tùy loại)
Duyệt HĐ:            Theo ma trận phân quyền (Bảng 3.1)
Ký HĐ:               Người được chỉ định (không cần tài khoản)
Xóa HĐ:              CHIEF_ACCOUNTANT+ (chỉ khi DRAFT)
Export HĐ:           Người phụ trách + CFO + CEO
```

---

## 10. AI Workflow Tự Động — Chi Tiết

### 10.1 AI Đọc & Trích Xuất Thông Tin HĐ

Khi upload file HĐ scan/Word:

```
AI phân tích nội dung hợp đồng:
  → Trích xuất tự động:
     - Số hợp đồng, ngày ký
     - Tên + MST các bên
     - Giá trị hợp đồng
     - Ngày bắt đầu, kết thúc
     - Điều khoản thanh toán (milestone)
     - Điều khoản phạt vi phạm
     - Điều khoản gia hạn

  → Điền form VietKeto tự động
  → Highlight các điều khoản rủi ro (màu vàng)
  → Flag nếu thiếu thông tin pháp lý bắt buộc

Người dùng review + confirm → Lưu vào hệ thống
```

### 10.2 AI Kiểm Tra Nội Dung HĐ

```
NẾU [HĐ không có điều khoản giải quyết tranh chấp]:
  → Cảnh báo: "Thiếu Điều X: Giải quyết tranh chấp"

NẾU [Thời hạn thanh toán > 90 ngày]:
  → Cảnh báo CFO: "Điều kiện thanh toán bất lợi"

NẾU [Giá trị HĐ thấp hơn 20% so với báo giá gốc]:
  → Cảnh báo GĐ KD: "Giá trị HĐ thấp hơn báo giá đáng kể"

NẾU [Điều khoản phạt > 10% giá trị HĐ]:
  → Flag: "Điều khoản phạt cao — cần CFO review"

NẾU [HĐ lao động không có điều khoản bảo mật]:
  → Gợi ý: "Nên bổ sung điều khoản NDA"
```

### 10.3 Tích Hợp Company AI System

```
company-ai-system/                    VietKeto Contract Module
─────────────────                     ────────────────────────
giam-doc-kinh-doanh.skill.md
  NẾU [deal > 200M]:
    → AI tạo HĐ draft từ template  → contracts.createFromTemplate()
    → Gửi review GĐ KD + CFO       → contracts.submitForReview()
    → Theo dõi tiến độ ký           → contracts.getSigningStatus()

giam-doc-tai-chinh.skill.md
  Hàng ngày 8:00:
    → Check HĐ sắp hết hạn          → contracts.getExpiringList()
    → Check milestone quá hạn TT    → contracts.getOverdueMilestones()
    → Gửi alert CEO nếu cần         → notifications.send()

ke-toan-truong.skill.md
  Khi HĐ → ACTIVE:
    → Check có HĐ liên kết chưa     → invoices.getByContractId()
    → Nhắc tạo HĐ đúng hạn          → notifications.remind()

giam-doc-nhan-su.skill.md
  Hàng tuần:
    → Check HĐ lao động sắp hết hạn → contracts.getExpiringByType('EMPLOYMENT')
    → Chuẩn bị draft HĐ mới         → contracts.createRenewal()
    → Trình GĐ NS duyệt             → approvals.request()

chu-tich-hdqt.skill.md
  Dashboard hàng tháng:
    → Tổng giá trị HĐ đang hiệu lực → contracts.getPortfolioSummary()
    → HĐ chiến lược cần phê duyệt   → contracts.getPendingByValue(1_000_000_000)
```

---

## 11. Màn Hình Chính (UI Wireframe)

### 11.1 Trang Tạo Hợp Đồng

```
┌─────────────────────────────────────────────────────────────┐
│  TẠO HỢP ĐỒNG MỚI                              [Lưu nháp]  │
├─────────────────────────────────────────────────────────────┤
│  Chọn template:  [SALE-001 ▼]  hoặc  [Tạo từ đầu]          │
├──────────────────────────┬──────────────────────────────────┤
│  BÊN A (Công ty bạn)     │  BÊN B (Đối tác)                 │
│  Tên: VietKeto Co., Ltd  │  Tên: [_____________]            │
│  MST: 0123456789         │  MST: [_____________]            │
│  ĐC:  [Tự điền]          │  ĐC:  [_____________]            │
│  Đại diện: [_______]     │  Đại diện: [_______]             │
├──────────────────────────┴──────────────────────────────────┤
│  THÔNG TIN HỢP ĐỒNG                                         │
│  Số HĐ: [BH-2025-XXX] (tự động)  Ngày: [__/__/____]        │
│  Loại: [Bán hàng ▼]  Giá trị: [__________] VND              │
│  Từ: [__/__/____]  Đến: [__/__/____]                        │
├─────────────────────────────────────────────────────────────┤
│  NỘI DUNG HỢP ĐỒNG                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [Rich text editor — soạn thảo HĐ]                  │   │
│  │                                                      │   │
│  │  Điều 1: Đối tượng hợp đồng                         │   │
│  │  Điều 2: Giá trị và phương thức thanh toán           │   │
│  │  ...                                                 │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  LỊCH THANH TOÁN                              [+ Thêm đợt]  │
│  Đợt 1: 30% — 150,000,000đ — Khi ký HĐ      [Sửa] [Xóa]   │
│  Đợt 2: 70% — 350,000,000đ — Sau bàn giao   [Sửa] [Xóa]   │
├─────────────────────────────────────────────────────────────┤
│  TÀI LIỆU ĐÍNH KÈM                           [+ Upload]     │
│  📎 bang_bao_gia.xlsx                         [Xóa]         │
├─────────────────────────────────────────────────────────────┤
│  NGƯỜI KÝ                                     [+ Thêm bên]  │
│  Bên A: Nguyễn Văn CEO — CEO — OTP/Cert       [Sửa]        │
│  Bên B: [Nhập tên + email + SĐT]              [Sửa]        │
├─────────────────────────────────────────────────────────────┤
│              [Hủy]    [Lưu nháp]    [Gửi để duyệt →]       │
└─────────────────────────────────────────────────────────────┘
```

### 11.2 Màn Hình Ký Điện Tử (Cho đối tác — không cần login)

```
┌─────────────────────────────────────────────────────────────┐
│  🔒 VietKeto eSign                                           │
│  Bạn được mời ký HĐ: "HĐ cung cấp dịch vụ số BH-2025-001" │
├─────────────────────────────────────────────────────────────┤
│  Xác minh danh tính:                                        │
│  ✉️ Mã OTP đã gửi đến: ph***g@gmail.com  [____] [Gửi lại]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [PDF Viewer — Hiển thị toàn bộ hợp đồng]                  │
│                                                             │
│  Trang 1/8 ▼                                               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  □ Tôi đã đọc và hiểu toàn bộ nội dung hợp đồng            │
│  □ Tôi đồng ý ký kết hợp đồng này                          │
│                                                             │
│  Chữ ký của tôi:                                           │
│  ┌──────────────────────────────┐                          │
│  │  [Vẽ chữ ký tại đây]        │  hoặc  [Upload ảnh ký]   │
│  └──────────────────────────────┘                          │
│                                                             │
│              [Từ chối]         [✅ Xác nhận ký]            │
└─────────────────────────────────────────────────────────────┘
```

---

## 12. Báo Cáo Hợp Đồng

| Báo cáo | Mô tả | Dùng cho |
|---------|-------|---------|
| Danh mục HĐ hiệu lực | Toàn bộ HĐ đang active | CFO, CEO |
| HĐ sắp hết hạn | Filter 30/60/90 ngày | GĐ bộ phận |
| Giá trị HĐ bán theo KH | Doanh thu theo HĐ | GĐ KD |
| Milestone quá hạn | Đợt TT chưa xuất HĐ | KTT |
| HĐ lao động sắp hết | Nhân viên cần tái ký | HR |
| Phân tích rủi ro HĐ | Điều khoản phạt, tập trung KH | CFO |
