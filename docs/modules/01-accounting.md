# Group 1: Kế Toán — Accounting Modules

> **7 modules** — Có thể deploy từng module theo thứ tự.  
> Tất cả đều cần Foundation (Group 0).  
> GL là nền tảng kế toán — Invoice, AR, AP, Cash, Tax, Assets đều cần GL.

---

## Dependency Tree (Nhóm Kế Toán)

```
GL (01)
 ├── Invoice (02)   ← cần GL để tạo bút toán tự động
 ├── AR (03)        ← cần GL, cần Invoice (lấy dữ liệu phải thu)
 ├── AP (04)        ← cần GL
 ├── Cash (05)      ← cần GL, tích hợp AR+AP nếu có
 ├── Tax (06)       ← cần GL, cần Invoice
 └── Assets (07)    ← cần GL
```

**Thứ tự deploy tối thiểu:**
1. GL (bắt buộc trước)
2. Invoice (nếu cần HĐ điện tử)
3. AR / AP / Cash (song song được)
4. Tax (cần GL + Invoice đã có data)
5. Assets (độc lập, chỉ cần GL)

---

## Module 01: Kế Toán Tổng Hợp (GL — General Ledger)

### Mô Tả
Trung tâm của toàn bộ hệ thống kế toán. Mọi giao dịch tài chính từ tất cả modules đều phản ánh về đây dưới dạng bút toán kép (Nợ = Có tại mọi thời điểm).

### Chức Năng

**Hệ thống tài khoản (Chart of Accounts):**
- Seed sẵn ~300 tài khoản theo TT200/2014/TT-BTC (3 cấp: 3→4→5 chữ số)
- Thêm tài khoản chi tiết cấp 4, 5 tuỳ doanh nghiệp
- Chỉ tài khoản lá (leaf) mới nhập được bút toán
- Khoá tài khoản không còn sử dụng

**Bút toán (Journal Entries):**
- Hỗ trợ nhật ký chung + 4 nhật ký đặc biệt (thu/chi tiền, mua/bán hàng)
- Tự động đánh số: `BT2026-001`, `BT2026-002`...
- Quy trình duyệt 2 bước: Nháp → Chờ duyệt → Ghi sổ
- Đảo ngược bút toán (reverse entry) 1 click
- Nhập hàng loạt từ Excel
- Validation: tổng Nợ = tổng Có trước khi lưu

**Kỳ kế toán:**
- Mở/đóng kỳ theo tháng/quý/năm
- Không cho sửa bút toán đã ghi sổ trong kỳ đóng
- Kết chuyển cuối kỳ tự động (TK 5xx/6xx/7xx/8xx → 911 → 421)

**Sổ cái & Báo cáo GL:**
- Sổ chi tiết từng tài khoản
- Bảng cân đối số phát sinh (CĐSPS)
- Bảng cân đối kế toán B01-DN
- Kết quả hoạt động kinh doanh B02-DN
- Lưu chuyển tiền tệ B03-DN
- Thuyết minh BCTC B09-DN

### Entities

```
FiscalYear    { id, company_id, year, status: open|closed }
FiscalPeriod  { id, fiscal_year_id, month, status: open|closed }
Account       { id, company_id, code, name, type, level, parent_id, is_active }
Journal       { id, company_id, code, name, type: general|cash_receipt|... }
JournalEntry  { id, company_id, journal_id, number, date, description,
                status: draft|pending|posted, period_id, created_by, posted_by }
JournalLine   { id, entry_id, account_id, debit, credit, description, ref_type, ref_id }
```

### API

```
GET    /api/gl/accounts
POST   /api/gl/accounts
GET    /api/gl/journals
POST   /api/gl/journals/entries
GET    /api/gl/journals/entries/:id
PUT    /api/gl/journals/entries/:id
POST   /api/gl/journals/entries/:id/submit   → Nộp duyệt
POST   /api/gl/journals/entries/:id/post     → Ghi sổ (KTT)
POST   /api/gl/journals/entries/:id/reverse  → Đảo ngược
GET    /api/gl/reports/trial-balance         → CĐSPS
GET    /api/gl/reports/ledger/:account_id    → Sổ chi tiết TK
GET    /api/gl/reports/balance-sheet         → B01-DN
GET    /api/gl/reports/income-statement      → B02-DN
```

### Events Phát Ra

```
gl.journal_entry.posted   → { entry_id, total_debit, period }
gl.period.closed          → { period_id, year, month }
gl.account.created        → { account_id, code, name }
```

### Phụ Thuộc Vào
- Foundation: Auth, Audit, Notifications

