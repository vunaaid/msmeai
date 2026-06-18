# Phân tích chức năng Quản Lý Hợp Đồng (Contracts) cho vSME

> Tài liệu phân tích nghiệp vụ + thiết kế kỹ thuật cho module **Hợp Đồng**, tập trung
> 4 trục: **hợp đồng đầu vào**, **hợp đồng đầu ra**, **mẫu biểu hợp đồng**, **các loại
> hình thanh toán**. Bám sát pattern hiện có của codebase (Prisma, Express router, MinIO,
> tái dùng AR/AP/GL/Documents). Ngày: 2026-06-07.
>
> Kế thừa và đào sâu spec khái niệm tại [modules/02-operations.md](modules/02-operations.md) (Module 12).
> Trạng thái triển khai hiện tại: **chưa code** — `contracts` đã có trong module registry
> ([packages/modules/src/registry.ts](packages/modules/src/registry.ts), `route: /contracts`, `tier: extended`)
> nhưng chưa có model, router, hay UI.

---

## 1. Mục tiêu & phạm vi

Quản lý toàn bộ vòng đời hợp đồng của một doanh nghiệp SME Việt Nam, từ soạn thảo →
duyệt → ký → theo dõi thực hiện → thanh lý/hết hạn, với hai chiều nghiệp vụ rõ rệt:

- **Hợp đồng đầu ra (bán / cho thuê / cung cấp dịch vụ)** — công ty là **bên bán**, sinh **doanh thu** và **công nợ phải thu (AR)**.
- **Hợp đồng đầu vào (mua / thuê / sử dụng dịch vụ)** — công ty là **bên mua**, sinh **chi phí** và **công nợ phải trả (AP)**.

Module phải **đứng độc lập được** (dùng như phần mềm quản lý hợp đồng đơn thuần) nhưng
khi bật kèm Kế Toán thì **đối chiếu thẳng** giá trị/lịch thanh toán sang AR/AP/GL.

### Nguyên tắc thiết kế (theo CLAUDE.md & pattern hiện có)

1. **Tái sử dụng tối đa** model dùng chung: `FileRecord` (đính kèm), `ApprovalRequest`
   (duyệt ký), `Notification`/`notifyUsers` (nhắc hạn), `AuditLog` (vết), `Document`/`DocumentTemplate` (mẫu biểu).
2. **Một router/module** theo pattern `apps/api/src/modules/contracts/contracts.router.ts` + helper, đăng ký vào [apps/api/src/app.ts](apps/api/src/app.ts).
3. **Phân quyền theo role** giống Documents (`allowedRoleIds`) + RBAC `hasPermission(user, "contracts", action)`.
4. **Lưu file qua @vsme/storage** (MinIO): bản thảo, bản ký PDF bất biến, phụ lục.
5. **Mọi tiền tệ mặc định VND**; hỗ trợ ngoại tệ + tỷ giá để khớp hóa đơn nhập khẩu.

---

## 2. Phân loại hợp đồng: ĐẦU VÀO vs ĐẦU RA

Đây là trục phân loại **quan trọng nhất** của module. Một field `direction` quyết định
gần như toàn bộ hành vi downstream (kế toán, công nợ, dashboard, quyền).

| Tiêu chí | **Hợp đồng ĐẦU RA** (outbound / sales) | **Hợp đồng ĐẦU VÀO** (inbound / purchase) |
|---|---|---|
| Vai trò công ty | Bên bán / bên cung cấp / bên cho thuê | Bên mua / bên sử dụng / bên thuê |
| Đối tác (`party`) | **Khách hàng** (customer) | **Nhà cung cấp** (vendor/supplier) |
| Tác động tài chính | Doanh thu → **Phải thu (AR, TK 131)** | Chi phí/tài sản → **Phải trả (AP, TK 331)** |
| Hóa đơn liên quan | HĐ đầu ra (xuất cho KH) | HĐ đầu vào (nhận từ NCC) |
| Dòng tiền | Tiền **vào** | Tiền **ra** |
| Người phụ trách điển hình | Sales / Kinh doanh / BĐH | Mua hàng / Procurement / Hành chính |
| Phê duyệt | Theo hạn mức doanh thu | Theo hạn mức chi (thường chặt hơn) |
| Ví dụ | HĐ bán hàng, HĐ dịch vụ cho KH, HĐ cho thuê mặt bằng | HĐ mua nguyên vật liệu, HĐ thuê văn phòng, HĐ thuê ngoài (outsourcing), HĐ phần mềm/SaaS |

