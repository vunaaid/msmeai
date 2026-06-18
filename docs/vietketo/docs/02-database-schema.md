# Database Schema — VietKeto

> ORM: Prisma  
> Database: PostgreSQL 15  
> Encoding: UTF-8

---

## 1. Tổng Quan ERD (Entity Relationship)

```
companies ──┬── users ──── roles
            │
            ├── fiscal_years ── periods
            │
            ├── accounts (Chart of Accounts TT200)
            │       │
            │       └── journal_lines
            │               │
            │               └── journal_entries
            │
            ├── customers ──── invoices (outgoing) ── invoice_lines
            ├── vendors   ──── invoices (incoming) ── invoice_lines
            │                     │
            │                     └── tct_submissions
            │
            ├── sales_orders ── sales_order_lines
            ├── purchase_orders ── purchase_order_lines
            │
            ├── products ── product_categories
            │       │
            │       └── stock_moves ── warehouses
            │               │
            │               └── stock_valuations
            │
            ├── employees ── payrolls ── payroll_lines
            │
            ├── assets ── asset_depreciations
            │
            ├── bank_accounts ── bank_statements ── reconciliations
            │
            └── tax_declarations ── tax_periods
```

---

## 2. Prisma Schema Đầy Đủ

```prisma
// packages/db/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================
// CORE: COMPANY & USER MANAGEMENT
// ============================================================

model Company {
  id               String   @id @default(cuid())
  name             String                          // Tên công ty
  shortName        String?                         // Tên viết tắt
  taxCode          String   @unique               // Mã số thuế
  address          String?                         // Địa chỉ
  phone            String?
  email            String?
  website          String?
  legalRep         String?                         // Người đại diện pháp luật
  accountingMethod String   @default("ACCRUAL")   // ACCRUAL | CASH
  currencyCode     String   @default("VND")
  fiscalYearStart  Int      @default(1)            // Tháng bắt đầu năm TC (1=T1)
  logoUrl          String?
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  users            User[]
  fiscalYears      FiscalYear[]
  accounts         Account[]
  journalEntries   JournalEntry[]
  customers        Customer[]
  vendors          Vendor[]
  invoices         Invoice[]
  employees        Employee[]
  assets           Asset[]
  warehouses       Warehouse[]
  bankAccounts     BankAccount[]
  taxDeclarations  TaxDeclaration[]
  salesOrders      SalesOrder[]
  purchaseOrders   PurchaseOrder[]
  products         Product[]

  @@map("companies")
}

model User {
  id            String    @id @default(cuid())
  companyId     String
  email         String    @unique
  name          String
  passwordHash  String
  role          UserRole  @default(ACCOUNTANT)
  phone         String?
  avatar        String?
  isActive      Boolean   @default(true)
  lastLoginAt   DateTime?
  twoFactorEnabled Boolean @default(false)
  twoFactorSecret  String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  company       Company  @relation(fields: [companyId], references: [id])
  sessions      Session[]
  journalEntries JournalEntry[] @relation("CreatedBy")
  approvedEntries JournalEntry[] @relation("ApprovedBy")

  @@map("users")
}

enum UserRole {
  SUPER_ADMIN       // Quản trị hệ thống
  ADMIN             // Quản lý công ty
  CHIEF_ACCOUNTANT  // Kế toán trưởng
  ACCOUNTANT        // Kế toán viên
  WAREHOUSE         // Kế toán kho
  HR                // Nhân sự
  SALES             // Kinh doanh
  VIEWER            // Xem báo cáo

  @@map("user_role")
}

model Session {
  id           String   @id @default(cuid())
  userId       String
  token        String   @unique
  expiresAt    DateTime
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime @default(now())

  user         User     @relation(fields: [userId], references: [id])

  @@map("sessions")
}

// ============================================================
// ACCOUNTING: FISCAL YEAR & PERIOD
// ============================================================

model FiscalYear {
  id          String       @id @default(cuid())
  companyId   String
  year        Int                               // Năm (2024, 2025...)
  startDate   DateTime                          // Ngày bắt đầu
  endDate     DateTime                          // Ngày kết thúc
  status      FiscalYearStatus @default(OPEN)
  closedAt    DateTime?
  createdAt   DateTime     @default(now())

  company     Company      @relation(fields: [companyId], references: [id])
  periods     Period[]

  @@unique([companyId, year])
  @@map("fiscal_years")
}

enum FiscalYearStatus {
  OPEN      // Đang mở
  CLOSING   // Đang kết chuyển
  CLOSED    // Đã khóa

  @@map("fiscal_year_status")
}

model Period {
  id           String       @id @default(cuid())
  fiscalYearId String
  periodNumber Int                               // 1–12 (tháng)
  startDate    DateTime
  endDate      DateTime
  status       PeriodStatus @default(OPEN)
  closedAt     DateTime?

  fiscalYear   FiscalYear   @relation(fields: [fiscalYearId], references: [id])
  journalEntries JournalEntry[]

  @@unique([fiscalYearId, periodNumber])
  @@map("periods")
}

enum PeriodStatus {
  OPEN      // Đang mở
  LOCKED    // Đã khóa (không nhập thêm)
  CLOSED    // Đã kết chuyển

  @@map("period_status")
}

// ============================================================
// ACCOUNTING: CHART OF ACCOUNTS (Hệ Thống Tài Khoản TT200)
// ============================================================

model Account {
  id           String      @id @default(cuid())
  companyId    String
  code         String                           // VD: "111", "1111", "511"
  name         String                           // Tên tài khoản
  nameEn       String?                          // Tên tiếng Anh
  parentCode   String?                          // Tài khoản cha
  level        Int                              // 1=Cấp 1, 2=Cấp 2, 3=Cấp 3
  type         AccountType                      // Loại tài khoản
  normalBalance BalanceSide                     // Số dư thông thường: DEBIT/CREDIT
  isDetail     Boolean     @default(false)      // true = tài khoản chi tiết (có thể nhập)
  isActive     Boolean     @default(true)
  description  String?
  createdAt    DateTime    @default(now())

  company      Company     @relation(fields: [companyId], references: [id])
  debitLines   JournalLine[] @relation("DebitAccount")
  creditLines  JournalLine[] @relation("CreditAccount")

  @@unique([companyId, code])
  @@map("accounts")
}

enum AccountType {
  ASSET        // Tài sản (1xx, 2xx)
  LIABILITY    // Nợ phải trả (3xx)
  EQUITY       // Vốn chủ sở hữu (4xx)
  REVENUE      // Doanh thu (5xx)
  EXPENSE      // Chi phí (6xx, 7xx, 8xx)
  MEMO         // Tài khoản ngoài bảng (0xx)

  @@map("account_type")
}

enum BalanceSide {
  DEBIT        // Dư Nợ
  CREDIT       // Dư Có

  @@map("balance_side")
}

// ============================================================
// ACCOUNTING: JOURNAL ENTRIES (Bút Toán)
// ============================================================

model JournalEntry {
  id              String         @id @default(cuid())
  companyId       String
  periodId        String
  entryNumber     String                          // Số bút toán (tự động)
  entryDate       DateTime                        // Ngày hạch toán
  description     String                          // Diễn giải
  reference       String?                         // Số chứng từ gốc
  sourceType      JournalSource  @default(MANUAL) // Nguồn gốc bút toán
  sourceId        String?                         // ID nguồn (HĐ, Lương, ...)
  status          JournalStatus  @default(DRAFT)
  totalDebit      Decimal        @db.Decimal(18, 0) // VND (không có số lẻ)
  totalCredit     Decimal        @db.Decimal(18, 0)
  createdById     String
  approvedById    String?
  approvedAt      DateTime?
  postedAt        DateTime?
  reversedById    String?                          // Bút toán đảo ngược
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  company         Company        @relation(fields: [companyId], references: [id])
  period          Period         @relation(fields: [periodId], references: [id])
  createdBy       User           @relation("CreatedBy", fields: [createdById], references: [id])
  approvedBy      User?          @relation("ApprovedBy", fields: [approvedById], references: [id])
  lines           JournalLine[]

  @@map("journal_entries")
}

enum JournalSource {
  MANUAL          // Nhập tay
  INVOICE_OUT     // Từ hóa đơn bán
  INVOICE_IN      // Từ hóa đơn mua
  PAYMENT         // Từ thanh toán
  PAYROLL         // Từ lương
  DEPRECIATION    // Từ khấu hao
  STOCK           // Từ nhập/xuất kho
  CLOSING         // Kết chuyển cuối kỳ

  @@map("journal_source")
}

enum JournalStatus {
  DRAFT     // Nháp
  PENDING   // Chờ duyệt
  POSTED    // Đã ghi sổ
  REVERSED  // Đã đảo ngược

  @@map("journal_status")
}

model JournalLine {
  id             String       @id @default(cuid())
  journalEntryId String
  lineNumber     Int                               // Thứ tự dòng
  debitAccountId String?                           // Tài khoản Nợ
  creditAccountId String?                          // Tài khoản Có
  description    String?                           // Diễn giải dòng
  debitAmount    Decimal      @default(0) @db.Decimal(18, 0)
  creditAmount   Decimal      @default(0) @db.Decimal(18, 0)
  partnerId      String?                           // KH/NCC liên quan
  costCenterId   String?                           // Bộ phận chi phí

  journalEntry   JournalEntry @relation(fields: [journalEntryId], references: [id], onDelete: Cascade)
  debitAccount   Account?     @relation("DebitAccount", fields: [debitAccountId], references: [id])
  creditAccount  Account?     @relation("CreditAccount", fields: [creditAccountId], references: [id])

  @@map("journal_lines")
}

// ============================================================
// PARTNER: CUSTOMERS & VENDORS
// ============================================================

model Customer {
  id             String    @id @default(cuid())
  companyId      String
  code           String                         // Mã khách hàng
  name           String                         // Tên khách hàng
  taxCode        String?                        // MST
  address        String?
  phone          String?
  email          String?
  contactName    String?                        // Người liên hệ
  paymentTerms   Int       @default(30)         // Số ngày thanh toán
  creditLimit    Decimal?  @db.Decimal(18, 0)  // Hạn mức tín dụng
  isActive       Boolean   @default(true)
  notes          String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  company        Company   @relation(fields: [companyId], references: [id])
  invoices       Invoice[]
  salesOrders    SalesOrder[]

  @@unique([companyId, code])
  @@map("customers")
}

model Vendor {
  id             String    @id @default(cuid())
  companyId      String
  code           String
  name           String
  taxCode        String?
  address        String?
  phone          String?
  email          String?
  contactName    String?
  paymentTerms   Int       @default(30)
  isActive       Boolean   @default(true)
  notes          String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  company        Company   @relation(fields: [companyId], references: [id])
  invoices       Invoice[]
  purchaseOrders PurchaseOrder[]

  @@unique([companyId, code])
  @@map("vendors")
}

// ============================================================
// INVOICE: HÓA ĐƠN ĐIỆN TỬ
// ============================================================

model Invoice {
  id              String         @id @default(cuid())
  companyId       String
  invoiceType     InvoiceType                       // OUTGOING | INCOMING
  invoiceNumber   String?                           // Số hóa đơn
  invoiceSeries   String?                           // Ký hiệu (VD: 1C25TAA)
  invoiceDate     DateTime                          // Ngày lập
  customerId      String?                           // Khách hàng (HĐ bán)
  vendorId        String?                           // NCC (HĐ mua)
  buyerName       String?                           // Tên người mua (on invoice)
  buyerTaxCode    String?                           // MST người mua
  buyerAddress    String?
  paymentMethod   PaymentMethod  @default(TRANSFER)
  paymentTerms    Int?                              // Số ngày TT
  dueDate         DateTime?
  currency        String         @default("VND")
  exchangeRate    Decimal        @default(1) @db.Decimal(10, 4)
  subtotal        Decimal        @db.Decimal(18, 0) // Chưa VAT
  vatRate         Decimal        @default(10) @db.Decimal(5, 2) // 0, 5, 8, 10
  vatAmount       Decimal        @db.Decimal(18, 0)
  totalAmount     Decimal        @db.Decimal(18, 0) // Tổng thanh toán
  paidAmount      Decimal        @default(0) @db.Decimal(18, 0)
  status          InvoiceStatus  @default(DRAFT)
  tctStatus       TCTStatus?                        // Trạng thái TCT
  tctCode         String?                           // Mã CQT (mã của cơ quan thuế)
  tctSubmittedAt  DateTime?
  xmlData         String?        @db.Text          // XML gốc (TT78)
  pdfUrl          String?                           // URL file PDF
  salesOrderId    String?
  purchaseOrderId String?
  journalEntryId  String?
  notes           String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  company         Company        @relation(fields: [companyId], references: [id])
  customer        Customer?      @relation(fields: [customerId], references: [id])
  vendor          Vendor?        @relation(fields: [vendorId], references: [id])
  lines           InvoiceLine[]
  tctSubmissions  TctSubmission[]

  @@map("invoices")
}

model InvoiceLine {
  id           String    @id @default(cuid())
  invoiceId    String
  lineNumber   Int
  productId    String?
  description  String                          // Tên hàng hóa/dịch vụ
  unit         String?                         // Đơn vị tính
  quantity     Decimal   @db.Decimal(15, 3)
  unitPrice    Decimal   @db.Decimal(18, 0)
  discount     Decimal   @default(0) @db.Decimal(5, 2) // % chiết khấu
  vatRate      Decimal   @db.Decimal(5, 2)
  amount       Decimal   @db.Decimal(18, 0)   // Thành tiền (trước VAT)
  vatAmount    Decimal   @db.Decimal(18, 0)

  invoice      Invoice   @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  product      Product?  @relation(fields: [productId], references: [id])

  @@map("invoice_lines")
}

model TctSubmission {
  id           String      @id @default(cuid())
  invoiceId    String
  submittedAt  DateTime    @default(now())
  requestXml   String      @db.Text
  responseXml  String?     @db.Text
  tctCode      String?     // Mã giao dịch TCT
  status       String                          // SUCCESS | FAILED | PENDING
  errorCode    String?
  errorMessage String?

  invoice      Invoice     @relation(fields: [invoiceId], references: [id])

  @@map("tct_submissions")
}

enum InvoiceType {
  OUTGOING    // Hóa đơn bán ra (đầu ra)
  INCOMING    // Hóa đơn mua vào (đầu vào)

  @@map("invoice_type")
}

enum InvoiceStatus {
  DRAFT       // Nháp
  CONFIRMED   // Đã xác nhận
  SENT        // Đã gửi TCT
  APPROVED    // TCT đã chấp nhận
  REJECTED    // TCT từ chối
  CANCELLED   // Đã hủy
  REPLACED    // Đã thay thế

  @@map("invoice_status")
}

enum TCTStatus {
  PENDING     // Đang chờ gửi
  SUBMITTED   // Đã gửi
  ACCEPTED    // Được chấp nhận
  REJECTED    // Bị từ chối

  @@map("tct_status")
}

enum PaymentMethod {
  CASH        // Tiền mặt
  TRANSFER    // Chuyển khoản
  CHECK       // Séc
  CARD        // Thẻ

  @@map("payment_method")
}

// ============================================================
// SALES & PURCHASE ORDERS
// ============================================================

model SalesOrder {
  id              String          @id @default(cuid())
  companyId       String
  customerId      String
  orderNumber     String
  orderDate       DateTime
  deliveryDate    DateTime?
  status          OrderStatus     @default(DRAFT)
  subtotal        Decimal         @db.Decimal(18, 0)
  vatAmount       Decimal         @db.Decimal(18, 0)
  totalAmount     Decimal         @db.Decimal(18, 0)
  notes           String?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  company         Company         @relation(fields: [companyId], references: [id])
  customer        Customer        @relation(fields: [customerId], references: [id])
  lines           SalesOrderLine[]
  invoices        Invoice[]

  @@unique([companyId, orderNumber])
  @@map("sales_orders")
}

model SalesOrderLine {
  id           String      @id @default(cuid())
  orderId      String
  productId    String
  description  String
  quantity     Decimal     @db.Decimal(15, 3)
  unitPrice    Decimal     @db.Decimal(18, 0)
  vatRate      Decimal     @db.Decimal(5, 2)
  amount       Decimal     @db.Decimal(18, 0)
  deliveredQty Decimal     @default(0) @db.Decimal(15, 3)

  order        SalesOrder  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product      Product     @relation(fields: [productId], references: [id])

  @@map("sales_order_lines")
}

model PurchaseOrder {
  id           String            @id @default(cuid())
  companyId    String
  vendorId     String
  orderNumber  String
  orderDate    DateTime
  expectedDate DateTime?
  status       OrderStatus       @default(DRAFT)
  subtotal     Decimal           @db.Decimal(18, 0)
  vatAmount    Decimal           @db.Decimal(18, 0)
  totalAmount  Decimal           @db.Decimal(18, 0)
  notes        String?
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt

  company      Company           @relation(fields: [companyId], references: [id])
  vendor       Vendor            @relation(fields: [vendorId], references: [id])
  lines        PurchaseOrderLine[]
  invoices     Invoice[]

  @@unique([companyId, orderNumber])
  @@map("purchase_orders")
}

model PurchaseOrderLine {
  id            String        @id @default(cuid())
  orderId       String
  productId     String
  description   String
  quantity      Decimal       @db.Decimal(15, 3)
  unitPrice     Decimal       @db.Decimal(18, 0)
  vatRate       Decimal       @db.Decimal(5, 2)
  amount        Decimal       @db.Decimal(18, 0)
  receivedQty   Decimal       @default(0) @db.Decimal(15, 3)

  order         PurchaseOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product       Product       @relation(fields: [productId], references: [id])

  @@map("purchase_order_lines")
}

enum OrderStatus {
  DRAFT       // Nháp
  CONFIRMED   // Đã xác nhận
  PARTIAL     // Giao/nhận một phần
  COMPLETED   // Hoàn thành
  CANCELLED   // Đã hủy

  @@map("order_status")
}

// ============================================================
// INVENTORY: HÀNG TỒN KHO
// ============================================================

model ProductCategory {
  id          String    @id @default(cuid())
  companyId   String
  code        String
  name        String
  parentId    String?
  createdAt   DateTime  @default(now())

  products    Product[]

  @@map("product_categories")
}

model Product {
  id              String           @id @default(cuid())
  companyId       String
  categoryId      String?
  code            String
  name            String
  unit            String           // Đơn vị tính
  productType     ProductType      @default(GOODS)
  valuationMethod ValuationMethod  @default(AVERAGE)
  costPrice       Decimal          @default(0) @db.Decimal(18, 0) // Giá vốn TB
  salePrice       Decimal          @default(0) @db.Decimal(18, 0)
  vatRate         Decimal          @default(10) @db.Decimal(5, 2)
  inventoryAccountCode String?     // TK hàng tồn kho (VD: 1561)
  revenueAccountCode   String?     // TK doanh thu (VD: 5111)
  cogsAccountCode      String?     // TK giá vốn (VD: 6321)
  isActive        Boolean          @default(true)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  company         Company          @relation(fields: [companyId], references: [id])
  category        ProductCategory? @relation(fields: [categoryId], references: [id])
  invoiceLines    InvoiceLine[]
  stockMoves      StockMove[]
  stockBalances   StockBalance[]
  salesOrderLines SalesOrderLine[]
  purchaseOrderLines PurchaseOrderLine[]

  @@unique([companyId, code])
  @@map("products")
}

enum ProductType {
  GOODS       // Hàng hóa (có tồn kho)
  SERVICE     // Dịch vụ (không có tồn kho)
  RAW         // Nguyên vật liệu

  @@map("product_type")
}

enum ValuationMethod {
  AVERAGE     // Bình quân gia quyền
  FIFO        // Nhập trước xuất trước

  @@map("valuation_method")
}

model Warehouse {
  id          String    @id @default(cuid())
  companyId   String
  code        String
  name        String
  address     String?
  isActive    Boolean   @default(true)

  company     Company   @relation(fields: [companyId], references: [id])
  stockMoves  StockMove[]
  stockBalances StockBalance[]

  @@unique([companyId, code])
  @@map("warehouses")
}

model StockMove {
  id              String      @id @default(cuid())
  companyId       String
  warehouseId     String
  productId       String
  moveType        StockMoveType
  moveDate        DateTime
  reference       String?                         // Số phiếu nhập/xuất
  quantity        Decimal     @db.Decimal(15, 3)
  unitCost        Decimal     @db.Decimal(18, 0)  // Giá đơn vị
  totalCost       Decimal     @db.Decimal(18, 0)  // Tổng giá trị
  sourceType      String?                         // invoice | manual | adjustment
  sourceId        String?
  notes           String?
  createdAt       DateTime    @default(now())

  warehouse       Warehouse   @relation(fields: [warehouseId], references: [id])
  product         Product     @relation(fields: [productId], references: [id])

  @@map("stock_moves")
}

model StockBalance {
  id          String    @id @default(cuid())
  warehouseId String
  productId   String
  quantity    Decimal   @db.Decimal(15, 3)     // Số lượng tồn
  avgCost     Decimal   @db.Decimal(18, 0)     // Giá vốn bình quân
  totalValue  Decimal   @db.Decimal(18, 0)     // Tổng giá trị tồn
  updatedAt   DateTime  @updatedAt

  warehouse   Warehouse @relation(fields: [warehouseId], references: [id])
  product     Product   @relation(fields: [productId], references: [id])

  @@unique([warehouseId, productId])
  @@map("stock_balances")
}

enum StockMoveType {
  IN          // Nhập kho
  OUT         // Xuất kho
  ADJUST      // Điều chỉnh kiểm kê
  TRANSFER    // Chuyển kho

  @@map("stock_move_type")
}

// ============================================================
// HR: NHÂN SỰ & LƯƠNG
// ============================================================

model Employee {
  id                String         @id @default(cuid())
  companyId         String
  code              String                          // Mã nhân viên
  fullName          String
  gender            String?                         // MALE | FEMALE | OTHER
  birthDate         DateTime?
  nationalId        String?                         // CCCD/CMND
  nationalIdDate    DateTime?
  nationalIdPlace   String?
  taxCode           String?                         // MST cá nhân
  socialInsuranceCode String?                       // Mã BHXH
  phone             String?
  email             String?
  address           String?
  department        String?
  position          String?
  contractType      ContractType   @default(FULL_TIME)
  startDate         DateTime                        // Ngày vào làm
  endDate           DateTime?                       // Ngày nghỉ việc
  basicSalary       Decimal        @db.Decimal(18, 0) // Lương cơ bản
  allowances        Decimal        @default(0) @db.Decimal(18, 0) // Phụ cấp
  dependents        Int            @default(0)      // Số người phụ thuộc
  bankName          String?
  bankAccount       String?
  bankBranch        String?
  isActive          Boolean        @default(true)
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  company           Company        @relation(fields: [companyId], references: [id])
  payrollLines      PayrollLine[]

  @@unique([companyId, code])
  @@map("employees")
}

enum ContractType {
  FULL_TIME       // Chính thức
  PART_TIME       // Bán thời gian
  PROBATION       // Thử việc
  CONTRACT        // Hợp đồng thời vụ
  INTERN          // Thực tập

  @@map("contract_type")
}

model Payroll {
  id              String         @id @default(cuid())
  companyId       String
  periodMonth     Int                               // Tháng (1-12)
  periodYear      Int                               // Năm
  status          PayrollStatus  @default(DRAFT)
  totalGross      Decimal        @db.Decimal(18, 0) // Tổng lương gross
  totalBhxhNv     Decimal        @db.Decimal(18, 0) // BHXH phần NV
  totalBhxhDn     Decimal        @db.Decimal(18, 0) // BHXH phần DN
  totalPit        Decimal        @db.Decimal(18, 0) // Thuế TNCN
  totalNet        Decimal        @db.Decimal(18, 0) // Tổng thực nhận
  totalDnCost     Decimal        @db.Decimal(18, 0) // Tổng chi phí DN
  approvedAt      DateTime?
  paidAt          DateTime?
  journalEntryId  String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  lines           PayrollLine[]

  @@unique([companyId, periodMonth, periodYear])
  @@map("payrolls")
}

model PayrollLine {
  id              String    @id @default(cuid())
  payrollId       String
  employeeId      String
  basicSalary     Decimal   @db.Decimal(18, 0)
  allowances      Decimal   @db.Decimal(18, 0)
  bonus           Decimal   @default(0) @db.Decimal(18, 0)
  grossSalary     Decimal   @db.Decimal(18, 0)     // Tổng thu nhập
  bhxhNv          Decimal   @db.Decimal(18, 0)     // BHXH NV (8%)
  bhytNv          Decimal   @db.Decimal(18, 0)     // BHYT NV (1.5%)
  bhtnNv          Decimal   @db.Decimal(18, 0)     // BHTN NV (1%)
  bhxhDn          Decimal   @db.Decimal(18, 0)     // BHXH DN (17.5%)
  bhytDn          Decimal   @db.Decimal(18, 0)     // BHYT DN (3%)
  bhtnDn          Decimal   @db.Decimal(18, 0)     // BHTN DN (1%)
  taxableIncome   Decimal   @db.Decimal(18, 0)     // Thu nhập chịu thuế
  personalDeduct  Decimal   @db.Decimal(18, 0)     // Giảm trừ bản thân (11tr)
  dependentDeduct Decimal   @db.Decimal(18, 0)     // Giảm trừ PT (4.4tr x n)
  pitAmount       Decimal   @db.Decimal(18, 0)     // Thuế TNCN
  netSalary       Decimal   @db.Decimal(18, 0)     // Thực nhận

  payroll         Payroll   @relation(fields: [payrollId], references: [id])
  employee        Employee  @relation(fields: [employeeId], references: [id])

  @@unique([payrollId, employeeId])
  @@map("payroll_lines")
}

enum PayrollStatus {
  DRAFT       // Nháp
  PENDING     // Chờ duyệt
  APPROVED    // Đã duyệt
  PAID        // Đã trả lương

  @@map("payroll_status")
}

// ============================================================
// FIXED ASSETS: TÀI SẢN CỐ ĐỊNH
// ============================================================

model Asset {
  id                String          @id @default(cuid())
  companyId         String
  code              String
  name              String
  assetGroup        String                           // Nhóm TSCĐ (TT45)
  purchaseDate      DateTime                         // Ngày mua
  useDate           DateTime                         // Ngày đưa vào SD
  originalCost      Decimal         @db.Decimal(18, 0) // Nguyên giá
  salvageValue      Decimal         @default(0) @db.Decimal(18, 0) // Giá trị còn lại
  usefulLife        Int                              // Thời gian KH (tháng)
  depreciationMethod DeprecMethod   @default(STRAIGHT_LINE)
  accumulatedDeprec Decimal         @default(0) @db.Decimal(18, 0) // KH lũy kế
  bookValue         Decimal         @db.Decimal(18, 0) // Giá trị còn lại
  status            AssetStatus     @default(ACTIVE)
  department        String?                          // Bộ phận sử dụng
  assetAccountCode  String?                          // TK TSCĐ (VD: 2111)
  deprecAccountCode String?                          // TK KH (VD: 2141)
  expenseAccountCode String?                         // TK CP KH (VD: 6424)
  disposedAt        DateTime?
  disposalAmount    Decimal?        @db.Decimal(18, 0)
  notes             String?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  company           Company         @relation(fields: [companyId], references: [id])
  depreciations     AssetDepreciation[]

  @@unique([companyId, code])
  @@map("assets")
}

model AssetDepreciation {
  id            String    @id @default(cuid())
  assetId       String
  periodMonth   Int
  periodYear    Int
  amount        Decimal   @db.Decimal(18, 0)      // Số KH kỳ này
  accumulated   Decimal   @db.Decimal(18, 0)      // KH lũy kế sau kỳ
  bookValue     Decimal   @db.Decimal(18, 0)      // Giá trị còn lại
  journalEntryId String?
  createdAt     DateTime  @default(now())

  asset         Asset     @relation(fields: [assetId], references: [id])

  @@unique([assetId, periodMonth, periodYear])
  @@map("asset_depreciations")
}

enum DeprecMethod {
  STRAIGHT_LINE   // Đường thẳng (TT45)
  DECLINING       // Số dư giảm dần

  @@map("deprec_method")
}

enum AssetStatus {
  ACTIVE      // Đang sử dụng
  IDLE        // Tạm ngưng
  DISPOSED    // Đã thanh lý
  TRANSFERRED // Đã chuyển nhượng

  @@map("asset_status")
}

// ============================================================
// CASH & BANK: NGÂN QUỸ
// ============================================================

model BankAccount {
  id              String        @id @default(cuid())
  companyId       String
  accountName     String                            // Tên tài khoản
  accountNumber   String                            // Số tài khoản
  bankName        String                            // Tên ngân hàng
  bankCode        String?                           // Mã BIN
  branch          String?                           // Chi nhánh
  currency        String        @default("VND")
  isActive        Boolean       @default(true)
  glAccountCode   String?                           // TK kế toán liên kết (112x)
  createdAt       DateTime      @default(now())

  company         Company       @relation(fields: [companyId], references: [id])
  statements      BankStatement[]

  @@unique([companyId, accountNumber])
  @@map("bank_accounts")
}

model BankStatement {
  id              String          @id @default(cuid())
  bankAccountId   String
  statementDate   DateTime
  openingBalance  Decimal         @db.Decimal(18, 0)
  closingBalance  Decimal         @db.Decimal(18, 0)
  importedAt      DateTime        @default(now())

  bankAccount     BankAccount     @relation(fields: [bankAccountId], references: [id])
  lines           BankStatementLine[]

  @@map("bank_statements")
}

model BankStatementLine {
  id              String       @id @default(cuid())
  statementId     String
  transactionDate DateTime
  description     String
  reference       String?      // Số tham chiếu ngân hàng
  debitAmount     Decimal      @default(0) @db.Decimal(18, 0)
  creditAmount    Decimal      @default(0) @db.Decimal(18, 0)
  balance         Decimal      @db.Decimal(18, 0)
  isReconciled    Boolean      @default(false)
  journalEntryId  String?

  statement       BankStatement @relation(fields: [statementId], references: [id])

  @@map("bank_statement_lines")
}

// ============================================================
// TAX: KHAI BÁO THUẾ
// ============================================================

model TaxDeclaration {
  id           String         @id @default(cuid())
  companyId    String
  taxType      TaxType                               // VAT | CIT | PIT
  periodMonth  Int?                                  // Null cho khai theo quý
  periodQuarter Int?
  periodYear   Int
  status       TaxDeclStatus  @default(DRAFT)
  totalTax     Decimal        @db.Decimal(18, 0)
  paidAmount   Decimal        @default(0) @db.Decimal(18, 0)
  dueDate      DateTime                              // Hạn nộp
  submittedAt  DateTime?
  xmlData      String?        @db.Text              // XML nộp HTKK
  notes        String?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  company      Company        @relation(fields: [companyId], references: [id])

  @@map("tax_declarations")
}

enum TaxType {
  VAT         // Thuế GTGT
  CIT         // Thuế TNDN
  PIT         // Thuế TNCN

  @@map("tax_type")
}

enum TaxDeclStatus {
  DRAFT       // Nháp
  SUBMITTED   // Đã nộp
  ACCEPTED    // Cơ quan thuế chấp nhận
  AMENDED     // Đã khai bổ sung

  @@map("tax_decl_status")
}
```

