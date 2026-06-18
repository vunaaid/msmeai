# VietKeto — Hệ Thống Kế Toán Startup Việt Nam

> Giải pháp kế toán toàn diện cho startup 10–50 nhân viên  
> Tuân thủ TT200/2014, TT78/2021, và các quy định thuế Việt Nam hiện hành

---

## 📦 Tech Stack

| Layer | Công nghệ |
|-------|-----------|
| Framework | Next.js 14 + TypeScript |
| UI | Ant Design 5 + Tailwind CSS |
| API | tRPC v11 |
| ORM | Prisma 5 |
| Database | PostgreSQL 15 |
| Cache/Queue | Redis 7 + BullMQ |
| Auth | NextAuth.js v5 |
| File Storage | MinIO |
| Deploy | Docker Compose (Hybrid) |
| Monorepo | Turborepo |

---

## 📂 Cấu Trúc Thư Mục

```
vietketo/
├── apps/web/          # Next.js Application
├── packages/
│   ├── db/            # Prisma Schema & Migrations
│   ├── tct-sdk/       # TCT eTax Integration SDK
│   ├── ui/            # Shared UI Components
│   └── config/        # Shared Configs
├── docker/            # Docker Compose files
├── docs/              # Tài liệu dự án
└── scripts/           # Scripts tiện ích
```

---

## 📋 Phân Hệ

| # | Phân hệ | Trạng thái |
|---|---------|-----------|
| 01 | Kế toán tổng hợp (GL) | 🔄 Đang phát triển |
| 02 | Hóa đơn điện tử | 🔄 Đang phát triển |
| 03 | Phải thu (AR) | ⏳ Chờ |
| 04 | Phải trả (AP) | ⏳ Chờ |
| 05 | Ngân quỹ | ⏳ Chờ |
| 06 | Bán hàng | ⏳ Chờ |
| 07 | Hàng tồn kho | ⏳ Chờ |
| 08 | Nhân sự & Lương | ⏳ Chờ |
| 09 | Tài sản cố định | ⏳ Chờ |
| 10 | Khai báo thuế | ⏳ Chờ |
| 11 | Báo cáo & Dashboard | ⏳ Chờ |
| **12** | **Hợp đồng điện tử** | ⏳ Chờ |
| TCT | Kết nối TCT eTax | 📅 Phase 6 |

---

## 📚 Tài Liệu

| Tài liệu | Mô tả |
|----------|-------|
| [01-tong-quan.md](docs/01-tong-quan.md) | Tổng quan dự án & kiến trúc |
| [02-database-schema.md](docs/02-database-schema.md) | Schema database (Prisma) |
| [03-api-design.md](docs/03-api-design.md) | Thiết kế API (tRPC routers) |
| [04-phan-he-chi-tiet.md](docs/04-phan-he-chi-tiet.md) | Đặc tả 11 phân hệ |
| [05-tct-integration.md](docs/05-tct-integration.md) | Tích hợp TCT eTax (Phase 6) |
| [06-deployment.md](docs/06-deployment.md) | Hướng dẫn triển khai |
| [07-hop-dong-dien-tu.md](docs/07-hop-dong-dien-tu.md) | Module 12: Hợp đồng điện tử + eSign |

---

## 🚀 Quick Start (Development)

```bash
# 1. Clone repo
git clone https://github.com/yourorg/vietketo.git
cd vietketo

# 2. Install dependencies
pnpm install

# 3. Start infrastructure
docker compose -f docker/docker-compose.yml up -d

# 4. Setup database
pnpm db:migrate
pnpm db:seed

# 5. Start dev server
pnpm dev
# → http://localhost:3000
```

---

## 🗓️ Roadmap

- **Phase 1** (Tuần 1–4): Foundation — Monorepo, DB, Auth, GL
- **Phase 2** (Tuần 5–8): Core Accounting — Invoice, AR/AP, Cash
- **Phase 3** (Tuần 9–11): Operations — Inventory, Sales, Assets
- **Phase 4** (Tuần 12–14): HR & Tax
- **Phase 5** (Tuần 15–16): Reports & Dashboard
- **Phase 6** (Sau Phase 5): TCT eTax Integration

---

## ⚖️ Pháp Lý & Tuân Thủ

- TT 200/2014/TT-BTC — Hệ thống tài khoản kế toán
- TT 78/2021/TT-BTC — Hóa đơn điện tử
- TT 45/2013/TT-BTC — Tài sản cố định & khấu hao
- Luật Thuế GTGT, TNDN, TNCN — Khai báo và nộp thuế
- Luật BHXH — Tính và nộp BHXH/BHYT/BHTN

---

*VietKeto — Built for Vietnamese startups 🇻🇳*
