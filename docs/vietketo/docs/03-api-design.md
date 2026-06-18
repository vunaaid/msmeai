# API Design — VietKeto

> Công nghệ: tRPC v11 + Next.js API Routes  
> Nguyên tắc: Type-safe end-to-end, không cần viết API docs riêng

---

## 1. Tổng Quan API Architecture

```
Client (React)
    │
    │ tRPC Client (type-safe)
    ▼
Next.js API Route: /api/trpc/[trpc]
    │
    │ tRPC Router
    ▼
Service Layer (Business Logic)
    │
    ▼
Prisma ORM → PostgreSQL
```

### tRPC vs REST — Lý Do Chọn tRPC

| Tiêu chí | tRPC | REST |
|----------|------|------|
| Type safety | ✅ End-to-end TypeScript | ❌ Cần viết types riêng |
| Boilerplate | ✅ Ít | ❌ Nhiều |
| Auto-complete | ✅ IDE biết toàn bộ API | ❌ Không |
| Performance | ✅ Batching tự động | - |
| Docs | - | ✅ OpenAPI/Swagger |

---

## 2. Root Router Structure

```typescript
// apps/web/server/routers/_app.ts

export const appRouter = createTRPCRouter({
  auth:       authRouter,       // Xác thực
  company:    companyRouter,    // Thông tin công ty
  gl:         glRouter,         // Kế toán tổng hợp
  invoice:    invoiceRouter,    // Hóa đơn
  ar:         arRouter,         // Phải thu
  ap:         apRouter,         // Phải trả
  cash:       cashRouter,       // Ngân quỹ
  sales:      salesRouter,      // Bán hàng
  inventory:  inventoryRouter,  // Hàng tồn kho
  hr:         hrRouter,         // Nhân sự
  assets:     assetsRouter,     // TSCĐ
  tax:        taxRouter,        // Khai báo thuế
  reports:    reportsRouter,    // Báo cáo
})

export type AppRouter = typeof appRouter
```

---

## 3. Chi Tiết Từng Router

### 3.1 `glRouter` — Kế Toán Tổng Hợp

```typescript
glRouter = {
  // === TÀI KHOẢN KẾ TOÁN ===
  accounts: {
    list: query          // Danh sách tài khoản (có filter theo loại, cấp)
    getByCode: query     // Lấy tài khoản theo mã
    create: mutation     // Tạo tài khoản (chỉ CHIEF_ACCOUNTANT+)
    update: mutation     // Cập nhật tài khoản
    deactivate: mutation // Vô hiệu hóa tài khoản
  }

  // === BÚT TOÁN ===
  entries: {
    list: query          // Danh sách bút toán (filter: kỳ, trạng thái, tài khoản)
    getById: query       // Chi tiết bút toán + các dòng
    create: mutation     // Tạo bút toán mới
    update: mutation     // Cập nhật bút toán (chỉ khi DRAFT)
    submit: mutation     // Nộp để duyệt (DRAFT → PENDING)
    approve: mutation    // Duyệt bút toán (PENDING → POSTED)
    reverse: mutation    // Đảo ngược bút toán (tạo bút toán ngược)
    delete: mutation     // Xóa bút toán DRAFT
    checkBalance: query  // Kiểm tra debit = credit
  }

  // === SỔ CÁI ===
  ledger: {
    getAccountBalance: query  // Số dư tài khoản tại ngày
    getAccountStatement: query // Sổ chi tiết tài khoản (từ ngày - đến ngày)
    getTrialBalance: query    // Bảng cân đối số phát sinh
  }

  // === KỲ KẾ TOÁN ===
  periods: {
    list: query          // Danh sách kỳ kế toán
    close: mutation      // Khóa kỳ kế toán
    runClosing: mutation // Chạy kết chuyển cuối kỳ
  }
}
```

**Input/Output Examples:**

```typescript
// gl.entries.create
Input: {
  entryDate: Date
  description: string
  reference?: string
  lines: Array<{
    debitAccountCode?: string
    creditAccountCode?: string
    description?: string
    debitAmount: number
    creditAmount: number
    partnerId?: string
  }>
}
Output: {
  id: string
  entryNumber: string
  status: "DRAFT"
  totalDebit: number
  totalCredit: number
  isBalanced: boolean // debit === credit
}

// gl.ledger.getAccountStatement
Input: {
  accountCode: string
  fromDate: Date
  toDate: Date
  periodId?: string
}
Output: {
  account: { code, name, type }
  openingBalance: { debit: number, credit: number }
  lines: Array<{
    date: Date
    entryNumber: string
    description: string
    debit: number
    credit: number
    balance: number
  }>
  closingBalance: { debit: number, credit: number }
}
```

