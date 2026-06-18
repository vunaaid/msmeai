# Group 2: Vận Hành — Operations Modules

> **5 modules** — Quản lý chuỗi giá trị từ mua hàng → bán hàng → giao hàng.  
> Có thể bật từng module độc lập. Không bắt buộc phải bật GL trước (trừ khi muốn kế toán tự động).

---

## Dependency Tree (Nhóm Vận Hành)

```
Vendors (08)          ← độc lập, chỉ cần Foundation
Procurement (09)      ← cần Vendors; tích hợp AP + Inventory nếu có
Sales & CRM (10)      ← độc lập; tích hợp Invoice + AR nếu có
Inventory (11)        ← cần Foundation; tích hợp Sales + Procurement nếu có
Contracts (12)        ← độc lập; tích hợp với Sales/HR/Procurement nếu có
```

---

## Module 08: Nhà Cung Cấp (Vendor Management)

### Mô Tả
Hồ sơ và đánh giá nhà cung cấp tập trung. Dùng chung cho AP, Procurement, Contracts.

### Chức Năng

- **Hồ sơ nhà cung cấp** — Tên công ty, MST, địa chỉ, người liên hệ, tài khoản ngân hàng
- **Phân loại** — Loại hàng hóa/dịch vụ cung cấp, tier (A/B/C)
- **Điều khoản thanh toán** — Mặc định: Net30, Net45...
- **Đánh giá định kỳ** — Chất lượng, đúng hạn, giá, hỗ trợ (1-5 sao)
- **Lịch sử giao dịch** — Tất cả PO, HĐ, thanh toán liên quan
- **Tài liệu đính kèm** — Hợp đồng khung, chứng chỉ ISO, đăng ký KD
- **Trạng thái** — Active, suspended, blacklisted (có lý do)
- **Portal (tuỳ chọn)** — NCC tự upload HĐ, xem trạng thái thanh toán

### Entities

```
Vendor {
  id, company_id, name, tax_code, address, phone, email,
  bank_name, bank_account, bank_branch,
  payment_term_days, tier: A|B|C,
  status: active|suspended|blacklisted,
  categories: string[], rating: float
}
VendorContact { id, vendor_id, name, title, phone, email, is_primary }
VendorEvaluation { id, vendor_id, period, quality, delivery, price, support, notes, evaluated_by }
```

### Phụ Thuộc Vào
- Foundation

### Cung Cấp Cho
- **AP**: danh sách vendors, tài khoản ngân hàng
- **Procurement**: vendor để gửi RFQ, tạo PO
- **Contracts**: đối tác ký hợp đồng
- **Inventory**: vendor cho từng sản phẩm

### Standalone: ✅ Hoàn toàn độc lập, có thể dùng như CRM nhà cung cấp.

---

## Module 09: Mua Hàng (Procurement)

### Mô Tả
Quy trình mua hàng từ đầu đến cuối: yêu cầu → chào giá → phê duyệt → đặt hàng → nhận hàng → thanh toán.

### Chức Năng

**Yêu cầu mua hàng (Purchase Request — PR):**
- Nhân viên/bộ phận tạo PR: mô tả, số lượng, ngân sách dự kiến
- Workflow duyệt PR theo giá trị (trưởng phòng → GĐ → CEO tuỳ ngưỡng)
- PR được approve → sinh RFQ

**Chào giá (Request for Quotation — RFQ):**
- Gửi RFQ cho 1 hoặc nhiều vendor
- Nhận và so sánh báo giá
- Chọn vendor, tạo PO

**Đơn đặt hàng (Purchase Order — PO):**
- Tạo PO từ RFQ hoặc trực tiếp
- Workflow duyệt PO theo giá trị
- Gửi PO cho vendor (email PDF)
- Tracking trạng thái: draft → confirmed → partially_received → received → closed