### 2.1 Loại hình hợp đồng (`type`) — cắt ngang cả 2 chiều

`direction` (vào/ra) là **trục độc lập** với `type` (bản chất hợp đồng):

| `type` | Thường gặp ở chiều | Ghi chú |
|---|---|---|
| `sales` — mua bán hàng hóa | đầu ra (bán) / đầu vào (mua) | gắn Sales/Procurement nếu có |
| `service` — cung cấp/sử dụng dịch vụ | cả hai | tư vấn, marketing, bảo trì... |
| `lease` — thuê/cho thuê | cả hai | thuê mặt bằng, thiết bị; có chu kỳ |
| `labor` — lao động | đầu vào | gắn HR; nhân sự là "đối tác" nội bộ |
| `nda` — bảo mật | cả hai | thường giá trị = 0 |
| `principle` — hợp đồng nguyên tắc/khung | cả hai | khung dài hạn, phát sinh đơn hàng/phụ lục con |
| `construction` — thi công/xây lắp | cả hai | nghiệm thu theo giai đoạn |
| `other` | — | tùy biến |

> **Khuyến nghị:** lưu `direction` (enum: `inbound` | `outbound` | `internal`) **tách bạch**
> với `type`. Không gộp "hợp đồng mua" thành một `type` riêng — vì một HĐ dịch vụ có thể
> là đầu vào hoặc đầu ra tùy ai là bên cung cấp.

### 2.2 Đối tác hợp đồng (party)

- **Đầu ra** → party là **Customer**. Nếu module Sales/CRM bật, link `partyId` tới khách hàng; nếu không, nhập tay (tên, MST, địa chỉ, người đại diện).
- **Đầu vào** → party là **Vendor**. Nếu module Vendors bật ([modules/02-operations.md](modules/02-operations.md) Module 08), link `partyId`; nếu không, nhập tay.
- **Lao động** → party là **User/Employee** nội bộ.

Lưu cả `partyName`, `partyTaxCode`, `partyAddress`, `partyRepresentative` **snapshot** vào
hợp đồng (denormalize) để bản hợp đồng bất biến kể cả khi hồ sơ KH/NCC thay đổi sau này.

---

## 3. Mẫu biểu hợp đồng (Contract Templates)

Mẫu biểu là **tài sản tái sử dụng** giúp soạn nhanh và chuẩn hóa pháp lý.

### 3.1 Hai tầng mẫu

1. **Mẫu hệ thống (system templates)** — vSME cung cấp sẵn, `companyId = null`, `isSystem = true`, không xóa được. Bộ mẫu khởi tạo cho SME Việt:
   - HĐ mua bán hàng hóa (đầu ra & đầu vào)
   - HĐ cung cấp dịch vụ
   - HĐ nguyên tắc (khung)
   - HĐ thuê mặt bằng / tài sản
   - HĐ lao động (xác định / không xác định thời hạn) + phụ lục
   - Thỏa thuận bảo mật (NDA)
   - Biên bản nghiệm thu, biên bản thanh lý, phụ lục điều chỉnh giá
2. **Mẫu công ty (company templates)** — doanh nghiệp tự upload/tùy biến, `companyId` set. Có thể clone từ mẫu hệ thống rồi sửa.

> Tận dụng **DocumentTemplate** đã có ([packages/db schema](packages/db/prisma/schema.prisma),
> dùng trong [documents.router.ts](apps/api/src/modules/documents/documents.router.ts)):
> `{ companyId?, name, category, fileType, storagePath, variables, isSystem }`.
> Đặt `category = "contract"` và thêm `contractType`/`direction` vào `variables`/metadata,
> hoặc tạo bảng `ContractTemplate` riêng nếu cần field chuyên biệt (xem §6).

### 3.2 Merge fields (trường trộn / placeholder)

Mẫu chứa placeholder dạng `{{...}}` để điền tự động từ dữ liệu hợp đồng:

```
{{company.name}}        {{company.taxCode}}      {{company.address}}
{{party.name}}          {{party.taxCode}}        {{party.representative}}
{{contract.number}}     {{contract.title}}       {{contract.value}}
{{contract.valueText}}  (số tiền bằng chữ)       {{contract.startDate}}
{{contract.endDate}}    {{payment.method}}       {{payment.schedule}}
```