---

### 3.2 `invoiceRouter` — Hóa Đơn Điện Tử

```typescript
invoiceRouter = {
  // === HÓA ĐƠN ĐẦU RA ===
  outgoing: {
    list: query          // Danh sách HĐ bán (filter: ngày, khách hàng, trạng thái)
    getById: query       // Chi tiết HĐ + dòng
    create: mutation     // Tạo HĐ bán mới (từ SO hoặc trực tiếp)
    update: mutation     // Cập nhật HĐ DRAFT
    confirm: mutation    // Xác nhận HĐ (DRAFT → CONFIRMED)
    cancel: mutation     // Hủy HĐ (cần lý do)
    sendEmail: mutation  // Gửi email PDF cho khách hàng
    // TCT: để sau
    // submitToTCT: mutation
    // checkTCTStatus: query
  }

  // === HÓA ĐƠN ĐẦU VÀO ===
  incoming: {
    list: query          // Danh sách HĐ mua
    getById: query       // Chi tiết HĐ mua
    create: mutation     // Nhập thủ công HĐ mua
    update: mutation     // Cập nhật
    approve: mutation    // Duyệt HĐ đầu vào (để đưa vào kê khai)
    matchWithPO: mutation // Khớp với đơn mua hàng
    // TCT: để sau
    // syncFromTCT: mutation
  }
}
```

---

### 3.3 `arRouter` — Phải Thu Khách Hàng

```typescript
arRouter = {
  customers: {
    list: query          // Danh sách khách hàng
    getById: query       // Chi tiết + lịch sử công nợ
    create: mutation
    update: mutation
    deactivate: mutation
    getBalance: query    // Số dư công nợ hiện tại
  }

  receivables: {
    list: query          // Danh sách hóa đơn chưa thu
    getAgingReport: query // Báo cáo tuổi nợ (0-30, 31-60, 61-90, 90+ ngày)
    recordPayment: mutation // Ghi nhận thanh toán từ KH
    getStatement: query  // Sao kê công nợ khách hàng
  }
}
```

---

### 3.4 `apRouter` — Phải Trả Nhà Cung Cấp

```typescript
apRouter = {
  vendors: {
    list: query
    getById: query
    create: mutation
    update: mutation
    deactivate: mutation
    getBalance: query
  }

  payables: {
    list: query
    getAgingReport: query  // Báo cáo tuổi nợ phải trả
    recordPayment: mutation // Ghi nhận thanh toán cho NCC
    getStatement: query
  }
}
```

---

### 3.5 `cashRouter` — Ngân Quỹ

```typescript
cashRouter = {
  bankAccounts: {
    list: query
    getById: query
    create: mutation
    update: mutation
    getBalance: query    // Số dư hiện tại
  }

  statements: {
    list: query
    import: mutation     // Import file CSV/Excel từ ngân hàng
    getLines: query      // Các giao dịch trong sao kê
    autoReconcile: mutation // Tự động đối chiếu với bút toán
    manualReconcile: mutation // Đối chiếu thủ công từng dòng
    getUnreconciled: query // Giao dịch chưa đối chiếu
  }

  receipts: {
    list: query
    create: mutation     // Tạo phiếu thu
    approve: mutation
  }

  payments: {
    list: query
    create: mutation     // Tạo phiếu chi
    approve: mutation
  }
}
```

---

### 3.6 `salesRouter` — Bán Hàng

```typescript
salesRouter = {
  quotes: {
    list: query
    getById: query
    create: mutation     // Tạo báo giá
    update: mutation
    confirm: mutation    // Chuyển thành đơn hàng
    cancel: mutation
    sendEmail: mutation  // Gửi báo giá qua email
  }

  orders: {
    list: query
    getById: query
    create: mutation
    update: mutation
    confirm: mutation
    createInvoice: mutation  // Tạo hóa đơn từ đơn hàng
    createStockOut: mutation // Tạo phiếu xuất kho
    cancel: mutation
  }
}
```

---

### 3.7 `inventoryRouter` — Hàng Tồn Kho

