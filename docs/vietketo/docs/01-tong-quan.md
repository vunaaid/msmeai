# VietKeto — Hệ Thống Kế Toán Startup Việt Nam

> Phiên bản: 1.0.0  
> Cập nhật: 2026-05-27  
> Tác giả: VietKeto Team

---

## 1. Giới Thiệu

**VietKeto** là giải pháp kế toán toàn diện, được thiết kế đặc biệt cho công ty startup Việt Nam quy mô **10–50 nhân viên**. Hệ thống tuân thủ đầy đủ các quy định kế toán và thuế của Việt Nam:

- Thông tư **200/2014/TT-BTC** (Hệ thống tài khoản kế toán)
- Thông tư **78/2021/TT-BTC** (Hóa đơn điện tử)
- Thông tư **45/2013/TT-BTC** (Tài sản cố định & khấu hao)
- Luật Thuế TNCN, TNDN, GTGT hiện hành

---

## 2. Mục Tiêu Hệ Thống

| Mục tiêu | Chi tiết |
|----------|----------|
| Số hóa toàn bộ quy trình kế toán | Từ bút toán → báo cáo tài chính |
| Kết nối trực tiếp TCT | Hóa đơn điện tử đầu vào/đầu ra qua eTax |
| Tự động hóa tính lương & thuế | BHXH, BHYT, BHTN, TNCN |
| Báo cáo real-time cho ban lãnh đạo | Dashboard CEO, P&L, Cash Flow |
| Triển khai Hybrid | Dữ liệu nhạy cảm on-premise, app trên cloud |

---

## 3. Các Phân Hệ

```
VietKeto
├── 01. Kế Toán Tổng Hợp (GL)         ← Trung tâm của hệ thống
├── 02. Hóa Đơn Điện Tử               ← Tích hợp TCT eTax
├── 03. Phải Thu (AR)                  ← Công nợ khách hàng
├── 04. Phải Trả (AP)                  ← Công nợ nhà cung cấp
├── 05. Ngân Quỹ                       ← Tiền mặt + Ngân hàng
├── 06. Bán Hàng                       ← Báo giá → Đơn hàng → HĐ
├── 07. Hàng Tồn Kho                   ← Nhập/Xuất/Tồn kho
├── 08. Nhân Sự & Lương                ← HR + Payroll
├── 09. Tài Sản Cố Định                ← TSCĐ + Khấu hao
├── 10. Khai Báo Thuế                  ← GTGT, TNDN, TNCN
└── 11. Báo Cáo & Dashboard            ← Reports + Analytics
```

---

## 4. Tech Stack

### Frontend & Backend
| Thành phần | Công nghệ | Phiên bản |
|------------|-----------|-----------|
| Framework | Next.js | 14.x |
| Ngôn ngữ | TypeScript | 5.x |
| UI Library | Ant Design | 5.x |
| CSS | Tailwind CSS | 3.x |
| API Layer | tRPC | 11.x |
| Biểu đồ | Apache ECharts | 5.x |
| Form | React Hook Form + Zod | - |

### Backend & Database
| Thành phần | Công nghệ | Phiên bản |
|------------|-----------|-----------|
| ORM | Prisma | 5.x |
| Database | PostgreSQL | 15 |
| Cache | Redis | 7 |
| Auth | NextAuth.js | v5 |
| Queue | BullMQ | 5.x |
| File Storage | MinIO | RELEASE.2024 |
| Email | Nodemailer + SMTP | - |

### Ký Số & Tích Hợp
| Thành phần | Công nghệ |
|------------|-----------|
| Ký số XML | node-forge |
| USB Token | pkcs11js |
| Soft Cert | .p12/.pfx via node-forge |
| TCT API | REST/SOAP (hoadondientu.gdt.gov.vn) |

