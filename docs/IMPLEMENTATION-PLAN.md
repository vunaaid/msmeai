# 📐 vSME — Kế Hoạch Triển Khai Hệ Thống Quản Lý Công Ty SME

> **Phiên bản:** 1.2  
> **Ngày tạo:** 2026-05-27  
> **Cập nhật lần cuối:** 2026-05-27  
> **Trạng thái:** 🔄 Đang triển khai — Phase 0 ✅ + Phase 1 AI System ✅

---

## 🎯 Tổng Quan

**vSME** = Nền tảng quản lý công ty SME tích hợp:
- **SMEAccouting** — 12 phân hệ kế toán/nghiệp vụ (TT200, TT78)
- **Company AI System** — Hệ thống AI agents đa tầng theo org chart
- **Modular** — Mỗi phân hệ có thể bật/tắt độc lập
- **Multi-LLM** — Claude + Gemini + Self-hosted (Ollama)
- **Dual AI Mode** — Full AI (tự động) hoặc AI Assistant (hỗ trợ)

---

## 🏗️ Kiến Trúc Tổng Thể

```
┌─────────────────────────────────────────────────────────────────────┐
│                        vSME PLATFORM                                 │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │               MODULE REGISTRY & CONFIG ENGINE                 │   │
│  │   Bật/tắt từng phân hệ · Feature flags · Tenant config       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    PHÂN HỆ NGHIỆP VỤ                         │    │
│  │  GL │ Invoice │ AR │ AP │ Cash │ Sales │ Inventory │ HR      │    │
│  │  Assets │ Tax │ Reports │ Contracts │ CRM │ Procurement       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    AI AGENT LAYER                             │    │
│  │  Orchestrator · HĐQT · C-Suite · Trưởng Phòng · Nhân Viên   │    │
│  │  Mode: FULL (tự động) | ASSISTANT (hỗ trợ)                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              MULTI-LLM PROVIDER LAYER                         │    │
│  │  Claude (Anthropic) │ Gemini (Google) │ Ollama (Self-hosted) │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                 PLATFORM FOUNDATION                           │    │
│  │  Auth/RBAC · Audit Log · Notification · File Storage · Queue │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📦 14 Phân Hệ

| # | Phân hệ | Module Key | Tier | Dependencies |
|---|---------|-----------|------|-------------|
| 01 | Kế toán tổng hợp (GL) | `gl` | core | — |
| 02 | Hóa đơn điện tử | `invoice` | core | `gl` |
| 03 | Phải thu (AR) | `ar` | core | `gl` |
| 04 | Phải trả (AP) | `ap` | core | `gl` |
| 05 | Ngân quỹ | `cash` | core | `gl` |
| 06 | Bán hàng & CRM | `sales` | extended | `gl`, `invoice` |
| 07 | Hàng tồn kho | `inventory` | extended | `gl`, `sales` |
| 08 | Nhân sự & Lương | `hr` | extended | `gl` |
| 09 | Tài sản cố định | `assets` | extended | `gl` |
| 10 | Khai báo thuế | `tax` | core | `gl`, `invoice` |
| 11 | Báo cáo & Dashboard | `reports` | core | `gl` |
| 12 | Hợp đồng điện tử | `contracts` | extended | — |
| 13 | AI Agent System | `ai-agents` | ai | — |
| 14 | Cấu hình & Quản trị | `admin` | core | — |

---

## 💻 Tech Stack

| Layer | Tech | Ghi chú |
|-------|------|---------|
| Framework | Next.js 15 + TypeScript 5 | App Router |
| UI | **Tailwind CSS 4** + shadcn/ui | Thay Ant Design — lightweight, headless |
| Icons | Lucide React | |
| API | REST API (Next.js Route Handlers) | OpenAPI spec + Zod validation |
| ORM | Prisma 6 | PostgreSQL |
| Database | PostgreSQL 16 | On-premise |
| Cache/Queue | Redis 7 + BullMQ 5 | AI task queue |
| Auth | NextAuth.js v5 | RBAC + multi-tenant |
| File Storage | MinIO | Certs, PDFs, exports |
| **LLM Primary** | Claude Sonnet 4.6 / Opus 4.7 | Anthropic API |
| **LLM Secondary** | Gemini 2.0 Flash / 2.5 Pro | Google AI |
| **LLM Self-hosted** | Ollama (Llama3, Qwen2.5...) | Local / private data |
| Charts | Apache ECharts 5 | Dashboard |
| eSign | node-forge + pkcs11js | USB Token + Soft Cert |
| Container | Docker + Docker Compose | Hybrid deploy |
| Monorepo | Turborepo + pnpm | |

---

## 🤖 AI System Design

### Dual Mode

```
AI_MODE = 'full' | 'assistant'