```typescript
inventoryRouter = {
  products: {
    list: query
    getById: query
    create: mutation
    update: mutation
    deactivate: mutation
    getStockBalance: query   // Tồn kho theo kho
  }

  categories: {
    list: query
    create: mutation
    update: mutation
  }

  warehouses: {
    list: query
    create: mutation
    update: mutation
  }

  moves: {
    list: query          // Lịch sử nhập/xuất kho
    getById: query
    createIn: mutation   // Phiếu nhập kho
    createOut: mutation  // Phiếu xuất kho
    createTransfer: mutation // Chuyển kho
    approve: mutation
  }

  stockCount: {
    start: mutation      // Bắt đầu kiểm kê
    updateActual: mutation // Nhập số lượng thực tế
    finalize: mutation   // Kết thúc kiểm kê (tạo bút toán điều chỉnh)
  }

  reports: {
    getStockReport: query    // Báo cáo tồn kho
    getMovementReport: query // Báo cáo nhập xuất tồn
    getValuationReport: query // Báo cáo định giá tồn kho
  }
}
```

---

### 3.8 `hrRouter` — Nhân Sự & Lương

```typescript
hrRouter = {
  employees: {
    list: query
    getById: query
    create: mutation
    update: mutation
    terminate: mutation  // Nghỉ việc
    getPayrollHistory: query // Lịch sử lương
  }

  payroll: {
    list: query          // Danh sách bảng lương
    getById: query       // Chi tiết bảng lương + từng NV
    calculate: mutation  // Tính lương tháng
    updateLine: mutation // Điều chỉnh lương từng NV
    approve: mutation    // Duyệt bảng lương
    markPaid: mutation   // Đánh dấu đã trả lương
    createJournal: mutation // Tạo bút toán hạch toán lương
    exportPayslips: mutation // Xuất phiếu lương (PDF/Excel)
    exportBHXH: mutation // Xuất file XML nộp BHXH
  }
}
```

---

### 3.9 `assetsRouter` — Tài Sản Cố Định

```typescript
assetsRouter = {
  list: query
  getById: query
  create: mutation
  update: mutation

  depreciation: {
    runMonth: mutation   // Tính khấu hao tháng (tất cả TSCĐ)
    getSchedule: query   // Bảng KH dự kiến
    getSummary: query    // Tổng hợp KH theo kỳ
  }

  disposal: {
    dispose: mutation    // Thanh lý TSCĐ
    transfer: mutation   // Chuyển nhượng TSCĐ
  }

  reports: {
    getAssetList: query     // Danh mục TSCĐ
    getDeprecReport: query  // Bảng tổng hợp khấu hao
  }
}
```

---

### 3.10 `taxRouter` — Khai Báo Thuế

```typescript
taxRouter = {
  vat: {
    getDeclList: query    // Danh sách tờ khai GTGT
    calculate: mutation   // Tính thuế GTGT kỳ
    getForm01: query      // Tờ khai 01/GTGT
    getSchedule011: query // Bảng kê 01-1/GTGT (HĐ bán)
    getSchedule012: query // Bảng kê 01-2/GTGT (HĐ mua)
    exportXML: mutation   // Xuất XML nộp eTax/HTKK
    submit: mutation      // Đánh dấu đã nộp
  }

  cit: {
    getDeclList: query
    calculateQuarterly: mutation // Tính tạm tính thuế TNDN quý
    getForm03: query      // Tờ khai 03/TNDN
    exportXML: mutation
    submit: mutation
  }

  pit: {
    getDeclList: query
    calculateAnnual: mutation // Quyết toán thuế TNCN năm
    getForm05: query      // Tờ khai 05/QTT-TNCN
    getSchedule05BK: query // Phụ lục danh sách cá nhân
    exportXML: mutation
    submit: mutation
  }

  calendar: {
    getUpcoming: query    // Lịch nộp thuế sắp tới
    getOverdue: query     // Khoản thuế đã quá hạn
  }
}
```

---

### 3.11 `reportsRouter` — Báo Cáo & Dashboard

```typescript
reportsRouter = {
  dashboard: {
    getCEOSummary: query    // Dashboard CEO (tổng quan)
    getCashFlow: query      // Dòng tiền 12 tháng
    getRevenueTrend: query  // Xu hướng doanh thu
    getARAPSummary: query   // Tóm tắt công nợ
    getPendingTasks: query  // Công việc cần xử lý
  }

  financial: {
    // Báo cáo tài chính TT200
    getBalanceSheet: query    // B01-DN: Bảng cân đối kế toán
    getIncomeStatement: query // B02-DN: Báo cáo kết quả HĐKD
    getCashFlowStatement: query // B03-DN: Báo cáo lưu chuyển tiền tệ
    getNotes: query           // B09-DN: Thuyết minh BCTC
  }

  management: {
    getPLByDepartment: query // P&L theo bộ phận
    getPLByProject: query    // P&L theo dự án
    getRevenueByProduct: query
    getRevenueByCustomer: query
    getCostAnalysis: query
  }

  export: {
    toExcel: mutation   // Xuất Excel
    toPDF: mutation     // Xuất PDF
  }
}
```