---

## 3. Mô Tả Chi Tiết Các Bảng Quan Trọng

### 3.1 Bảng `accounts` — Hệ Thống Tài Khoản

Seed sẵn theo **TT200/2014/TT-BTC** với ~300 tài khoản:

| Nhóm | Tài khoản | Ví dụ |
|------|-----------|-------|
| Tài sản (1xx) | Tiền, Nợ phải thu, Hàng tồn kho | 111, 112, 131, 152, 155 |
| Tài sản (2xx) | TSCĐ, Đầu tư | 211, 214, 241 |
| Nợ phải trả (3xx) | Phải trả NCC, Vay, Thuế | 331, 341, 333 |
| Vốn chủ (4xx) | Vốn góp, Lợi nhuận | 411, 421 |
| Doanh thu (5xx) | Doanh thu bán hàng | 511, 515 |
| Giá vốn (6xx) | Giá vốn, Chi phí | 632, 641, 642 |
| Thu nhập khác (7xx) | Thu nhập tài chính | 711, 721 |
| Chi phí khác (8xx) | Thuế TNDN, Chi phí khác | 811, 821 |
| Ngoài bảng (0xx) | Tài sản thuê, Hàng ký gửi | 001, 002 |

### 3.2 Bảng `journal_entries` — Nguyên Tắc Kép