FULL MODE:
  - AI tự thực thi trong ngưỡng thẩm quyền
  - Tự escalate khi vượt ngưỡng
  - Con người chỉ review định kỳ

ASSISTANT MODE:
  - AI đề xuất, tạo draft, phân tích
  - Mọi action cần con người xác nhận
  - Không tự thực thi bất kỳ điều gì
```

### Multi-LLM Router

```typescript
// Provider được chọn theo:
// 1. Cấu hình per-agent trong skill.md
// 2. Task complexity (complex → Claude, fast → Gemini)
// 3. Data sensitivity (sensitive → self-hosted)
// 4. Fallback nếu provider lỗi

interface LLMProvider {
  name: 'claude' | 'gemini' | 'ollama' | 'lmstudio';
  model: string;
  endpoint?: string;  // Self-hosted
  apiKey?: string;
  priority: number;
}
```

### Agent Hierarchy (26 agents)
```
Orchestrator (1)
  └── HĐQT (2): Chủ tịch, Thành viên
  └── C-Suite (8): CEO, CFO, KTT, CMO, GĐ KD, GĐ PR, CTO, CHRO
  └── Managers (6): Trưởng phòng TC-KT, MKT, KD, PR, KT, NS
  └── Staff (6): NV TC-KT, MKT, KD, PR, KT, NS
  └── Special (3): Hợp đồng TC-KT, Phòng TC-KT, Phòng KD
```

---

## 📂 Cấu Trúc Monorepo

```
vSME/
├── apps/
│   ├── web/                        # Next.js 15 App
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── admin/          # Module config, users, settings
│   │   │   │   ├── ai/             # AI Console (agents, tasks, approvals)
│   │   │   │   ├── gl/             # General Ledger
│   │   │   │   ├── invoice/        # Hóa đơn điện tử
│   │   │   │   ├── ar/             # Phải thu
│   │   │   │   ├── ap/             # Phải trả
│   │   │   │   ├── cash/           # Ngân quỹ
│   │   │   │   ├── sales/          # Bán hàng + CRM
│   │   │   │   ├── inventory/      # Hàng tồn kho
│   │   │   │   ├── hr/             # Nhân sự & Lương
│   │   │   │   ├── assets/         # Tài sản cố định
│   │   │   │   ├── tax/            # Khai báo thuế
│   │   │   │   ├── reports/        # Báo cáo
│   │   │   │   └── contracts/      # Hợp đồng điện tử
│   │   │   └── api/
│   │   │       ├── [module]/       # REST endpoints per module
│   │   │       ├── ai/             # AI Agent endpoints
│   │   │       └── webhooks/       # TCT, eSign callbacks
│   │   └── server/
│   │       ├── routes/             # REST route handlers
│   │       ├── services/           # Business logic per module
│   │       └── ai/
│   │           ├── orchestrator.ts
│   │           ├── agents/         # 1 file per agent
│   │           └── skill-loader.ts
│   │
│   └── ai-worker/                  # BullMQ Worker (standalone)
│       ├── handlers/               # Task handlers
│       └── processors/             # Per-agent processors
│
├── packages/
│   ├── db/                         # Prisma schema + migrations
│   ├── modules/                    # Module Registry
│   │   ├── registry.ts
│   │   ├── guard.ts                # Module access middleware
│   │   └── types.ts
│   ├── llm/                        # Multi-LLM Provider (NEW)
│   │   ├── providers/
│   │   │   ├── claude.ts           # Anthropic SDK
│   │   │   ├── gemini.ts           # Google AI SDK
│   │   │   └── ollama.ts           # Ollama HTTP client
│   │   ├── router.ts               # Provider selection logic
│   │   └── types.ts
│   ├── ai-sdk/                     # AI Agent SDK (NEW)
│   │   ├── skill-engine.ts         # Parse + execute .skill.md
│   │   ├── authority-check.ts      # Thẩm quyền engine
│   │   ├── escalation.ts           # Escalation chain builder
│   │   └── audit.ts                # AI action logger
│   ├── tct-sdk/                    # TCT eTax integration
│   ├── ui/                         # Shared UI components
│   └── config/                     # ESLint, TS, Tailwind
│
├── docs/
│   ├── IMPLEMENTATION-PLAN.md      # File này
│   ├── ai-company-management-workflow.md
│   ├── company-ai-system/          # Skill files
│   └── vietketo/                   # VietKeto specs
│
└── docker/
    ├── docker-compose.yml          # Dev
    ├── docker-compose.prod.yml     # Production (hybrid)
    └── nginx/