### Cung Cấp Cho
- **Invoice**: account_id để chọn TK hạch toán
- **AR/AP/Cash**: tạo bút toán tự động
- **Tax**: số liệu TK thuế (3331, 3334...)
- **Assets**: TK khấu hao (214, 6274)
- **Reports**: toàn bộ số liệu BCTC

### Standalone: ✅ Có thể dùng độc lập như phần mềm kế toán cơ bản

---

## Module 02: Hóa Đơn Điện Tử

### Mô Tả
Quản lý toàn bộ hóa đơn điện tử theo TT78/2021. Giai đoạn 1: quản lý nội bộ + PDF. Giai đoạn 2: kết nối TCT eTax (xem Group 7 — Reports & Integration).

### Chức Năng

**Hóa đơn đầu ra (Xuất):**
- Tạo HĐ từ đơn hàng (Sales module) hoặc trực tiếp
- Template HĐ theo mẫu số (01GTKT, 02GTKT...)
- Validation: MST khách hàng, format số tiền, VAT rate
- Xác nhận HĐ → tự động tạo bút toán GL
- Xuất PDF, gửi email khách hàng tự động
- Hủy HĐ (tạo HĐ điều chỉnh/thay thế)
- Đánh số liên tục theo ký hiệu HĐ

**Bút toán tự động khi xác nhận HĐ bán:**
```
Nợ 1311 (Phải thu KH)     = Tổng tiền
  Có 511x (Doanh thu)     = Tiền hàng
  Có 3331 (VAT phải nộp)  = Tiền VAT
```

**Hóa đơn đầu vào (Mua):**
- Nhập thủ công hoặc import từ file XML
- Sau Phase 6: tự động kéo từ TCT
- Match với PO (nếu Procurement module bật)
- Tạo bút toán GL khi duyệt
- Theo dõi trạng thái thanh toán

**Sổ HĐ:**
- Sổ HĐ đầu ra (để khai thuế)
- Sổ HĐ đầu vào (để khấu trừ thuế)

### Entities

```
Invoice {
  id, company_id, type: outgoing|incoming,
  number, serial, template_code, date,
  customer_id (outgoing) | vendor_id (incoming),
  subtotal, vat_amount, total,
  status: draft|confirmed|sent|cancelled,
  journal_entry_id, tct_status, tct_code
}
InvoiceItem { id, invoice_id, description, quantity, unit_price, vat_rate, amount }
InvoiceFile { id, invoice_id, file_type: pdf|xml|signed_xml, file_id }
```

### Events Phát Ra

```
invoice.outgoing.confirmed  → GL tạo bút toán, AR tạo phải thu
invoice.outgoing.cancelled  → GL đảo ngược bút toán, AR cập nhật
invoice.incoming.approved   → GL tạo bút toán, AP tạo phải trả
invoice.payment.matched     → AR/AP đánh dấu đã thanh toán
```

### Phụ Thuộc Vào
- Foundation
- **GL** (bắt buộc): tạo bút toán khi confirm HĐ
- **Sales** (tuỳ chọn): tạo HĐ từ đơn hàng
- **Procurement** (tuỳ chọn): tạo HĐ từ PO

### Cung Cấp Cho
- **AR**: dữ liệu phải thu (HĐ đầu ra chưa thanh toán)
- **AP**: dữ liệu phải trả (HĐ đầu vào chưa thanh toán)
- **Tax**: danh sách HĐ cho bảng kê 01-1/GTGT, 01-2/GTGT

### Standalone: ✅ Bật được nếu GL đã có. Có thể dùng như phần mềm HĐ điện tử độc lập.

---

## Module 03: Phải Thu (AR — Accounts Receivable)

### Mô Tả
Theo dõi toàn bộ công nợ khách hàng phải thu. Biết chính xác ai nợ bao nhiêu, từ HĐ nào, bao lâu rồi.

### Chức Năng

- **Danh mục khách hàng** — Hồ sơ KH (tên, MST, địa chỉ, điều khoản TT)
- **Tạo phải thu** — Từ HĐ đầu ra confirm, hoặc nhập thủ công
- **Ghi nhận thanh toán** — Nhận tiền từ KH, match với HĐ, tạo bút toán GL
- **Đối chiếu** — Gửi thư xác nhận công nợ cho KH
- **Aging report** — Công nợ 0-30, 31-60, 61-90, >90 ngày
- **Nhắc nợ tự động** — Email/SMS khi quá hạn X ngày (configurable)
- **Tỉ giá** — Hỗ trợ phải thu ngoại tệ, đánh giá lại cuối kỳ

### Entities

```
Customer { id, company_id, name, tax_code, address, payment_term_days, credit_limit }
Receivable { id, company_id, customer_id, invoice_id, amount, currency,
             due_date, status: open|partial|paid, paid_amount }
ARPayment { id, receivable_id, amount, payment_date, method, bank_account_id,
            journal_entry_id }
```