### 3.12 `contractRouter` — Hợp Đồng Điện Tử

```typescript
contractRouter = {
  // === TEMPLATE QUẢN LÝ ===
  templates: {
    list: query           // Danh sách template theo loại HĐ
    getById: query        // Chi tiết template + preview
    create: mutation      // Tạo template mới
    update: mutation      // Cập nhật template (tạo version mới)
    deactivate: mutation  // Vô hiệu hóa template
  }

  // === HỢP ĐỒNG ===
  list: query             // Danh sách HĐ (filter: loại, trạng thái, ngày, giá trị)
  getById: query          // Chi tiết HĐ + approval chain + signers + milestones
  create: mutation        // Tạo HĐ mới (từ template hoặc blank)
  createFromTemplate: mutation // Tạo HĐ từ template, điền biến động
  update: mutation        // Cập nhật HĐ (chỉ khi DRAFT)
  delete: mutation        // Xóa HĐ DRAFT
  clone: mutation         // Nhân bản HĐ (tạo HĐ mới từ HĐ cũ)

  // === PHÂN QUYỀN & AI AUTO-ROUTE ===
  buildApprovalChain: query // AI tính toán approval chain theo giá trị + loại HĐ

  // === QUY TRÌNH DUYỆT NỘI BỘ ===
  review: {
    submit: mutation      // Gửi HĐ để duyệt nội bộ (DRAFT → REVIEW)
    approve: mutation     // Phê duyệt (kèm comment)
    reject: mutation      // Từ chối (kèm lý do, HĐ về DRAFT)
    getPending: query     // Danh sách HĐ tôi cần duyệt
  }

  // === KÝ ĐIỆN TỬ ===
  signing: {
    initiate: mutation    // Gửi link ký cho các bên (APPROVED → SIGNING)
    getSigningPage: query // Lấy thông tin trang ký (public, không cần auth)
    verifyOTP: mutation   // Xác minh OTP (public)
    sign: mutation        // Thực hiện ký (public, sau verify OTP)
    decline: mutation     // Từ chối ký (public)
    resendLink: mutation  // Gửi lại link ký
    getStatus: query      // Trạng thái từng người ký
  }

  // === THEO DÕI THỰC HIỆN ===
  milestones: {
    list: query           // Danh sách milestone của HĐ
    update: mutation      // Cập nhật trạng thái milestone
    createInvoice: mutation // Tạo hóa đơn từ milestone (liên kết invoice module)
    markPaid: mutation    // Đánh dấu milestone đã thanh toán
  }

  // === FILES & ATTACHMENTS ===
  attachments: {
    list: query           // Danh sách file đính kèm
    upload: mutation      // Upload file đính kèm
    delete: mutation      // Xóa file đính kèm
    downloadSigned: query // Download PDF có chữ ký
    downloadAuditTrail: query // Download chứng chỉ audit trail
  }

  // === VÒNG ĐỜI ===
  terminate: mutation     // Thanh lý HĐ trước hạn
  renew: mutation         // Gia hạn HĐ (tạo HĐ mới dựa trên HĐ cũ)

  // === AI FEATURES ===
  ai: {
    extractFromFile: mutation // Upload file HĐ → AI trích xuất thông tin
    checkRisks: query         // AI kiểm tra điều khoản rủi ro trong HĐ
    suggestTemplate: query    // AI gợi ý template phù hợp
  }

  // === BÁO CÁO ===
  reports: {
    getPortfolio: query       // Tổng quan danh mục HĐ
    getExpiring: query        // HĐ sắp hết hạn (30/60/90 ngày)
    getOverdueMilestones: query // Milestone quá hạn chưa xuất HĐ
    getByCustomer: query      // HĐ theo khách hàng
    getValueSummary: query    // Tổng giá trị HĐ theo loại/kỳ
  }
}
```

**Input/Output Examples:**