### DevOps
| Thành phần | Công nghệ |
|------------|-----------|
| Monorepo | Turborepo |
| Package manager | pnpm |
| Container | Docker + Docker Compose |
| Reverse Proxy | Nginx |
| CI/CD | GitHub Actions |
| Monitoring | Prometheus + Grafana |

---

## 5. Kiến Trúc Hệ Thống

### 5.1 Tổng Quan Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    NGƯỜI DÙNG                            │
│           (Browser / Web App)                            │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTPS
┌─────────────────────▼───────────────────────────────────┐
│               CLOUD LAYER (VPS/AWS)                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │                    Nginx                          │   │
│  │           (Reverse Proxy + SSL)                   │   │
│  └───────────────────┬──────────────────────────────┘   │
│                      │                                   │
│  ┌───────────────────▼──────────────────────────────┐   │
│  │              Next.js App                          │   │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────────┐  │   │
│  │   │  Pages   │  │  tRPC    │  │  API Routes  │  │   │
│  │   │  (React) │  │ Routers  │  │  (Webhooks)  │  │   │
│  │   └──────────┘  └──────────┘  └──────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
│                      │                                   │
│  ┌───────────────────▼──────────────────────────────┐   │
│  │              Redis                                │   │
│  │   (Session | Cache | BullMQ Queue)                │   │
│  └──────────────────────────────────────────────────┘   │
│                      │ VPN Tunnel (WireGuard)            │
└──────────────────────┼──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│            ON-PREMISE LAYER (Office Server)              │
│  ┌─────────────────┐    ┌──────────────────────────┐   │
│  │   PostgreSQL 15  │    │   MinIO Object Storage   │   │
│  │   (Primary DB)  │    │ (Files, Certs, Backups)  │   │
│  └─────────────────┘    └──────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                       │
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────┐
│           TCT eTax Portal (Tổng Cục Thuế)                │
│         hoadondientu.gdt.gov.vn                          │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Data Flow — Hóa Đơn Đầu Ra

```
Kế toán tạo HĐ (UI)
    │
    ▼
Validate dữ liệu (Zod schema)
    │
    ▼
Generate XML (TT78/2021 format)
    │
    ▼
Ký số (USB Token / Soft Cert)
    │
    ▼
BullMQ Queue → Worker
    │
    ▼
POST hoadondientu.gdt.gov.vn
    │
    ├─ Thành công → Lưu mã CQT → Tạo bút toán GL → Email KH
    │
    └─ Thất bại → Retry (3 lần) → Alert kế toán
```

### 5.3 Data Flow — Hóa Đơn Đầu Vào

```
Cron job hàng ngày (hoặc trigger thủ công)
    │
    ▼
GET hoadondientu.gdt.gov.vn/search
    (theo kỳ + MST người mua)
    │
    ▼
Parse danh sách HĐ đầu vào
    │
    ▼
Lưu DB (invoices, type=INCOMING)
    │
    ▼
Auto-match với PO (nếu có)
    │
    ▼
Thông báo kế toán để duyệt → Tạo bút toán GL
```

---

## 6. Cấu Trúc Thư Mục Dự Án