- Editor (OnlyOffice cho .docx, hoặc markdown) như Documents.
- `{{contract.valueText}}` — số tiền bằng chữ tiếng Việt (cần helper `numberToVietnameseWords`).
- AI agent (module ai-agents) có thể tự điền mẫu + sinh draft từ hội thoại (đã có hạ tầng tạo .md vào MinIO/Tài liệu — xem memory ai-chat-agent-orchestration).

### 3.3 Luồng tạo hợp đồng từ mẫu

```
Chọn mẫu (system/company)
  → chọn direction + party (KH/NCC)
  → điền merge fields (tay hoặc AI)
  → sinh Document/ContractVersion v1 (.docx/.md vào MinIO)
  → review/comment → duyệt → ký → PDF bất biến
```

Tương tự `createDocumentFromTemplate` trong [@vsme/storage](packages/storage/src/documents.ts).

---

## 4. Các loại hình thanh toán (Payment Terms)

Trục nghiệp vụ thứ tư — mô tả **tiền chuyển giao thế nào**. Tách 3 khái niệm:

### 4.1 Phương thức thanh toán (`paymentMethod`)

| Mã | Tên | Ghi chú |
|---|---|---|
| `cash` | Tiền mặt | quỹ tiền mặt (TK 111) |
| `bank_transfer` | Chuyển khoản | phổ biến nhất; bắt buộc với HĐ ≥ 20tr để khấu trừ thuế GTGT (quy định VN) |
| `offset` | Cấn trừ công nợ | bù trừ khi vừa mua vừa bán với cùng đối tác |
| `installment` | Trả góp | nhiều kỳ theo lịch |
| `letter_of_credit` | L/C (tín dụng thư) | nhập khẩu |
| `e_wallet` | Ví điện tử | Momo/VNPay... |
| `other` | Khác | |

### 4.2 Điều khoản/kỳ hạn thanh toán (`paymentTerm` + lịch)

Cách tiền được chia theo thời gian — đây là phần ảnh hưởng trực tiếp tới AR/AP:

| Kiểu | Mô tả | Ví dụ |
|---|---|---|
| `prepaid` | Trả trước 100% | ứng toàn bộ trước giao hàng |
| `on_delivery` | Trả khi giao/nghiệm thu (COD) | thanh toán 1 lần khi xong |
| `net_days` | Công nợ N ngày sau hóa đơn | NET 30 / NET 45 — chuẩn B2B |
| `milestone` | Theo cột mốc/giai đoạn | tạm ứng 30% → nghiệm thu 60% → bảo hành 10% |
| `recurring` | Định kỳ | thuê mặt bằng/SaaS theo tháng/quý |
| `retention` | Giữ lại bảo hành | giữ 5–10% đến hết bảo hành (xây lắp) |

### 4.3 Lịch thanh toán (Payment Schedule) — đơn vị tài chính cốt lõi

Mỗi hợp đồng có **N dòng lịch thanh toán** (`ContractPaymentSchedule`), mỗi dòng là một
"đợt" tiền dự kiến. Đây là cầu nối sang AR/AP & dòng tiền dự báo:

```
ContractPaymentSchedule {
  installmentNo,           // đợt số
  description,             // "Tạm ứng", "Nghiệm thu GĐ1", "Quyết toán"...
  dueDate,                 // ngày đến hạn dự kiến
  amount,                  // số tiền đợt
  percent,                 // % giá trị HĐ (tùy chọn)
  status,                  // pending | invoiced | partially_paid | paid | overdue
  paidAmount, paidDate,
  invoiceId?               // link hóa đơn khi đã xuất/nhận
}
```

- Tổng `amount` các đợt **phải khớp** giá trị hợp đồng (validation như GL: cân đối).
- Đầu ra → mỗi đợt đến hạn ⇒ tạo/nhắc **phải thu**; quá hạn ⇒ alert (giống "overdue" của work).
- Đầu vào → mỗi đợt đến hạn ⇒ lịch **phải trả** + cảnh báo dòng tiền ra.
- Cron nhắc hạn (tái dùng pattern cron 6h sáng của recurring work — xem memory work-module-rules) quét `dueDate` sắp tới → `notifyUsers`.