**Nhận hàng (Goods Receipt):**
- Ghi nhận nhận hàng theo PO
- Nhập kho tự động (nếu Inventory module bật)
- 3-way matching: PO ↔ Goods Receipt ↔ Vendor Invoice
- Phát hiện chênh lệch số lượng/giá

**Thanh toán:**
- Sau 3-way match → tạo AP payable tự động (nếu AP bật)
- Tracking payment status từ AP

### Entities

```
PurchaseRequest {
  id, company_id, requester_id, department_id, title,
  items: [{description, quantity, estimated_price}],
  total_estimated, status: draft|pending_approval|approved|rejected,
  approved_by, approved_at
}
PurchaseOrder {
  id, company_id, vendor_id, pr_id,
  number, date, delivery_date, delivery_address,
  items: [{product_id, description, quantity, unit_price, total}],
  subtotal, vat_amount, total,
  status: draft|confirmed|partial|received|closed|cancelled,
  payment_term_days
}
GoodsReceipt {
  id, po_id, received_date, received_by,
  items: [{po_item_id, quantity_received, condition}],
  notes, warehouse_id
}
```

### Workflow Approval (configurable ngưỡng)

```
PR/PO Value        → Approver
< 10M VND          → Trưởng phòng
10M - 100M VND     → Giám đốc bộ phận
100M - 500M VND    → CFO
> 500M VND         → CEO
```

### Phụ Thuộc Vào
- Foundation
- **Vendors** (bắt buộc): chọn vendor cho PO
- **AP** (tuỳ chọn): tạo phải trả tự động sau 3-way match
- **Inventory** (tuỳ chọn): nhập kho khi nhận hàng
- **Approvals** (tuỳ chọn): workflow duyệt PR/PO

### Cung Cấp Cho
- **AP**: payable từ PO đã nhận hàng
- **Inventory**: nhập kho từ goods receipt
- **Reports**: chi phí mua hàng, vendor performance

### Standalone: ✅ Dùng độc lập như phần mềm quản lý PO, không cần GL hay Inventory.

---

## Module 10: Bán Hàng & CRM

### Mô Tả
Quản lý toàn bộ vòng đời khách hàng: từ lead đầu tiên đến sau bán hàng. Tích hợp với Invoice để xuất HĐ trực tiếp từ đơn hàng.

### Chức Năng

**CRM — Khách hàng & Leads:**
- **Lead management**: Nguồn (website, email, event, referral), scoring, status
- **BANT scoring**: Budget, Authority, Need, Timeline (0-100 điểm)
- **Pipeline view**: Kanban + list view, kéo thả stage
- **Deal stages** (configurable): Lead → Qualified → Proposal → Negotiation → Won/Lost
- **Activity log**: Gọi điện, email, meeting, note — tất cả tự động từ AI hoặc nhập tay
- **Follow-up reminder**: Nhắc Sales Rep khi lead im lặng > N ngày
- **Customer 360**: Toàn bộ lịch sử deal, HĐ, hỗ trợ của 1 khách hàng

**Bán hàng:**
- **Báo giá (Quote)**: Tạo từ template, cá nhân hoá, gửi email PDF
- **Đơn hàng (Order)**: Từ quote được accept, hoặc tạo trực tiếp
- **Xuất hóa đơn**: Từ order → Invoice tự động (nếu Invoice bật)
- **Forecast**: Dự báo doanh thu theo pipeline và win rate lịch sử
- **Commission**: Tính hoa hồng cho Sales Rep (nếu HR bật)

**Báo cáo Sales:**
- Pipeline value by stage
- Win rate, average deal size, sales cycle length
- Revenue by product/customer/rep/region
- Quota attainment hàng tháng

### Entities