```
vietketo/                           ← Monorepo root
├── apps/
│   └── web/                        ← Next.js 14 Application
│       ├── app/
│       │   ├── (auth)/             ← Trang Login / Register
│       │   │   ├── login/
│       │   │   └── register/
│       │   ├── (dashboard)/        ← Main App Layout
│       │   │   ├── layout.tsx      ← Sidebar + Header
│       │   │   ├── dashboard/      ← Trang chủ tổng quan
│       │   │   ├── gl/             ← Kế toán tổng hợp
│       │   │   │   ├── accounts/   ← Hệ thống tài khoản
│       │   │   │   ├── journals/   ← Nhật ký bút toán
│       │   │   │   └── ledger/     ← Sổ cái
│       │   │   ├── invoice/        ← Hóa đơn điện tử
│       │   │   │   ├── outgoing/   ← HĐ đầu ra
│       │   │   │   └── incoming/   ← HĐ đầu vào
│       │   │   ├── ar/             ← Phải thu
│       │   │   ├── ap/             ← Phải trả
│       │   │   ├── cash/           ← Ngân quỹ
│       │   │   │   ├── funds/      ← Quỹ tiền mặt
│       │   │   │   └── banks/      ← Tài khoản ngân hàng
│       │   │   ├── sales/          ← Bán hàng
│       │   │   │   ├── quotes/     ← Báo giá
│       │   │   │   └── orders/     ← Đơn hàng
│       │   │   ├── inventory/      ← Hàng tồn kho
│       │   │   │   ├── products/   ← Sản phẩm
│       │   │   │   ├── warehouses/ ← Kho hàng
│       │   │   │   └── moves/      ← Phiếu nhập/xuất
│       │   │   ├── hr/             ← Nhân sự & Lương
│       │   │   │   ├── employees/  ← Hồ sơ nhân viên
│       │   │   │   └── payroll/    ← Bảng lương
│       │   │   ├── assets/         ← Tài sản cố định
│       │   │   ├── tax/            ← Khai báo thuế
│       │   │   │   ├── vat/        ← Thuế GTGT
│       │   │   │   ├── cit/        ← Thuế TNDN
│       │   │   │   └── pit/        ← Thuế TNCN
│       │   │   └── reports/        ← Báo cáo
│       │   └── api/
│       │       ├── auth/[...nextauth]/ ← NextAuth
│       │       ├── trpc/[trpc]/    ← tRPC handler
│       │       └── webhooks/
│       │           └── tct/        ← TCT callbacks
│       ├── components/
│       │   ├── layout/             ← Sidebar, Header, Breadcrumb
│       │   ├── ui/                 ← Base UI components
│       │   ├── forms/              ← Form components
│       │   ├── tables/             ← Table components
│       │   └── charts/             ← Chart components
│       ├── lib/
│       │   ├── auth.ts             ← NextAuth config
│       │   ├── trpc.ts             ← tRPC client
│       │   └── utils.ts            ← Helpers
│       └── server/
│           ├── db.ts               ← Prisma client singleton
│           ├── auth.ts             ← Auth helpers
│           ├── routers/            ← tRPC routers (1 file/module)
│           │   ├── _app.ts         ← Root router
│           │   ├── gl.ts
│           │   ├── invoice.ts
│           │   ├── ar.ts
│           │   ├── ap.ts
│           │   ├── cash.ts
│           │   ├── sales.ts
│           │   ├── inventory.ts
│           │   ├── hr.ts
│           │   ├── assets.ts
│           │   ├── tax.ts
│           │   └── reports.ts
│           └── services/           ← Business logic
│               ├── accounting/
│               ├── invoice/
│               ├── payroll/
│               └── tax/
│
├── packages/
│   ├── db/                         ← Prisma package
│   │   ├── prisma/
│   │   │   ├── schema.prisma       ← Full DB schema
│   │   │   ├── migrations/         ← DB migrations
│   │   │   └── seed/
│   │   │       ├── index.ts
│   │   │       └── tt200-accounts.ts ← 300 tài khoản TT200
│   │   └── src/
│   │       └── index.ts            ← Export Prisma client
│   │
│   ├── tct-sdk/                    ← TCT Integration SDK
│   │   └── src/
│   │       ├── index.ts            ← Main client
│   │       ├── types.ts            ← Types & interfaces
│   │       ├── xml-builder.ts      ← XML generator TT78
│   │       ├── signer.ts           ← Ký số (USB + Soft)
│   │       ├── client.ts           ← HTTP client
│   │       └── validators.ts       ← Schema validation
│   │
│   ├── ui/                         ← Shared UI components
│   │   └── src/
│   │       └── components/
│   │
│   └── config/                     ← Shared configs
│       ├── eslint/
│       ├── typescript/
│       └── tailwind/
│
├── docker/
│   ├── docker-compose.yml          ← Dev environment
│   ├── docker-compose.prod.yml     ← Production (hybrid)
│   ├── nginx/
│   │   └── nginx.conf
│   └── postgres/
│       └── init.sql
│
├── scripts/
│   └── setup.sh                    ← First-time setup script
│
├── docs/                           ← Tài liệu
│   ├── 01-tong-quan.md             ← (file này)
│   ├── 02-database-schema.md
│   ├── 03-api-design.md
│   ├── 04-phan-he-chi-tiet.md
│   ├── 05-tct-integration.md       ← (để sau)
│   └── 06-deployment.md
│
├── package.json                    ← Workspace root
├── turbo.json
├── pnpm-workspace.yaml
├── .env.example
└── README.md
```