### 4.4 Thuế & giá trị

- `valueBeforeTax`, `taxRate` (0/5/8/10% VAT VN), `taxAmount`, `valueAfterTax`.
- `currency` (mặc định `VND`) + `exchangeRate` cho ngoại tệ.
- Phân biệt giá trị **đã gồm thuế** hay **chưa** (`taxInclusive: boolean`).

---

## 5. Vòng đời & trạng thái hợp đồng

```
draft ──► review ──► pending_approval ──► pending_signature ──► active
  │                                                              │
  │                                              ┌───────────────┼───────────────┐
  │                                              ▼               ▼               ▼
  └──► cancelled                            completed        expired        terminated
       (hủy khi chưa hiệu lực)         (hoàn thành nghĩa vụ) (hết hạn)   (chấm dứt sớm)
```

| Trạng thái | Ý nghĩa |
|---|---|
| `draft` | Đang soạn |
| `review` | Đang review nội bộ/comment |
| `pending_approval` | Chờ duyệt (dùng `ApprovalRequest`, theo hạn mức) |
| `pending_signature` | Chờ các bên ký |
| `active` | Đã ký, đang hiệu lực |
| `completed` | Hoàn thành nghĩa vụ (đã thanh toán/nghiệm thu đủ) |
| `expired` | Hết hạn theo `endDate` |
| `terminated` | Chấm dứt sớm (ghi lý do) |
| `cancelled` | Hủy khi chưa hiệu lực |

**Cảnh báo hết hạn:** quét `endDate` còn 30/15/7 ngày → notify owner + C-Suite liên quan.

**Sự kiện phát ra** (notifyUsers + AuditLog): `contract.created`, `contract.approved`,
`contract.signed` (lưu PDF bất biến), `contract.payment_due`, `contract.expiring`,
`contract.expired`, `contract.terminated`.

---

## 6. Mô hình dữ liệu (Prisma) — đề xuất

Thêm vào [packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma).
**Lưu ý CLAUDE.md:** sau khi sửa schema phải `pnpm db:migrate` (KHÔNG `db:reset`/`migrate dev`
trên DB local vì là bản clone — xem memory db-migrate-footgun; thực tế dự án đang dùng `db push`).

```prisma
enum ContractDirection { inbound  outbound  internal }
enum ContractType      { sales service lease labor nda principle construction other }
enum ContractStatus    { draft review pending_approval pending_signature active completed expired terminated cancelled }
enum PaymentMethod     { cash bank_transfer offset installment letter_of_credit e_wallet other }
enum PaymentTerm       { prepaid on_delivery net_days milestone recurring retention }
enum ScheduleStatus    { pending invoiced partially_paid paid overdue }
enum SignatoryStatus   { pending signed declined }

model Contract {
  id              String   @id @default(uuid())
  companyId       String
  number          String                       // HĐ2026-001 (auto, tách chuỗi theo direction)
  title           String
  direction       ContractDirection
  type            ContractType
  status          ContractStatus  @default(draft)

  // Đối tác (snapshot + link tùy chọn)
  partyType       String                        // customer | vendor | employee | other
  partyId         String?                       // FK mềm tới Customer/Vendor/User
  partyName       String
  partyTaxCode    String?
  partyAddress    String?
  partyRepresentative String?

  // Giá trị
  currency        String   @default("VND")
  exchangeRate    Float    @default(1)
  taxInclusive    Boolean  @default(true)
  valueBeforeTax  Decimal  @default(0)
  taxRate         Float    @default(0)
  taxAmount       Decimal  @default(0)
  value           Decimal  @default(0)          // tổng giá trị (sau thuế)

  // Thanh toán
  paymentMethod   PaymentMethod?
  paymentTerm     PaymentTerm?
  netDays         Int?                          // khi paymentTerm = net_days

  // Thời hạn
  signDate        DateTime?
  startDate       DateTime?
  endDate         DateTime?
  autoRenew       Boolean  @default(false)

  // Mẫu & file
  templateId      String?
  currentVersionId String? @unique
  signedFileId    String?                       // FileRecord PDF bất biến sau ký

  // Quản trị
  ownerId         String                        // người phụ trách
  createdBy       String
  allowedRoleIds  Json?                         // phân quyền đọc như Document
  metadata        Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  versions        ContractVersion[]
  signatories     ContractSignatory[]
  schedules       ContractPaymentSchedule[]

  @@unique([companyId, number])
  @@index([companyId, direction, status])
  @@map("contracts")
}

model ContractVersion {
  id          String   @id @default(uuid())
  contractId  String
  versionNo   Int
  storagePath String                            // MinIO (.docx/.md)
  changeNote  String?
  createdBy   String
  createdAt   DateTime @default(now())
  @@map("contract_versions")
}

model ContractSignatory {
  id          String   @id @default(uuid())
  contractId  String
  party       String                            // internal | external
  name        String
  email       String?
  phone       String?
  roleInDeal  String?                           // "Bên A - Giám đốc"...
  status      SignatoryStatus @default(pending)
  signMethod  String?                           // usb_token | soft_cert | otp
  signedAt    DateTime?
  signedIp    String?
  @@map("contract_signatories")
}

model ContractPaymentSchedule {
  id            String   @id @default(uuid())
  contractId    String
  installmentNo Int
  description   String?
  dueDate       DateTime?
  percent       Float?
  amount        Decimal
  status        ScheduleStatus @default(pending)
  paidAmount    Decimal  @default(0)
  paidDate      DateTime?
  invoiceId     String?                         // link hóa đơn AR/AP
  @@index([contractId])
  @@index([dueDate, status])
  @@map("contract_payment_schedules")
}
```