Mỗi bút toán **bắt buộc cân bằng**: `sum(debit) = sum(credit)`

Ví dụ: Bán hàng thu tiền mặt 11.000.000đ (VAT 10%):
```
Nợ 111 (Tiền mặt):     11.000.000
    Có 511 (DT bán hàng):  10.000.000
    Có 3331 (VAT phải nộp): 1.000.000
```

### 3.3 Bảng `payroll_lines` — Công Thức Tính Lương

```
Tổng thu nhập (Gross) = Lương cơ bản + Phụ cấp + Thưởng

BHXH NV  = Lương cơ bản × 8%
BHYT NV  = Lương cơ bản × 1.5%
BHTN NV  = Lương cơ bản × 1%
BHXH DN  = Lương cơ bản × 17.5%
BHYT DN  = Lương cơ bản × 3%
BHTN DN  = Lương cơ bản × 1%

Thu nhập chịu thuế = Gross - BHXH NV - BHYT NV - BHTN NV
                   - Giảm trừ bản thân (11tr)
                   - Giảm trừ người phụ thuộc (4.4tr × n)

Thuế TNCN = Biểu thuế lũy tiến 5 bậc
Thực nhận = Gross - BHXH NV - BHYT NV - BHTN NV - Thuế TNCN
```

---

## 3.X Prisma Schema — MODULE 12: HỢP ĐỒNG ĐIỆN TỬ