---

## 7. Roles & Phân Quyền (RBAC)

| Role | Mô tả | Quyền chính |
|------|-------|-------------|
| `SUPER_ADMIN` | Quản trị hệ thống | Tất cả |
| `ADMIN` | Quản lý công ty | Quản lý user, cấu hình |
| `CHIEF_ACCOUNTANT` | Kế toán trưởng | Duyệt bút toán, báo cáo, lương |
| `ACCOUNTANT` | Kế toán viên | Nhập bút toán, hóa đơn, ngân quỹ |
| `WAREHOUSE` | Kế toán kho | Nhập/xuất kho, kiểm kê |
| `HR` | Nhân sự | Hồ sơ nhân viên, bảng lương |
| `SALES` | Kinh doanh | Báo giá, đơn hàng |
| `VIEWER` | Xem báo cáo | Chỉ xem dashboard, báo cáo |

---

## 8. Lộ Trình Phát Triển

### Phase 1 — Foundation (Tuần 1–4)
- [x] Tài liệu tổng quan
- [ ] Database schema
- [ ] Docker Compose setup
- [ ] Next.js + Auth setup
- [ ] GL module (tài khoản + bút toán + sổ cái)

### Phase 2 — Core Accounting (Tuần 5–8)
- [ ] Hóa đơn điện tử (quản lý, chưa kết nối TCT)
- [ ] AR/AP module
- [ ] Ngân quỹ module
- [ ] Import sao kê ngân hàng

### Phase 3 — Operations (Tuần 9–11)
- [ ] Hàng tồn kho
- [ ] Bán hàng (SO flow)
- [ ] Tài sản cố định

### Phase 4 — HR & Tax (Tuần 12–14)
- [ ] Nhân sự & Lương
- [ ] Khai báo thuế (GTGT, TNDN, TNCN)
- [ ] Export XML nộp TCT

### Phase 5 — Reports & Polish (Tuần 15–16)
- [ ] Dashboard CEO
- [ ] Báo cáo tài chính TT200
- [ ] Export PDF/Excel

### Phase 6 — TCT Integration (Sau Phase 5)
- [ ] TCT SDK development
- [ ] Ký số hóa đơn
- [ ] Kết nối eTax API
- [ ] UAT với môi trường test TCT

---

## 9. Yêu Cầu Pháp Lý & Tuân Thủ

| Quy định | Áp dụng |
|----------|---------|
| TT 200/2014/TT-BTC | Hệ thống tài khoản, Báo cáo tài chính |
| TT 78/2021/TT-BTC | Hóa đơn điện tử (định dạng XML, ký số) |
| NĐ 123/2020/NĐ-CP | Quy định về hóa đơn, chứng từ |
| TT 45/2013/TT-BTC | Quản lý, sử dụng TSCĐ |
| Luật Bảo hiểm xã hội | Tính BHXH/BHYT/BHTN |
| Luật Thuế TNCN | Tính, khấu trừ, khai báo thuế TNCN |
| Nghị định 218/2013/NĐ-CP | Thuế TNDN |
| Luật Thuế GTGT | Khai báo, khấu trừ VAT |