```
Lead {
  id, company_id, name, company_name, email, phone, source,
  score: 0-100, stage, assigned_to, deal_value, expected_close,
  status: active|won|lost|nurture
}
Customer {
  id, company_id, name, tax_code, address, phone, email,
  tier: A|B|C, segment, account_owner, lifetime_value
}
Quote {
  id, company_id, lead_id, customer_id, number, date, valid_until,
  items: [{description, quantity, unit_price, discount, total}],
  subtotal, discount_total, vat, grand_total,
  status: draft|sent|accepted|rejected|expired
}
SalesOrder {
  id, company_id, customer_id, quote_id,
  number, date, delivery_date,
  items: [{...}], total,
  status: confirmed|processing|shipped|delivered|cancelled,
  invoice_id
}
Activity {
  id, lead_id|customer_id, type: call|email|meeting|note|task,
  subject, description, date, duration, outcome, created_by
}
```

### Events Phát Ra

```
sales.lead.created         → AI scoring, assign cho rep
sales.deal.stage_changed   → Cập nhật pipeline dashboard
sales.deal.won             → Tạo Customer record, trigger onboarding
sales.order.confirmed      → Invoice module tạo HĐ nếu bật
sales.order.delivered      → AR module ghi nhận phải thu
sales.quota.below_target   → Alert manager (Visibility)
```

### Phụ Thuộc Vào
- Foundation
- **Invoice** (tuỳ chọn): xuất HĐ từ order
- **AR** (tuỳ chọn): theo dõi thanh toán của KH
- **Inventory** (tuỳ chọn): kiểm tra tồn kho khi tạo order

### Cung Cấp Cho
- **Invoice**: tạo HĐ từ order
- **AR**: customer data
- **Reports**: doanh thu, pipeline
- **Visibility**: KPI quota attainment, win rate
- **AI Sales Agent**: dữ liệu pipeline, deal, activity

### Standalone: ✅ Dùng như CRM độc lập không cần kế toán.

---

## Module 11: Hàng Tồn Kho (Inventory)

### Mô Tả
Quản lý hàng hoá trong kho: nhập, xuất, tồn, kiểm kê. Cung cấp số liệu hàng tồn cho kế toán.

### Chức Năng

**Danh mục:**
- Sản phẩm/hàng hoá (mã, tên, đơn vị tính, giá vốn, giá bán)
- Phân loại sản phẩm (category tree)
- Nhiều kho (kho chính, kho phụ, kho hàng trả)
- Barcode / QR code

**Nhập/Xuất kho:**
- Phiếu nhập kho: từ Procurement (goods receipt) hoặc trực tiếp
- Phiếu xuất kho: từ Sales Order hoặc trực tiếp (sản xuất, tiêu hao nội bộ)
- Chuyển kho giữa các kho
- Bút toán GL tự động khi nhập/xuất:
  ```
  Nhập kho:  Nợ 156 (Hàng hoá) = Giá trị nhập
               Có 331 (Phải trả) hoặc 111/112
  Xuất kho:  Nợ 632 (Giá vốn)  = Giá vốn hàng xuất
               Có 156 (Hàng hoá)
  ```

**Định giá tồn kho:**
- FIFO (First In First Out) — mặc định
- Bình quân gia quyền (Weighted Average)

**Kiểm kê:**
- Phiếu kiểm kê định kỳ
- So sánh thực tế vs sổ sách, ghi nhận chênh lệch
- Bút toán điều chỉnh kiểm kê

**Cảnh báo:**
- Tồn kho dưới mức tối thiểu → alert + tạo PR tự động (nếu Procurement bật)
- Hàng sắp hết hạn sử dụng
- Hàng không luân chuyển > N ngày

### Entities

```
Product { id, company_id, sku, name, category_id, unit, cost_price, sale_price, min_stock, barcode }
Warehouse { id, company_id, name, address, is_default }
StockLevel { id, product_id, warehouse_id, quantity, reserved_quantity, avg_cost }
StockMove {
  id, company_id, type: in|out|transfer|adjustment,
  product_id, from_warehouse_id, to_warehouse_id,
  quantity, unit_cost, total_cost, reference_type, reference_id,
  journal_entry_id, moved_at
}
StockCount { id, warehouse_id, date, status, items: [{product_id, system_qty, actual_qty, variance}] }
```