```prisma
// ============================================================
// CONTRACT: QUẢN LÝ HỢP ĐỒNG ĐIỆN TỬ
// ============================================================

model ContractTemplate {
  id              String    @id @default(cuid())
  companyId       String
  code            String                           // VD: SALE-001
  name            String                           // Tên template
  contractType    ContractType
  content         String    @db.Text              // Nội dung template (HTML/Markdown)
  variables       Json                             // Danh sách biến động {{...}}
  isActive        Boolean   @default(true)
  version         Int       @default(1)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  contracts       Contract[]

  @@unique([companyId, code])
  @@map("contract_templates")
}

model Contract {
  id                String          @id @default(cuid())
  companyId         String
  contractNumber    String                          // Số HĐ (VD: BH-2025-001)
  contractType      ContractType
  templateId        String?                         // Template gốc (nếu có)
  title             String                          // Tiêu đề HĐ
  status            ContractStatus  @default(DRAFT)

  // Bên A (luôn là công ty)
  partyAName        String
  partyATaxCode     String
  partyAAddress     String
  partyARep         String                          // Người đại diện ký
  partyARepTitle    String                          // Chức vụ

  // Bên B (khách hàng / NCC / nhân viên)
  partyBName        String
  partyBTaxCode     String?
  partyBAddress     String?
  partyBRep         String?
  partyBRepTitle    String?
  partyBEmail       String?
  partyBPhone       String?

  // Thông tin HĐ
  contractDate      DateTime?                       // Ngày ký
  startDate         DateTime                        // Ngày bắt đầu
  endDate           DateTime?                       // Ngày kết thúc (null = vô thời hạn)
  value             Decimal?  @db.Decimal(18, 0)  // Giá trị HĐ
  currency          String    @default("VND")
  content           String    @db.Text             // Nội dung HĐ (HTML)

  // Liên kết phân hệ
  customerId        String?
  vendorId          String?
  employeeId        String?
  salesOrderId      String?
  purchaseOrderId   String?

  // Files
  draftFileUrl      String?                         // File nháp (.docx)
  finalFileUrl      String?                         // PDF chốt gửi ký
  signedFileUrl     String?                         // PDF có chữ ký
  auditTrailUrl     String?                         // Chứng chỉ audit trail

  // Metadata
  notes             String?
  internalNotes     String?                         // Ghi chú nội bộ (không in ra HĐ)
  tags              String[]                        // Tags để tìm kiếm
  createdById       String
  assignedToId      String?                         // Người phụ trách
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // Relations
  template          ContractTemplate? @relation(fields: [templateId], references: [id])
  approvals         ContractApproval[]
  signers           ContractSigner[]
  milestones        ContractMilestone[]
  attachments       ContractAttachment[]
  activities        ContractActivity[]
  renewedFromId     String?                         // Gia hạn từ HĐ nào

  @@unique([companyId, contractNumber])
  @@map("contracts")
}

enum ContractType {
  SALE          // Hợp đồng bán hàng
  PURCHASE      // Hợp đồng mua hàng
  EMPLOYMENT    // Hợp đồng lao động
  SERVICE       // Hợp đồng dịch vụ
  LEASE         // Hợp đồng thuê
  PARTNERSHIP   // Hợp đồng hợp tác
  LOAN          // Hợp đồng vay vốn
  INSURANCE     // Hợp đồng bảo hiểm
  NDA           // Thỏa thuận bảo mật
  OTHER         // Khác

  @@map("contract_type")
}

enum ContractStatus {
  DRAFT         // Nháp
  REVIEW        // Đang lấy ý kiến nội bộ
  APPROVED      // Nội bộ đã duyệt
  SIGNING       // Đang ký kết (đã gửi cho các bên)
  ACTIVE        // Có hiệu lực (tất cả đã ký)
  EXPIRED       // Hết hạn
  TERMINATED    // Thanh lý trước hạn
  CANCELLED     // Đã hủy (chưa ký)
  RENEWED       // Đã gia hạn (có HĐ mới thay thế)

  @@map("contract_status")
}

// Vòng duyệt nội bộ
model ContractApproval {
  id              String          @id @default(cuid())
  contractId      String
  approverId      String                            // User phải duyệt
  approverRole    String                            // Vai trò: "CHIEF_ACCOUNTANT", "CFO"...
  sequence        Int                               // Thứ tự duyệt (1, 2, 3...)
  status          ApprovalStatus  @default(PENDING)
  comment         String?                           // Ghi chú / yêu cầu sửa
  decidedAt       DateTime?
  notifiedAt      DateTime?                         // Thời điểm gửi thông báo

  contract        Contract        @relation(fields: [contractId], references: [id])

  @@unique([contractId, approverId])
  @@map("contract_approvals")
}

enum ApprovalStatus {
  PENDING     // Chờ duyệt
  APPROVED    // Đã duyệt
  REJECTED    // Từ chối (kèm lý do)
  SKIPPED     // Bỏ qua (do thay đổi approval chain)

  @@map("approval_status")
}

// Người ký hợp đồng (mỗi bên)
model ContractSigner {
  id              String        @id @default(cuid())
  contractId      String
  party           String                            // "A", "B", "C"...
  name            String
  email           String
  phone           String?
  title           String?                           // Chức vụ
  signMethod      SignMethod     @default(OTP)
  sequence        Int           @default(1)          // Thứ tự ký (1=ký trước)
  status          SignerStatus  @default(PENDING)
  signedAt        DateTime?
  ipAddress       String?
  userAgent       String?
  otpCode         String?                           // OTP đã dùng (hashed)
  signatureData   String?   @db.Text               // Chữ ký base64 (nếu vẽ tay)
  certThumbprint  String?                           // Thumbprint của chứng thư số
  tokenSentAt     DateTime?
  reminderSentAt  DateTime?

  contract        Contract      @relation(fields: [contractId], references: [id])

  @@map("contract_signers")
}

enum SignMethod {
  OTP           // OTP qua SMS/email
  DIGITAL_CERT  // Chứng thư số (USB Token / Soft cert)
  ESIGN_VNPT    // VNPT eSign
  ESIGN_VIETTEL // Viettel eSign
  HANDWRITTEN   // Ký tay (upload ảnh/vẽ)
  WET_SIGN      // Ký tay truyền thống + scan

  @@map("sign_method")
}

enum SignerStatus {
  PENDING       // Chưa ký
  VIEWED        // Đã xem nhưng chưa ký
  SIGNED        // Đã ký
  DECLINED      // Từ chối ký (kèm lý do)

  @@map("signer_status")
}

// Lịch thanh toán theo HĐ
model ContractMilestone {
  id              String          @id @default(cuid())
  contractId      String
  name            String                            // VD: "Đợt 1 - Ký HĐ"
  sequence        Int
  percentage      Decimal         @db.Decimal(5, 2) // % giá trị HĐ
  amount          Decimal         @db.Decimal(18, 0)
  dueDate         DateTime?                         // Ngày đến hạn
  triggerEvent    String?                           // "ON_SIGN", "ON_DELIVERY", ...
  status          MilestoneStatus @default(PENDING)
  invoiceId       String?                           // HĐ đã tạo cho milestone này
  paidAt          DateTime?
  notes           String?

  contract        Contract        @relation(fields: [contractId], references: [id])

  @@map("contract_milestones")
}

enum MilestoneStatus {
  PENDING       // Chưa đến hạn
  DUE           // Đến hạn / Cần tạo HĐ
  INVOICED      // Đã tạo hóa đơn
  PAID          // Đã thanh toán
  OVERDUE       // Quá hạn

  @@map("milestone_status")
}

// File đính kèm HĐ
model ContractAttachment {
  id              String    @id @default(cuid())
  contractId      String
  name            String                            // Tên file hiển thị
  fileUrl         String                            // URL trong MinIO
  fileSize        Int                               // Bytes
  mimeType        String
  uploadedById    String
  uploadedAt      DateTime  @default(now())

  contract        Contract  @relation(fields: [contractId], references: [id])

  @@map("contract_attachments")
}

// Lịch sử hoạt động / Audit trail
model ContractActivity {
  id              String    @id @default(cuid())
  contractId      String
  action          String                            // "CREATED", "EDITED", "APPROVED", "SIGNED"...
  actorId         String?                           // User (null nếu là hệ thống)
  actorName       String                            // Tên người / "Hệ thống"
  actorEmail      String?
  ipAddress       String?
  description     String                            // Mô tả chi tiết
  metadata        Json?                             // Dữ liệu bổ sung
  createdAt       DateTime  @default(now())

  contract        Contract  @relation(fields: [contractId], references: [id])

  @@map("contract_activities")
}
```