### Bút toán khi nhận thanh toán

```
Nợ 111x/112x (Tiền mặt/Ngân hàng)  = Số tiền nhận
  Có 131x (Phải thu KH)             = Số tiền nhận
```

### Phụ Thuộc Vào
- Foundation
- **GL** (bắt buộc): tạo bút toán thanh toán
- **Invoice** (tuỳ chọn): tự động tạo phải thu khi HĐ confirm

### Cung Cấp Cho
- **Cash**: số dư phải thu để forecast cash flow
- **Reports**: báo cáo công nợ phải thu
- **Visibility**: KPI "overdue receivables"

### Standalone: ✅ Nếu không có Invoice, nhập phải thu thủ công.

---

## Module 04: Phải Trả (AP — Accounts Payable)

### Mô Tả
Đối xứng với AR — quản lý công nợ nhà cung cấp phải trả.

### Chức Năng

- **Danh mục nhà cung cấp** — Hồ sơ NCC, điều khoản thanh toán
- **Tạo phải trả** — Từ HĐ đầu vào, hoặc từ PO (Procurement module)
- **3-way matching** — PO ↔ Nhận hàng ↔ HĐ đầu vào (nếu có Procurement)
- **Lịch thanh toán** — Xem các khoản đến hạn trong 7/14/30 ngày tới
- **Ghi nhận thanh toán** — Xuất tiền cho NCC, tạo bút toán GL
- **Aging report** — Phải trả 0-30, 31-60, 61-90, >90 ngày
- **Cash requirement forecast** — Bao nhiêu tiền cần để trả trong N ngày

### Entities

```
Vendor { id, company_id, name, tax_code, bank_account, payment_term_days }
Payable { id, company_id, vendor_id, invoice_id, po_id, amount, currency,
          due_date, status: open|partial|paid, paid_amount }
APPayment { id, payable_id, amount, payment_date, method, bank_account_id,
            journal_entry_id, approved_by }
```

### Bút toán khi thanh toán

```
Nợ 331x (Phải trả NCC)             = Số tiền trả
  Có 111x/112x (Tiền mặt/Ngân hàng)= Số tiền trả
```

### Phụ Thuộc Vào
- Foundation
- **GL** (bắt buộc)
- **Invoice** (tuỳ chọn): tự động từ HĐ đầu vào
- **Procurement** (tuỳ chọn): 3-way matching

### Cung Cấp Cho
- **Cash**: outflow forecast
- **Procurement**: trạng thái thanh toán PO
- **Reports**: báo cáo công nợ phải trả

### Standalone: ✅ Dùng độc lập nhập phải trả thủ công.

---

## Module 05: Ngân Quỹ (Cash Management)

### Mô Tả
Quản lý toàn bộ tiền mặt và tài khoản ngân hàng. Biết real-time số dư, dự báo dòng tiền.

### Chức Năng

**Quỹ tiền mặt:**
- Nhiều quỹ (quỹ chính, quỹ phụ, quỹ ngoại tệ)
- Phiếu thu/chi tiền mặt
- Kiểm quỹ định kỳ, phát hiện chênh lệch

**Tài khoản ngân hàng:**
- Nhiều tài khoản ngân hàng (VND + ngoại tệ)
- Import sao kê ngân hàng (Excel, CSV, OFX)
- Auto-match giao dịch sao kê với bút toán GL
- Xử lý giao dịch chưa match thủ công

**Dự báo dòng tiền (Cash Flow Forecast):**
- Inflow: từ AR (phải thu sắp đến hạn) + doanh thu dự kiến (Sales)
- Outflow: từ AP (phải trả sắp đến hạn) + chi phí định kỳ
- Dashboard 7/14/30/90 ngày
- Alert khi số dư dự báo âm

**Kiểm soát:**
- Hạn mức chi tiền mặt (phải approve khi vượt)
- Workflow phê duyệt thanh toán

### Entities

```
Fund { id, company_id, name, currency, account_id, balance }
BankAccount { id, company_id, bank_name, account_number, currency, gl_account_id, balance }
BankStatement { id, bank_account_id, period_start, period_end, opening_balance, closing_balance }
BankTransaction { id, statement_id, date, description, debit, credit, reference,
                  status: unmatched|matched|ignored, journal_entry_id }
CashFlowForecast { id, company_id, date, inflow, outflow, net, cumulative, source }
```

### Events Phát Ra

```
cash.balance.low          → Alert CFO/kế toán khi số dư < ngưỡng
cash.payment.processed    → AR/AP cập nhật trạng thái
cash.statement.imported   → Trigger reconciliation job
```