### Phụ Thuộc Vào
- Foundation
- **GL** (tuỳ chọn): bút toán khi có biến động kho
- **Sales** (tuỳ chọn): xuất kho theo sales order
- **Procurement** (tuỳ chọn): nhập kho theo goods receipt

### Cung Cấp Cho
- **Sales**: kiểm tra available stock khi tạo order
- **Procurement**: trigger tạo PR khi tồn < min
- **Reports**: giá trị hàng tồn kho, COGS
- **GL**: giá trị hàng tồn trên bảng cân đối kế toán

### Standalone: ✅ Dùng như phần mềm quản lý kho độc lập (không cần GL).

---

## Module 12: Hợp Đồng Điện Tử (Contracts)

### Mô Tả
Soạn thảo, ký kết, lưu trữ và theo dõi vòng đời hợp đồng. Hỗ trợ ký số điện tử.

### Chức Năng

**Soạn thảo:**
- Template hợp đồng (bán hàng, lao động, NDA, dịch vụ, thuê mặt bằng...)
- Editor với merge fields tự động điền từ data (tên KH, giá trị, ngày...)
- Version history, compare changes
- Comment & review trước khi ký

**Ký kết:**
- Ký số USB token (pkcs11js) hoặc soft certificate
- eSign OTP qua email/SMS (cho đối tác)
- Multi-party signing (nhiều bên ký)
- Audit trail: ai ký lúc nào, IP address, device
- Sau khi ký → PDF bất biến, lưu MinIO

**Quản lý vòng đời:**
- Trạng thái: draft → review → pending_signature → active → expired → terminated
- Alert khi hợp đồng sắp hết hạn (30/15/7 ngày trước)
- Gia hạn tự động hoặc nhắc nhở
- Lưu trữ toàn bộ phụ lục, biên bản thanh lý

**Tìm kiếm & Báo cáo:**
- Full-text search nội dung hợp đồng
- Filter theo loại, đối tác, giá trị, trạng thái, ngày
- Báo cáo hợp đồng sắp hết hạn
- Tổng giá trị hợp đồng đang active

### Entities

```
ContractTemplate { id, company_id, name, type, content_template, fields: string[] }
Contract {
  id, company_id, template_id, number, title, type,
  party_type: customer|vendor|employee|other,
  party_id, party_name, party_tax_code,
  value, currency, start_date, end_date,
  status: draft|review|pending_sign|active|expired|terminated,
  signed_pdf_id, current_version
}
ContractVersion { id, contract_id, version, content, created_by, created_at }
ContractSignatory {
  id, contract_id, party: internal|external,
  name, email, phone, role,
  status: pending|signed|declined,
  signed_at, signature_method: usb_token|soft_cert|otp
}
ContractAlert { id, contract_id, alert_type: expiry|renewal, alert_date, sent_at }
```

### Events Phát Ra

```
contract.signed          → Notify all parties, lưu PDF bất biến
contract.expiring        → Alert owner + relevant C-Suite
contract.expired         → Cập nhật status, notify
contract.terminated      → Ghi nhận lý do, notify
```

### Phụ Thuộc Vào
- Foundation
- **Sales** (tuỳ chọn): tạo hợp đồng từ deal won
- **Vendors** (tuỳ chọn): hợp đồng với NCC
- **HR** (tuỳ chọn): hợp đồng lao động

### Cung Cấp Cho
- **AR/AP**: giá trị hợp đồng để đối chiếu phải thu/trả
- **Legal/Compliance**: repository hợp đồng tập trung
- **Visibility**: KPI hợp đồng sắp hết hạn, tổng giá trị

### Standalone: ✅ Hoàn toàn độc lập. Dùng như phần mềm quản lý hợp đồng.