```

---

## 🗄️ Database Schema

```
Core (luôn có):
  companies, users, user_roles, permissions
  module_configs (key, enabled, settings)
  audit_logs (who, what, when, data_before, data_after)
  notifications, approval_requests

Module GL:
  chart_of_accounts, fiscal_years, fiscal_periods
  journals, journal_lines

Module Invoice:
  invoices, invoice_items, tct_responses

Module AR/AP:
  receivables, payables, payment_records

Module Cash:
  funds, bank_accounts, bank_transactions

Module Sales:
  leads, contacts, companies_crm, quotes, orders

Module Inventory:
  products, categories, warehouses, stock_moves

Module HR:
  employees, labor_contracts, attendance
  payroll_periods, payroll_items, insurance_records

Module Assets:
  fixed_assets, depreciation_schedules

Module Tax:
  tax_periods, vat_declarations, cit_declarations

Module Contracts:
  contracts, contract_parties, esign_events

Module AI:
  ai_tasks, ai_approvals, ai_escalations, agent_logs
  llm_provider_configs, skill_configs
```

---

## 🗓️ Lộ Trình Triển Khai (16 Tuần)

### Phase 0: Foundation (Tuần 1–2) ✅ HOÀN THÀNH
- [x] Khởi tạo monorepo Turborepo + pnpm
- [x] Docker Compose (PostgreSQL 16, Redis 7, MinIO)
- [x] Next.js 15 scaffold + App Router
- [x] NextAuth.js v5 + RBAC (theo org chart)
- [x] Module Registry (`packages/modules/`)
- [x] Core DB schema + migrations (Auth, RBAC, ModuleConfig, AuditLog, DomainEvent, FileRecord, Notification, ApprovalRequest)
- [x] REST API pattern + Zod validation
- [x] Dynamic sidebar (ẩn/hiện theo module config)
- [x] Audit log middleware (Prisma extension)
- [x] Admin pages (modules, users, audit log)
- [x] Login UI + auth flow

### Phase 1: AI Agent System (Tuần 3–6) ✅ HOÀN THÀNH
- [x] `packages/llm/` — Claude (Sonnet/Opus + prompt caching) + Gemini (2.0 Flash/2.5 Pro) + Ollama adapters
- [x] LLM Router — primary/fallback, auto-failover
- [x] `packages/ai-sdk/` — Skill Engine (Cách B, structured parse gray-matter), Authority Checker, Escalation Engine, Context Builder, Agent Runner
- [x] Prisma AI models: `ai_sessions`, `ai_messages`, `ai_tasks`, `ai_approval_requests`, `llm_usage_logs`
- [x] `apps/ai-worker/` — AI task handler, approve/reject flow, re-enqueue after approval
- [x] **24 skill files** (`/skills/*.skill.md`): Orchestrator, 2 HĐQT, 7 C-Suite (CEO, CFO, COO, CMO, CTO, CHRO, CLO), 6 Managers, 5 Staff, 3 Special
- [x] Approval workflow — AI creates approval request → notify approver → approve/reject → re-queue
- [x] Escalation engine — findEscalationTarget → createApprovalRequest → notify
- [x] AI Console UI: `/ai` (agent selection + stats), `/ai/chat/[agentId]` (multi-turn chat), `/ai/approvals` (inbox), `/ai/tasks` (task queue), `/ai/admin` (usage stats)
- [x] REST API: `/api/ai/agents`, `/api/ai/sessions`, `/api/ai/sessions/[id]/messages`, `/api/ai/approvals`, `/api/ai/approvals/[id]`, `/api/ai/tasks`, `/api/ai/usage`
- [x] **Dual mode:** Full AI ↔ Assistant mode (via company.ai_mode + applyModeOverride)
- [x] LLM usage logging per request (provider, model, tokens, cost, latency)
- [ ] LLM provider config UI (chọn provider per-agent) — TODO Phase 1.5
- [ ] CPO + 1 more staff skill file — TODO (khi build Product module)

### Phase 2: Core Accounting (Tuần 7–10)
- [ ] GL Module (300 TK TT200, bút toán kép, kết chuyển)
- [ ] Invoice Module (HĐ đầu vào/ra, PDF, bút toán tự động)
- [ ] AR Module (công nợ, aging report)
- [ ] AP Module (công nợ NCC, PO matching)
- [ ] Cash Module (quỹ + ngân hàng, import sao kê)
- [ ] Tax Module cơ bản (GTGT, TNDN, TNCN)
- [ ] AI integration: CFO + KTT agents → accounting actions

### Phase 3: Operations (Tuần 11–14)
- [ ] Sales & CRM (Lead → Quote → Order → Invoice)
- [ ] Inventory (sản phẩm, kho, nhập/xuất)
- [ ] HR & Payroll (hồ sơ, lương, BHXH/BHYT/BHTN)
- [ ] Fixed Assets (TSCĐ, khấu hao TT45)
- [ ] Contracts (soạn thảo, eSign, lưu trữ)
- [ ] AI integration: Sales Agent, HR Agent

### Phase 4: Reports + TCT (Tuần 15–16)
- [ ] Reports Module (B01/B02/B03/B09-DN, CĐSPS)
- [ ] CEO Dashboard (KPI real-time, anomaly, forecast)
- [ ] TCT eTax SDK (hoadondientu.gdt.gov.vn, ký số)
- [ ] Export PDF/Excel toàn bộ reports
- [ ] AI Reports Agent (tự tổng hợp, phát hiện bất thường)

---

## 🔐 RBAC Matrix

| Role | GL | Invoice | AR/AP | Cash | Sales | HR | Tax | AI Agents | Admin |
|------|----|---------|-------|------|-------|----|-----|-----------|-------|
| SUPER_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CEO/C-Suite | 👁 | 👁 | 👁 | 👁 | ✅ | 👁 | 👁 | ✅ | ✅ |
| CFO/KTT | ✅ | ✅ | ✅ | ✅ | 👁 | 💰 | ✅ | ✅ | — |
| ACCOUNTANT | ✏️ | ✏️ | ✏️ | ✏️ | — | — | ✏️ | — | — |
| HR | — | — | — | — | — | ✅ | — | 🤖 | — |
| SALES | — | 👁 | — | — | ✅ | — | — | 🤖 | — |
| VIEWER | 👁 | 👁 | 👁 | 👁 | 👁 | — | 👁 | 👁 | — |

*✅ Full · ✏️ Edit · 👁 View · 💰 Payroll only · 🤖 Agent chat only*

---

## ⚙️ Nguyên Tắc Thiết Kế

1. **Module isolation** — Tắt module = tắt route + UI + business logic
2. **AI async** — Mọi AI task qua BullMQ, không block UI
3. **Audit everything** — Prisma middleware ghi log mọi write
4. **Skill file as config** — AI behavior từ `.skill.md`, không hard-code
5. **Human-in-the-loop** — Vượt ngưỡng → approval, không tự thực thi
6. **Graceful degradation** — AI tắt → ERP vẫn chạy bình thường
7. **Multi-LLM fallback** — Provider lỗi → tự failover sang provider kế tiếp
8. **Vietnamese compliance** — TT200, TT78, TT45, Luật thuế TNCN/TNDN/GTGT

---

*Kế hoạch này là tài liệu sống — cập nhật khi có quyết định mới.*