```typescript
// contracts.createFromTemplate
Input: {
  templateId: string
  contractType: ContractType
  variables: {
    partner_name: string
    partner_taxcode?: string
    partner_address?: string
    partner_rep?: string
    contract_value: number
    start_date: Date
    end_date?: Date
    payment_terms?: string
    description?: string
    [key: string]: any    // Các biến tuỳ chỉnh của template
  }
  milestones?: Array<{
    name: string
    percentage: number
    dueDate?: Date
    triggerEvent?: string
  }>
  signers: Array<{
    party: string          // "A", "B"
    name: string
    email: string
    phone?: string
    title?: string
    signMethod: SignMethod
    sequence: number
  }>
}
Output: {
  id: string
  contractNumber: string  // BH-2025-XXX (tự động)
  status: "DRAFT"
  previewUrl: string      // URL preview PDF
}

// contracts.signing.getSigningPage (public — không cần auth)
Input: {
  token: string           // Token từ link email
}
Output: {
  contractTitle: string
  signerName: string
  signerParty: string
  contractFileUrl: string // URL PDF để đọc
  alreadySigned: boolean
  signingDeadline: Date
  otpRequired: boolean
}

// contracts.ai.checkRisks
Input: { contractId: string }
Output: {
  risks: Array<{
    level: "HIGH" | "MEDIUM" | "LOW"
    clause: string          // Điều khoản liên quan
    description: string     // Mô tả rủi ro
    suggestion?: string     // Gợi ý xử lý
  }>
  missingClauses: string[]  // Điều khoản quan trọng còn thiếu
}
```

---

## 4. Middleware & Bảo Mật

### 4.1 Authentication Middleware
```typescript
// Tất cả procedures đều yêu cầu đăng nhập
const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, user: ctx.session.user } })
})
```

### 4.2 Role-based Authorization
```typescript
// Ví dụ: Chỉ CHIEF_ACCOUNTANT+ mới được duyệt bút toán
const chiefAccountantProcedure = protectedProcedure.use(({ ctx, next }) => {
  const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'CHIEF_ACCOUNTANT']
  if (!allowedRoles.includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN' })
  }
  return next()
})
```

### 4.3 Company Isolation (Multi-tenant)
```typescript
// Mọi query đều filter theo companyId của user đang đăng nhập
const companyProcedure = protectedProcedure.use(({ ctx, next }) => {
  return next({
    ctx: { ...ctx, companyId: ctx.user.companyId }
  })
})
```

---

## 5. Error Handling

| Error Code | Tình huống |
|-----------|-----------|
| `UNAUTHORIZED` | Chưa đăng nhập |
| `FORBIDDEN` | Không đủ quyền |
| `NOT_FOUND` | Không tìm thấy tài nguyên |
| `BAD_REQUEST` | Dữ liệu đầu vào không hợp lệ |
| `CONFLICT` | Trùng dữ liệu (VD: mã tài khoản đã tồn tại) |
| `PRECONDITION_FAILED` | Vi phạm nghiệp vụ (VD: bút toán không cân bằng) |
| `INTERNAL_SERVER_ERROR` | Lỗi server |

```typescript
// Ví dụ ném lỗi nghiệp vụ
if (totalDebit !== totalCredit) {
  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: 'Bút toán không cân bằng: Tổng Nợ phải bằng Tổng Có',
  })
}
```

---

## 6. API Conventions

| Quy tắc | Chi tiết |
|---------|----------|
| Naming | camelCase cho tất cả fields |
| Dates | ISO 8601 string (`2025-01-15T00:00:00Z`) |
| Amounts | Integer (VND, không có số lẻ) |
| Pagination | `{ page, pageSize, total, data[] }` |
| Sorting | `{ sortBy: string, sortOrder: 'asc' | 'desc' }` |
| Filter | Zod validated input objects |

---

## 7. Webhooks (Cho TCT — để sau)

```
POST /api/webhooks/tct
Content-Type: application/json
X-TCT-Signature: <HMAC-SHA256>

{
  "event": "INVOICE_ACCEPTED",
  "invoiceCode": "...",
  "tctCode": "...",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

## 8. File Upload API

```
POST /api/upload/bank-statement
  Content-Type: multipart/form-data
  → Parse CSV/Excel, trả về preview để confirm

POST /api/upload/invoice-pdf
  Content-Type: multipart/form-data
  → Upload PDF hóa đơn lên MinIO

GET /api/files/:fileId
  → Download file từ MinIO (có auth check)
```