> **Mẫu biểu:** có thể tái dùng `DocumentTemplate` (category="contract") thay vì bảng mới.
> Đính kèm phụ lục/biên bản → `FileRecord` với `entityType="contract"`, `entityId=contract.id`
> (enum `FileEntityType` đã có `contract`). Duyệt ký → `ApprovalRequest` (`moduleKey="contracts"`).

---

## 7. API (Express) — đề xuất

Tạo `apps/api/src/modules/contracts/contracts.router.ts`, đăng ký `api.use("/contracts", contractsRouter)` trong [app.ts](apps/api/src/app.ts). Pattern: `requireAuth` + `wrap()` + `hasPermission(user,"contracts",action)` + envelope `ok/created/...`.

```
GET    /contracts?direction=&type=&status=&partyId=&q=&page=&limit=   # danh sách (lọc + phân trang)
GET    /contracts/stats                       # KPI: tổng giá trị active theo chiều, sắp hết hạn, quá hạn TT
POST   /contracts                             # tạo (từ mẫu hoặc trống)
GET    /contracts/:id                          # chi tiết + versions + schedules + signatories
PUT    /contracts/:id                          # cập nhật (khi draft/review)
DELETE /contracts/:id                          # soft delete

# Phiên bản & nội dung
GET    /contracts/:id/versions
POST   /contracts/:id/versions                 # tạo version mới (upload/sửa)
GET    /contracts/:id/download                 # presigned URL bản hiện tại / bản ký

# Vòng đời
POST   /contracts/:id/submit                   # → pending_approval (tạo ApprovalRequest)
POST   /contracts/:id/approve | /reject
POST   /contracts/:id/sign                      # ghi nhận chữ ký 1 bên; đủ bên → active + lưu PDF
POST   /contracts/:id/terminate                 # chấm dứt (lý do)

# Thanh toán
GET    /contracts/:id/schedules
POST   /contracts/:id/schedules                 # thêm/sửa lịch (validate tổng = value)
POST   /contracts/schedules/:sid/pay            # ghi nhận thu/chi 1 đợt → cập nhật AR/AP

# Mẫu biểu
GET    /contracts/templates?direction=&type=    # system + company (category=contract)
POST   /contracts/templates                     # upload mẫu công ty
POST   /contracts/from-template                 # tạo HĐ từ mẫu + merge fields

# Phụ lục/đính kèm
GET/POST/DELETE /contracts/:id/attachments      # FileRecord entityType=contract
```

---

## 8. Giao diện Web — đề xuất

`apps/web/src/app/(dashboard)/contracts/` theo pattern Documents/Work:
`page.tsx` (server RSC, auth) → `contracts-client.tsx` (client, `useApi`/`apiSend`) → `[id]/`.

**Tabs chính** (dùng `PageHeader`, icon `Pen`):