---

## 4. Indexes Quan Trọng

```sql
-- Tìm kiếm bút toán theo kỳ
CREATE INDEX idx_journal_entries_period ON journal_entries(company_id, period_id);
CREATE INDEX idx_journal_entries_date ON journal_entries(company_id, entry_date);

-- Tìm kiếm hóa đơn
CREATE INDEX idx_invoices_date ON invoices(company_id, invoice_date);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_tct ON invoices(tct_code);

-- Tồn kho
CREATE INDEX idx_stock_moves_product ON stock_moves(product_id, move_date);

-- Công nợ
CREATE INDEX idx_invoices_due_date ON invoices(due_date, status);
```

---

## 5. Conventions

| Quy tắc | Chi tiết |
|---------|----------|
| ID | CUID (collision-resistant unique identifier) |
| Tiền tệ | `Decimal(18, 0)` — VND không có số lẻ |
| Tỷ giá | `Decimal(10, 4)` — 4 chữ số thập phân |
| Số lượng | `Decimal(15, 3)` — 3 chữ số thập phân |
| Thời gian | UTC, hiển thị theo timezone Asia/Ho_Chi_Minh |
| Soft delete | Không dùng — dùng `isActive: false` |
| Multi-tenant | Tất cả bảng nghiệp vụ có `companyId` |
