# Kế hoạch Seed Dữ Liệu & Kiểm Thử Chức Năng

> Phiên bản: 2026-06-08 · Branch: feat/sme-modules → test
> Mục tiêu: có bộ dữ liệu mẫu đủ thực, sau đó kiểm thử từng luồng nghiệp vụ theo thứ tự
> phụ thuộc (master data trước → giao dịch → tổng hợp báo cáo).
>
> DB hiện tại (demo): users 25 · work_items 35 · gl_accounts 172 — còn lại = 0.

---

## I. NGUYÊN TẮC SEED

| # | Nguyên tắc |
|---|---|
| 1 | **Seed theo thứ tự phụ thuộc** — master data → giao dịch → bảng tổng hợp. |
| 2 | **Dùng API thật** (`curl / script) — không INSERT trực tiếp vào DB (phát hiện lỗi validation, trigger, business logic). |
| 3 | **Một script, nhiều lần chạy an toàn** — idempotent: nếu đã tồn tại thì bỏ qua (dùng `ON CONFLICT DO NOTHING` hoặc check trước). |
| 4 | **Dữ liệu có tính liên kết** — đơn hàng → công nợ → thanh toán → dòng tiền → bút toán; HĐ → nhân sự → lương → thuế. |
| 5 | **Mỗi module cần ≥ 3 bản ghi** — đủ để test phân trang, filter, tổng hợp báo cáo. |

---

## II. THỨ TỰ SEED & DỮ LIỆU CẦN CÓ

### Nhóm 0 — Master data (không phụ thuộc giao dịch)

| # | Module | Bảng | Dữ liệu cần seed | Trạng thái |
|---|---|---|---|---|
| 0.1 | **Nhân sự** | `departments` | Kế toán, Kinh doanh, Kỹ thuật, Hành chính | [ ] |
| 0.2 | **Nhân sự** | `positions` | Kế toán trưởng, NV kinh doanh, Dev, Thư ký (map defaultRoleId) | [ ] |
| 0.3 | **Nhân sự** | `employees` | ≥ 5 nhân viên (1/phòng ban, đủ lương+BH, status=active) | [ ] |
| 0.4 | **Đối tác** | `partners` | ≥ 3 khách hàng (type=customer) + ≥ 3 nhà cung cấp (type=vendor) | [ ] |
| 0.5 | **Kho** | `products` | ≥ 5 sản phẩm (có unit, costPrice, salePrice, minStock) | [ ] |
| 0.6 | **Ngân quỹ** | `cash_accounts` | ≥ 2 tài khoản (Tiền mặt, Ngân hàng VCB) | [ ] |
| 0.7 | **TSCĐ** | `assets` | ≥ 3 tài sản (máy tính, xe, máy móc — có nguyên giá, ngày mua, khấu hao) | [ ] |
| 0.8 | **Tài chính GL** | `fiscal_periods` | 2 kỳ: 2026-01 (closed) + 2026-06 (open) | [ ] |

### Nhóm 1 — Giao dịch nghiệp vụ (phụ thuộc master data nhóm 0)

| # | Module | Luồng seed | Bản ghi cần tạo |
|---|---|---|---|
| 1.1 | **Hợp đồng** | HĐ đầu ra (bán hàng) ×2 + HĐ đầu vào (mua) ×2 + HĐ lao động (linked employee) ×2 | 6 contracts |
| 1.2 | **Bán hàng** | Đơn hàng confirmed + delivered + invoiced (3 trạng thái) | 3 sales_orders + lines |
| 1.3 | **Chi phí** | Chi phí văn phòng, mua hàng, vận chuyển (mix có/không hóa đơn, GTGT 8/10%) | 5 expenses |
| 1.4 | **Ngân quỹ** | Phiếu thu (từ KH) ×3 + Phiếu chi (trả NCC, lương ứng) ×3 | 6 cash_transactions |
| 1.5 | **Công nợ** | AR (phải thu) ×2 linked contract + AP (phải trả) ×2 linked expense | 4 debts |
| 1.6 | **Nhân sự** | Tính lương tháng 2026-05 (cần employees đã có lương) | 1 payroll_period + items |
| 1.7 | **Thuế** | Tự tính GTGT tháng 2026-05 + TNDN Q1/2026 | 2 tax_returns |
| 1.8 | **GL** | Bút toán doanh thu, chi phí, lương (manual, journal KDBH + CPTC + CPLG) | ≥ 6 journal_entries |
| 1.9 | **Tồn kho** | Nhập kho ×2 + Xuất kho ×1 | 3 stock_movements |
| 1.10 | **Công việc** | Dự án + epic + sprint + việc con (đủ loại: cá nhân, dự án, định kỳ) | 1 project + 6 work_items |

### Nhóm 2 — Kiểm chứng báo cáo (cần nhóm 0+1 đủ)

| # | Module | Báo cáo cần có số liệu |
|---|---|---|
| 2.1 | GL | CĐKT, KQKD, LCTT, CĐSPS — cân đối (balanced = true) |
| 2.2 | Reports | `/consolidated?period=2026-Q2` — khớp giao dịch đã seed |
| 2.3 | Reports | `/trend?year=2026` — có số tháng 5 + 6 |
| 2.4 | Thuế | Stats: thuế phải nộp + cảnh báo hạn |
| 2.5 | HR | Bảng lương tháng 5 — lương thực nhận = đúng theo lib/payroll.ts |

---

## III. LUỒNG KIỂM THỬ TỪNG MODULE

### M-01: Nhân sự (HR)

**Luồng thuận (happy path)**
1. `POST /hr/departments` → tạo phòng ban
2. `POST /hr/positions` → tạo vị trí (map role)
3. `POST /hr/employees` → tạo nhân viên (đủ lương/BH)
4. `GET /hr/employees` → phân trang + filter phòng ban/trạng thái
5. `POST /hr/employees/:id/provision-user` → cấp tài khoản (role theo vị trí)
6. `POST /hr/payroll` → tạo bảng lương kỳ (draft)
7. `POST /hr/payroll/:id/compute` → tính lương (verify BHXH + TNCN)
8. `POST /hr/payroll/:id/approve` → duyệt bảng lương
9. `GET /hr/payroll/:id/items` → xem chi tiết từng người

**Kiểm thử biên**
- [ ] Tạo NV thiếu lương → trả lỗi rõ ràng
- [ ] Cấp tài khoản cho NV đã nghỉ → 400
- [ ] roleId thuộc công ty khác → 400 (cross-tenant)
- [ ] Sửa bảng lương đã duyệt → 400
- [ ] Xóa bảng lương đã chi → 400

---

### M-02: Đối tác (Partners)

**Luồng thuận**
1. `POST /partners` → tạo KH + NCC
2. `GET /partners?type=customer` → lọc theo loại
3. `PUT /partners/:id` → cập nhật thông tin
4. `GET /partners/:id` → xem hồ sơ
5. `DELETE /partners/:id` → xóa mềm (kiểm tra không ảnh hưởng HĐ/công nợ)

**Kiểm thử biên**
- [ ] Trùng taxCode trong công ty → 409 (nếu có unique)
- [ ] Xóa partner đang có HĐ active → kiểm tra hành vi (onDelete SetNull)

---

### M-03: Hợp đồng (Contracts)

**Luồng thuận**
1. `POST /contracts` → tạo HĐ đầu ra (draft), auto sinh số HĐ
2. `POST /contracts/:id/submit` → submit review (draft → review)
3. `POST /contracts/:id/approve` → duyệt (reviewer ≠ submitter) → pending_signature/active
4. `POST /contracts/:id/schedules` → thêm lịch thanh toán
5. `POST /contracts/:id/pay` → thanh toán 1 đợt (remaining giảm)
6. `GET /contracts?direction=outbound` → lọc chiều
7. Kiểm tra số HĐ tiếp theo > 1000 (test MAX, không phải count)

**Kiểm thử biên**
- [ ] Cùng user submit + approve → 403 (self-approval chặn)
- [ ] partyId thuộc công ty khác → 400
- [ ] Pay vượt remaining → kiểm tra hành vi (sau khi fix clamp)
- [ ] Số HĐ khi xóa giữa chừng không lỗi → 409 retry

---

### M-04: Bán hàng (Sales + CSKH)

**Luồng thuận**
1. `POST /sales` → tạo đơn hàng (với lines)
2. `PATCH /sales/:id` → xác nhận (draft → confirmed)
3. `PATCH /sales/:id` → giao hàng (confirmed → delivered)
4. `POST /sales/interactions` → ghi chú chăm sóc KH
5. `GET /sales/stats` → kiểm tra tổng doanh thu
6. `GET /sales/interactions?customerId=` → lịch sử CSKH

**Kiểm thử biên**
- [ ] Tạo đơn hàng không có line → 400
- [ ] Hủy đơn đã giao → kiểm tra trạng thái cho phép

---

### M-05: Chi phí (Expenses)

**Luồng thuận**
1. `POST /expenses` → tạo chi phí (có/không hóa đơn, GTGT 10%)
2. `GET /expenses?period=2026-05` → lọc theo kỳ
3. `GET /expenses/stats` → tổng chi phí + chưa kê khai
4. `PATCH /expenses/:id` → cập nhật taxDeclared = true

**Kiểm thử biên**
- [ ] vatRate không hợp lệ (ngoài 0/5/8/10) → 400 (nếu có validate)

---

### M-06: Ngân quỹ (Cash)

**Luồng thuận**
1. `POST /cash/accounts` → tạo tài khoản
2. `POST /cash/transactions` → phiếu thu
3. `POST /cash/transactions` → phiếu chi
4. `GET /cash/stats` → số dư + thu/chi tháng
5. `GET /cash/transactions?accountId=` → sao kê tài khoản

**Kiểm thử biên**
- [ ] Chi vượt số dư → không chặn (SME thực tế: ghi nhận; kiểm tra behavior)
- [ ] accountId thuộc công ty khác → 404

---

### M-07: Công nợ (AR/AP)

**Luồng thuận**
1. `POST /debts` → tạo phải thu (AR)
2. `PATCH /debts/:id` → thanh toán một phần (paidAmount tăng, status → partial)
3. `PATCH /debts/:id` → thanh toán hết → status = paid
4. `GET /debts/stats?kind=receivable` → tổng outstanding + overdue
5. Tạo AP linked contract, sau đó trả nợ

**Kiểm thử biên**
- [ ] paidAmount > amount → 400 (clamp check)
- [ ] contractId thuộc công ty khác → 400

---

### M-08: Hàng tồn kho (Inventory)

**Luồng thuận**
1. `POST /inventory/products` → tạo sản phẩm
2. `POST /inventory/movements` → nhập kho (type=in)
3. `POST /inventory/movements` → xuất kho (type=out)
4. `GET /inventory/products` → kiểm tồn kho thực
5. `GET /inventory/stats` → giá trị tồn kho
6. `GET /inventory/alerts` → cảnh báo dưới minStock

**Kiểm thử biên**
- [ ] Xuất vượt tồn kho → kiểm tra hành vi (chặn hay ghi nhận tồn âm)

---

### M-09: Tài sản cố định (Assets)

**Luồng thuận**
1. `POST /assets` → tạo tài sản (có originalCost, usefulLife, purchaseDate)
2. `GET /assets` → danh sách + tổng NBV
3. `POST /assets/depreciation` → tính khấu hao kỳ (nếu có endpoint)
4. `GET /assets/stats` → totalNbv
5. Đăng ký góp vốn (`POST /assets/contributions`)

**Kiểm thử biên**
- [ ] usefulLife = 0 → 400
- [ ] purchaseDate trong tương lai → kiểm tra behavior

---

### M-10: Thuế (Tax)

**Luồng thuận**
1. `PUT /tax/settings` → cấu hình thuế (loại hình DN, ngành, PP khấu trừ)
2. `POST /tax/returns/compute` → tự tính GTGT tháng 2026-05 (cần expenses + contracts)
3. `POST /tax/returns/compute` → tự tính TNDN Q2/2026
4. `PATCH /tax/returns/:id` → đánh dấu "đã nộp tờ khai" + "đã nộp tiền"
5. `GET /tax/stats` → tổng phải nộp + cảnh báo hạn

**Kiểm thử biên**
- [ ] Tính kỳ đã có tờ khai → 409 (duplicate)
- [ ] period sai format → 400

---

### M-11: Kế toán tổng hợp (GL)

**Luồng thuận**
1. `POST /gl/entries` → tạo bút toán (Nợ=Có, 2 dòng)
2. `POST /gl/entries/:id/post` → ghi sổ (draft → posted)
3. `POST /gl/periods/:id/close` → đóng kỳ 2026-01 (không còn nháp/chờ)
4. `GET /gl/periods` → danh sách kỳ + trạng thái
5. `GET /gl/reports/financial?period=` → BCTC: CĐKT / KQKD / LCTT / CĐSPS
6. `POST /gl/entries/:id/reverse` → đảo bút toán
7. `POST /gl/periods/:id/reopen` → mở lại kỳ (nếu cần sửa)

**Kiểm thử biên**
- [ ] Bút toán Nợ ≠ Có → 400
- [ ] Đóng kỳ còn bút toán nháp → 409
- [ ] Ghi sổ trong kỳ đã đóng → 400
- [ ] Đảo bút toán đã đảo → kiểm tra (re-reverse chặn hay không)
- [ ] BCTC balanced = true sau seed

---

### M-12: Báo cáo hợp nhất (Reports — GĐ4)

**Luồng thuận**
1. `GET /reports/consolidated?period=2026-05` → đủ dữ liệu từ M-01→M-11
2. `GET /reports/consolidated?period=2026-Q2` → hợp nhất quý
3. `GET /reports/consolidated?period=2026` → cả năm
4. `GET /reports/trend?year=2026` → 12 tháng (T5 + T6 phải có số)
5. Kiểm tra `reconciliation.revenueDiff` — nếu đã seed bút toán trùng số liệu phân hệ thì `revenueDiff ≈ 0`

**Kiểm thử biên**
- [ ] period sai format → 400
- [ ] year ngoài 2000–2100 → 400

---

### M-13: Công việc & Dự án (Work)

**Luồng thuận**
1. Tạo project + sprint + epic
2. Tạo việc cá nhân (đúng hạn) → chuyển in_progress → completed
3. Tạo việc dự án → giao cho người khác → review → approve
4. `GET /work?tab=mine&sub=overdue` → việc quá hạn có số đếm đúng
5. `GET /work?tab=assigned&sub=done` → việc tôi giao đã xong
6. Tạo việc định kỳ cho role kế toán → xem trong tab "Định kỳ"
7. Gắn subtask → kiểm tra epicId/sprintId kế thừa

**Kiểm thử biên**
- [ ] completedAt reset khi reopen việc
- [ ] Subtask inherit epicId/sprintId từ parent
- [ ] Việc quá hạn: dueDate < now + status ≠ completed → xuất hiện tab "Quá hạn"

---

### M-14: Ghi chép (Notes)

**Luồng thuận**
1. Tạo note ngày hôm nay (có block text)
2. Tạo note ngày khác → xem danh sách bên trái
3. Tạo việc từ note (gán cho user)
4. Tìm kiếm note theo nội dung

**Kiểm thử biên**
- [ ] Danh sách hiển thị ngay cả khi trống (frame rỗng, không crash)

---

### M-15: Trợ lý AI (mỗi module)

| Module | Từ khóa kích hoạt | Kết quả mong đợi |
|---|---|---|
| Work | "tạo việc họp hàng tuần" | Tạo được việc định kỳ hoặc đề xuất luồng |
| HR | "tính lương tháng 6 nhân viên Nguyễn A" | Trả ra ước tính gross/net/thuế |
| Contracts | "soạn hợp đồng dịch vụ IT" | Draft template hợp đồng |
| Tax | "kê khai GTGT tháng 5" | Hướng dẫn hoặc trigger compute |
| Reports | "doanh thu quý 2 so với quý 1" | Gọi /consolidated cả 2 kỳ + so sánh |

---

## IV. SCRIPT SEED (thứ tự chạy)

> Script viết bằng bash/curl, lưu tại `scripts/seed/`. Token lấy từ cookie đăng nhập.
> Chạy: `bash scripts/seed/run-all.sh <TOKEN>`

```
scripts/seed/
  00-master-data/
    01-departments.sh
    02-positions.sh
    03-employees.sh
    04-partners.sh
    05-products.sh
    06-cash-accounts.sh
    07-assets.sh
    08-fiscal-periods.sh
  01-transactions/
    11-contracts.sh
    12-sales-orders.sh
    13-expenses.sh
    14-cash-transactions.sh
    15-debts.sh
    16-payroll.sh
    17-tax-returns.sh
    18-journal-entries.sh
    19-stock-movements.sh
  02-verify/
    verify-gl-balanced.sh        # curl /reports/financial → assert balanced=true
    verify-consolidated.sh       # curl /reports/consolidated?period=2026-05
    verify-payroll.sh            # curl /hr/payroll/:id/items → assert net > 0
run-all.sh
```

---

## V. CHECKLIST KIỂM THỬ TỔNG THỂ

| # | Hạng mục | Phụ thuộc seed | [ ] |
|---|---|---|---|
| T-01 | Seed nhóm 0 (master data) | — | [ ] |
| T-02 | Seed nhóm 1 (giao dịch) | T-01 | [ ] |
| T-03 | HR: luồng tuyển→lương→cấp user | T-01 | [ ] |
| T-04 | Contracts: tạo→duyệt→thanh toán | T-01 | [ ] |
| T-05 | Sales: đơn hàng end-to-end | T-01 | [ ] |
| T-06 | GL: bút toán→ghi sổ→đóng kỳ→BCTC | T-01, T-02 | [ ] |
| T-07 | Tax: cấu hình→tự tính→kê khai | T-02, T-06 | [ ] |
| T-08 | Reports: consolidated đủ số liệu | T-01..T-07 | [ ] |
| T-09 | Reports: trend 12 tháng có số | T-08 | [ ] |
| T-10 | Work: luồng việc dự án đầy đủ subtab | T-01 | [ ] |
| T-11 | Kiểm thử biên toàn bộ module | T-01..T-10 | [ ] |
| T-12 | AI assistant 5 module (M-15) | T-01..T-10 | [ ] |
| T-13 | Cross-tenant: mọi FK phải từ chối ID sai công ty | T-01 | [ ] |
| T-14 | Auth: user inactive không truy cập được | T-01 | [ ] |