| Tab | Nội dung |
|---|---|
| Hợp đồng đầu ra | list `direction=outbound` — KH, giá trị, công nợ phải thu |
| Hợp đồng đầu vào | list `direction=inbound` — NCC, giá trị, công nợ phải trả |
| Lịch thanh toán | tất cả đợt đến hạn (cross-contract), lọc theo tuần/tháng, badge quá hạn |
| Mẫu biểu | mẫu hệ thống + công ty, tạo nhanh |

Trang chi tiết `[id]`: thông tin chung · nội dung (OnlyOffice/markdown viewer) · các bên ký
· lịch thanh toán · phụ lục/đính kèm · lịch sử (audit) · nút theo trạng thái.

**Sidebar:** registry đã có `contracts` (navOrder 120). Chỉ cần admin **bật module** tại
`/admin/modules` + cấp quyền role `contracts:read` → sidebar tự hiện (xem [layout.tsx](apps/web/src/app/(dashboard)/layout.tsx)).
Lưu ý: thêm `contracts` vào `IMPLEMENTED_MODULES` trong layout để bỏ nhãn "sắp ra mắt" khi xong.

---

## 9. Tích hợp với các module khác

| Module | Quan hệ |
|---|---|
| **Documents** ✅ | tái dùng `DocumentTemplate` (mẫu), OnlyOffice editor, @vsme/storage, extractText (full-text search) |
| **AR (phải thu)** | HĐ đầu ra → lịch thanh toán sinh phải thu; đối chiếu hóa đơn đầu ra |
| **AP (phải trả)** | HĐ đầu vào → lịch thanh toán sinh phải trả; đối chiếu hóa đơn đầu vào |
| **GL** | ghi nhận giá trị/đặt cọc; `sourceModule="contracts"`, `sourceRef=contract.id` |
| **Invoice** | mỗi đợt schedule có thể gắn 1 hóa đơn |
| **Sales/CRM** (tùy chọn) | tạo HĐ đầu ra từ deal won; `partyId` = customer |
| **Vendors** (tùy chọn) | HĐ đầu vào gắn nhà cung cấp |
| **HR** (tùy chọn) | HĐ lao động; party = employee |
| **Work** | tạo việc theo dõi nghiệm thu/cột mốc; `WorkItem` link contract |
| **AI-agents** ✅ | sinh draft từ mẫu, soát điều khoản, nhắc hạn (đã có hạ tầng) |
| **Notifications/Push** ✅ | nhắc đến hạn TT, sắp hết hạn (1 cửa `notifyUsers`) |
| **Foundation** | RBAC, AuditLog, ApprovalRequest, ModuleConfig |

---

## 10. Lộ trình triển khai đề xuất

**Giai đoạn 1 — Lõi (độc lập, không cần Kế Toán):**
1. Schema `Contract` + `ContractVersion` + `ContractPaymentSchedule` + `ContractSignatory` → `pnpm db:migrate`.
2. Router CRUD + danh sách lọc theo `direction` + stats.
3. UI 4 tab + trang chi tiết; tạo từ mẫu (dùng DocumentTemplate category=contract).
4. Đính kèm (FileRecord), version, download (presigned).
5. Vòng đời cơ bản: draft→approve→sign(ghi nhận thủ công)→active; cron nhắc hết hạn + đến hạn TT.

**Giai đoạn 2 — Tài chính:**
6. Lịch thanh toán đầy đủ + ghi nhận thu/chi từng đợt.
7. Đối chiếu AR/AP (khi module bật); ghi GL giá trị/cọc.
8. Dashboard: tổng giá trị active theo chiều, dòng tiền dự báo, quá hạn TT.

**Giai đoạn 3 — Ký số & AI:**
9. Ký số USB token / soft cert / OTP; PDF bất biến.
10. AI: sinh draft từ hội thoại, soát rủi ro điều khoản, tóm tắt hợp đồng.

---

## Phụ lục: bảng quyết định nhanh "đầu vào hay đầu ra?"

> Hỏi: **Công ty mình nhận tiền hay trả tiền?**
> - Nhận tiền (mình bán/cho thuê/cung cấp) → **ĐẦU RA** → Khách hàng → AR → tiền vào.
> - Trả tiền (mình mua/thuê/sử dụng) → **ĐẦU VÀO** → Nhà cung cấp → AP → tiền ra.
>
> `direction` set một lần lúc tạo, không đổi; chi phối toàn bộ kế toán, công nợ, dashboard, quyền.
