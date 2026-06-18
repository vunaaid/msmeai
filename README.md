# vSME

> **AI-native ERP cho doanh nghiệp nhỏ & siêu nhỏ Việt Nam** — Kế toán · Nhân sự · Bán hàng · Hóa đơn & Thuế, vận hành bằng AI agents.
>
> *AI-native ERP for Vietnamese micro & small businesses.*

![status](https://img.shields.io/badge/status-source--available-blue) ![license](https://img.shields.io/badge/license-vSME--SAL-orange)

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 15 + TypeScript 5 |
| UI | Tailwind CSS 4 |
| API | REST (Next.js Route Handlers) + Zod validation |
| ORM | Prisma 6 |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis 7 + BullMQ 5 |
| Auth | NextAuth.js v5 + RBAC |
| File Storage | MinIO |
| Monorepo | Turborepo + pnpm |

---

## Cấu Trúc

```
vSME/
├── apps/
│   ├── web/          # Next.js 15 App (Port 3000)
│   └── ai-worker/    # BullMQ Worker (standalone)
├── packages/
│   ├── db/           # Prisma schema + client
│   ├── modules/      # Module Registry
│   └── audit/        # Audit Log + Event Bus
├── docker/           # Docker Compose
└── docs/             # Tài liệu thiết kế
```

---

## Quick Start

### Yêu cầu
- Node.js >= 22
- Docker + Docker Compose
- pnpm (tự cài qua script)

### 1. Clone & Setup

```bash
git clone <repo>
cd vSME

# Cài pnpm (nếu chưa có)
curl -fsSL https://get.pnpm.io/install.sh | sh -
source ~/.bashrc

# Setup lần đầu (install + infra + migrate + seed)
make setup
```

### 2. Chạy dev

```bash
make dev
```

Mở http://localhost:3000

### 3. Đăng nhập

| Field | Value |
|-------|-------|
| Email | `admin@vsme.local` |
| Password | `Admin@vSME2026!` |

---

## Commands

```bash
make help         # Xem tất cả commands
make infra-up     # Khởi động PostgreSQL + Redis + MinIO
make infra-down   # Dừng infrastructure
make db-migrate   # Chạy DB migrations
make db-seed      # Seed default data
make db-studio    # Mở Prisma Studio (localhost:5555)
make build        # Build tất cả packages
```

---

## Checklist Deploy (Group 0: Foundation)

```
✅ PostgreSQL 16 — docker/docker-compose.yml
✅ Redis 7 — docker/docker-compose.yml
✅ MinIO — docker/docker-compose.yml
✅ .env configured — .env.example
✅ Prisma migrations — packages/db/prisma/schema.prisma
✅ Seed data — packages/db/src/seed.ts
✅ NextAuth.js v5 + RBAC — apps/web/src/lib/auth/
✅ Module Registry — packages/modules/
✅ Audit Log middleware — packages/audit/
✅ Event Bus (BullMQ) — packages/audit/src/event-bus.ts
✅ Notification Service — apps/web/src/lib/services/notification.service.ts
✅ File Storage (MinIO) — apps/web/src/lib/services/file-storage.service.ts
✅ Dynamic Sidebar — apps/web/src/components/layout/sidebar.tsx
✅ REST APIs — apps/web/src/app/api/
```

---

## Modules

| # | Module | Key | Tier | Status |
|---|--------|-----|------|--------|
| 0 | Foundation | `foundation` | — | ✅ Bắt buộc |
| 0 | Admin | `admin` | core | ✅ Bắt buộc |
| 1 | Kế Toán Tổng Hợp | `gl` | core | 🟡 Chờ Phase 2 |
| 2 | Hóa Đơn Điện Tử | `invoice` | core | 🟡 Chờ Phase 2 |
| 3 | Phải Thu | `ar` | core | 🟡 Chờ Phase 2 |
| 4 | Phải Trả | `ap` | core | 🟡 Chờ Phase 2 |
| 5 | Ngân Quỹ | `cash` | core | 🟡 Chờ Phase 2 |
| 6 | Bán Hàng & CRM | `sales` | extended | 🟡 Chờ Phase 3 |
| 7 | Hàng Tồn Kho | `inventory` | extended | 🟡 Chờ Phase 3 |
| 8 | Nhân Sự & Lương | `hr` | extended | 🟡 Chờ Phase 3 |
| 9 | Tài Sản Cố Định | `assets` | extended | 🟡 Chờ Phase 3 |
| 10 | Khai Báo Thuế | `tax` | core | 🟡 Chờ Phase 2 |
| 11 | Báo Cáo & Dashboard | `reports` | core | 🟡 Chờ Phase 4 |
| 12 | Hợp Đồng Điện Tử | `contracts` | extended | 🟡 Chờ Phase 3 |
| 13 | AI Agent System | `ai-agents` | ai | 🟡 Chờ Phase 1 |

---

## 📄 License

vSME là phần mềm **source-available** — **KHÔNG phải open source**.
vSME is **source-available** software — **NOT open source**.

- ✅ **Miễn phí / Free** cho tổ chức có **≤ 4 người dùng thật** (agent AI không tính),
  tự host, không dùng để cạnh tranh. / for organizations with **≤ 4 Real Users**
  (AI agents excluded), self-hosted, non-competing.
- 💼 **Cần license thương mại / Commercial license required** nếu **≥ 5 người dùng thật**
  hoặc dùng để cạnh tranh. / for **≥ 5 Real Users** or any competing use.
- 🤝 Theo cơ chế **honor system** (không khóa tính năng). / honor system, never blocks features.

Giấy phép: [vSME Source-Available License (vSME-SAL)](LICENSE) / [bản dịch tiếng Việt](LICENSE.vi.md) ·
Tóm tắt: [LICENSING.md](LICENSING.md) / [LICENSING.vi.md](LICENSING.vi.md) ·
Đóng góp: [CONTRIBUTING.md](CONTRIBUTING.md) · [CLA.md](CLA.md) · [SECURITY.md](SECURITY.md)

Mua license thương mại / Commercial license: **vuna.aid@gmail.com**

© 2026 Vũ Nguyễn Anh