### Phụ Thuộc Vào
- Foundation
- **GL** (bắt buộc): bút toán thu/chi tiền
- **AR** (tuỳ chọn): inflow forecast từ phải thu
- **AP** (tuỳ chọn): outflow forecast từ phải trả

### Cung Cấp Cho
- **Reports**: cash flow statement B03-DN
- **Visibility**: KPI "current cash position", "cash runway"
- **AI**: dữ liệu để CFO Agent phân tích dòng tiền

### Standalone: ✅ Quản lý quỹ + bank độc lập, bỏ forecast nếu thiếu AR/AP.

---

## Module 06: Khai Báo Thuế

### Mô Tả
Tính toán và chuẩn bị tờ khai thuế định kỳ. Giai đoạn 1: nội bộ. Giai đoạn 2: nộp trực tiếp qua TCT eTax.

### Chức Năng

**Thuế GTGT (VAT):**
- Tổng hợp HĐ đầu ra (01-1/GTGT) và đầu vào (01-2/GTGT)
- Tính thuế phải nộp = thuế đầu ra - thuế đầu vào
- Tờ khai 01/GTGT hàng tháng/quý
- Carry forward thuế được khấu trừ kỳ trước

**Thuế TNDN (CIT):**
- Tổng hợp doanh thu, chi phí từ GL
- Phân tích chi phí được trừ / không được trừ
- Tạm tính thuế TNDN hàng quý
- Quyết toán năm

**Thuế TNCN (PIT):**
- Lấy data từ HR module (lương, thưởng, phụ cấp)
- Tính khấu trừ tháng cho từng nhân viên
- Quyết toán năm (MST cá nhân)
- Uỷ quyền quyết toán qua công ty

**Export:**
- Tờ khai dạng PDF (nộp tay)
- Tờ khai dạng XML (nộp online TCT — Phase 6)

### Entities

```
TaxPeriod { id, company_id, tax_type: vat|cit|pit, year, period, status: open|submitted|paid }
VATDeclaration { id, period_id, output_tax, input_tax, net_tax, carryforward, xml_content }
CITDeclaration { id, period_id, revenue, deductible_expenses, taxable_income, tax_amount }
PITRecord { id, period_id, employee_id, gross_salary, deductions, taxable_income, tax_withheld }
```

### Phụ Thuộc Vào
- Foundation
- **GL** (bắt buộc): số liệu tài khoản thuế (3331, 3334, 3335)
- **Invoice** (bắt buộc): danh sách HĐ cho bảng kê GTGT
- **HR** (cho PIT): dữ liệu lương, phụ cấp

### Cung Cấp Cho
- **Reports**: mục thuế trong báo cáo tài chính
- **Visibility**: KPI "tax liability", alert deadline khai thuế

### Standalone: ✅ Nếu GL + Invoice đã có, Tax chạy độc lập tốt.

---

## Module 07: Tài Sản Cố Định (Fixed Assets)

### Mô Tả
Quản lý vòng đời tài sản cố định: mua → sử dụng → khấu hao → thanh lý. Tuân thủ TT45/2013.

### Chức Năng

- **Hồ sơ TSCĐ** — Tên, mã, loại (hữu hình/vô hình), nguyên giá, ngày mua, bộ phận sử dụng
- **Khấu hao tự động** — Tính khấu hao hàng tháng theo phương pháp đường thẳng (TT45)
- **Bút toán khấu hao** — Tự động tạo bút toán cuối kỳ:
  ```
  Nợ 6274 (Chi phí khấu hao) = Số khấu hao tháng
    Có 2141 (Hao mòn TSCĐ)   = Số khấu hao tháng
  ```
- **Điều chuyển** — TSCĐ từ bộ phận này sang bộ phận khác
- **Thanh lý / Nhượng bán** — Ghi nhận thu thanh lý, xử lý giá trị còn lại
- **Kiểm kê TSCĐ** — In biên bản kiểm kê, so sánh với sổ sách
- **Báo cáo** — Bảng tính khấu hao, danh sách TSCĐ theo bộ phận

### Entities

```
FixedAsset {
  id, company_id, code, name, category, original_cost, acquisition_date,
  useful_life_months, residual_value, depreciation_method,
  department_id, status: active|disposed, gl_account_id
}
DepreciationSchedule { id, asset_id, period_id, depreciation_amount, accumulated, book_value, journal_entry_id }
AssetDisposal { id, asset_id, disposal_date, disposal_value, gain_loss, journal_entry_id }
```

### Phụ Thuộc Vào
- Foundation
- **GL** (bắt buộc): bút toán mua, khấu hao, thanh lý

### Cung Cấp Cho
- **Reports**: giá trị TSCĐ trong bảng cân đối kế toán
- **Tax**: chi phí khấu hao được tính vào thuế TNDN

### Standalone: ✅ Chạy độc lập nếu GL đã có.
