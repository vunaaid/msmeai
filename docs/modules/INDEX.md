# vSME — Bản Đồ Hệ Thống (Module Index)

> **23 modules** chia thành 8 nhóm.  
> Mỗi module có thể deploy độc lập theo thứ tự phụ thuộc.  
> Đọc file spec tương ứng để biết chức năng chi tiết, entities, API, và điều kiện deploy.

---

## Sơ Đồ Phụ Thuộc Tổng Thể

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    GROUP 0: FOUNDATION                                   │
│         Auth/RBAC · Module Registry · Audit/Events · Platform           │
│                    (Tất cả đều cần nhóm này)                             │
└──────────────┬────────────────────────────────┬────────────────────────-┘
               │                                │
    ┌──────────▼──────────┐          ┌──────────▼──────────┐
    │   GROUP 1: KẾ TOÁN  │          │  GROUP 4: QUẢN TRỊ  │
    │  GL (core)          │          │  Documents          │
    │  Invoice → GL       │          │  Approvals          │
    │  AR → GL,Invoice    │          │  Projects           │
    │  AP → GL            │          │  Performance → HR   │
    │  Cash → GL          │          │  Meetings           │
    │  Tax → GL,Invoice   │          └─────────────────────┘
    │  Assets → GL        │
    └──────────┬──────────┘          ┌──────────────────────┐
               │                    │   GROUP 3: NHÂN SỰ   │
    ┌──────────▼──────────┐         │   Recruitment        │
    │  GROUP 2: VẬN HÀNH  │         │   HR/Payroll → GL    │
    │  Vendors            │         └──────────────────────┘
    │  Procurement→Vendors│
    │  Sales/CRM          │         ┌──────────────────────┐
    │  Inventory          │         │   GROUP 7: HỖ TRỢ    │
    │  Contracts          │         │   Support            │
    └─────────────────────┘         └──────────────────────┘
               │
    ┌──────────▼───────────────────────────────────────────┐
    │              GROUP 5: BÁO CÁO & GIÁM SÁT            │
    │    Reports (đọc từ mọi module)                        │
    │    Visibility Engine (lắng nghe mọi events)           │
    └──────────────────────────────────────────────────────┘
               │
    ┌──────────▼───────────────────────────────────────────┐
    │                  GROUP 6: AI LAYER                    │
    │    packages/llm (Multi-LLM Provider)                  │
    │    packages/ai-sdk (Skill Engine, Authority Check)    │
    │    apps/ai-worker (BullMQ Worker)                     │
    │    AI Agent System UI (26 agents)                     │
    └──────────────────────────────────────────────────────┘
```

---

## Danh Sách 23 Modules

### Group 0: Foundation
| Module | Key | File Spec | Standalone |
|--------|-----|-----------|-----------|
| Auth & RBAC | `auth` | [00-foundation.md](./00-foundation.md) | ✅ Bắt buộc đầu tiên |
| Module Registry | `registry` | [00-foundation.md](./00-foundation.md) | ✅ |
| Audit & Event Bus | `audit` | [00-foundation.md](./00-foundation.md) | ✅ |
| Platform Services | `platform` | [00-foundation.md](./00-foundation.md) | ✅ |

### Group 1: Kế Toán
| # | Module | Key | File Spec | Phụ thuộc | Standalone |
|---|--------|-----|-----------|-----------|-----------|
| 01 | Kế toán tổng hợp | `gl` | [01-accounting.md](./01-accounting.md) | Foundation | ✅ |
| 02 | Hóa đơn điện tử | `invoice` | [01-accounting.md](./01-accounting.md) | GL | ✅ |
| 03 | Phải thu (AR) | `ar` | [01-accounting.md](./01-accounting.md) | GL | ✅ |
| 04 | Phải trả (AP) | `ap` | [01-accounting.md](./01-accounting.md) | GL | ✅ |
| 05 | Ngân quỹ | `cash` | [01-accounting.md](./01-accounting.md) | GL | ✅ |
| 06 | Khai báo thuế | `tax` | [01-accounting.md](./01-accounting.md) | GL, Invoice | ✅ |
| 07 | Tài sản cố định | `assets` | [01-accounting.md](./01-accounting.md) | GL | ✅ |

### Group 2: Vận Hành
| # | Module | Key | File Spec | Phụ thuộc | Standalone |
|---|--------|-----|-----------|-----------|-----------|
| 08 | Nhà cung cấp | `vendors` | [02-operations.md](./02-operations.md) | Foundation | ✅ |
| 09 | Mua hàng | `procurement` | [02-operations.md](./02-operations.md) | Vendors | ✅ |
| 10 | Bán hàng & CRM | `sales` | [02-operations.md](./02-operations.md) | Foundation | ✅ |
| 11 | Hàng tồn kho | `inventory` | [02-operations.md](./02-operations.md) | Foundation | ✅ |
| 12 | Hợp đồng điện tử | `contracts` | [02-operations.md](./02-operations.md) | Foundation | ✅ |

### Group 3: Nhân Sự
| # | Module | Key | File Spec | Phụ thuộc | Standalone |
|---|--------|-----|-----------|-----------|-----------|
| 13 | Tuyển dụng | `recruitment` | [03-hr.md](./03-hr.md) | Foundation | ✅ |
| 14 | Nhân sự & Lương | `hr` | [03-hr.md](./03-hr.md) | Foundation | ✅ |

### Group 4: Quản Trị
| # | Module | Key | File Spec | Phụ thuộc | Standalone |
|---|--------|-----|-----------|-----------|-----------|
| 15 | Quản lý tài liệu | `documents` | [04-governance.md](./04-governance.md) | Foundation | ✅ |
| 16 | Phê duyệt & Workflow | `approvals` | [04-governance.md](./04-governance.md) | Foundation | ✅ |
| 17 | Dự án & Công việc | `projects` | [04-governance.md](./04-governance.md) | Foundation | ✅ |
| 18 | KPI & OKR | `performance` | [04-governance.md](./04-governance.md) | Foundation | ✅ |
| 19 | Cuộc họp & Biên bản | `meetings` | [04-governance.md](./04-governance.md) | Foundation | ✅ |

### Group 5: Báo Cáo & Giám Sát
| # | Module | Key | File Spec | Phụ thuộc | Standalone |
|---|--------|-----|-----------|-----------|-----------|
| 20 | Báo cáo & Dashboard | `reports` | [05-visibility.md](./05-visibility.md) | GL (min) | ⚠️ |
| 21 | Visibility Engine | `visibility` | [05-visibility.md](./05-visibility.md) | Foundation + ≥1 module | ⚠️ |

### Group 6: AI Layer
| # | Module | Key | File Spec | Phụ thuộc | Standalone |
|---|--------|-----|-----------|-----------|-----------|
| 22 | Multi-LLM Provider | `llm` | [06-ai.md](./06-ai.md) | Foundation | ✅ |
| 23 | AI Agent System | `ai-agents` | [06-ai.md](./06-ai.md) | Foundation, LLM | ✅ |

### Group 7: Hỗ Trợ
| # | Module | Key | File Spec | Phụ thuộc | Standalone |
|---|--------|-----|-----------|-----------|-----------|
| 24 | Dịch vụ khách hàng | `support` | [07-support.md](./07-support.md) | Foundation | ✅ |

---

## Gói Triển Khai Gợi Ý

### Gói Tối Thiểu — "Kế Toán SME" (7 modules)
```
Foundation → GL → Invoice → AR → AP → Cash → Tax
Dùng cho: công ty cần số hoá kế toán, tuân thủ TT200/TT78
```

### Gói Vận Hành — "Sales & Ops" (thêm 5 modules)
```
+ Vendors → Procurement → Sales/CRM → Inventory → Contracts
Dùng cho: cần quản lý bán hàng, mua hàng, kho
```

### Gói Nhân Sự — "HR Complete" (thêm 2 modules)
```
+ Recruitment → HR/Payroll
Dùng cho: cần quản lý nhân sự, tuyển dụng, tính lương
```

### Gói Quản Trị — "Governance" (thêm 5 modules)
```
+ Documents → Approvals → Projects → Performance → Meetings
Dùng cho: cần quản lý công việc, KPI, họp hành, phê duyệt
```

### Gói AI — "AI-Powered" (thêm 3 modules)
```
+ LLM Provider → AI Agent System → Visibility Engine
Dùng cho: muốn AI tự động hoá workflow, dashboard real-time
```

### Gói Full — "vSME Complete" (23 modules)
```
Tất cả modules + Support
Dùng cho: SME muốn nền tảng quản lý toàn diện
```

---

## Thứ Tự Deploy Khuyến Nghị

```
Tuần 1-2:   Foundation (bắt buộc)
Tuần 3-4:   AI Agent System (ưu tiên theo kế hoạch)
Tuần 5-6:   GL + Invoice
Tuần 7-8:   AR + AP + Cash
Tuần 9-10:  Tax + Assets
Tuần 11-12: Sales/CRM + Vendors + Procurement
Tuần 13-14: HR/Payroll + Recruitment
Tuần 15:    Documents + Approvals + Meetings + Projects + Performance
Tuần 16:    Reports + Visibility Engine + Support
Sau:        Inventory + Contracts + TCT Integration
```

---

## Ma Trận Tích Hợp Giữa Modules

```
              GL  Inv  AR  AP  Cash  Sales  Inv  HR  Tax  Proj  Perf  Meet  Doc  App  Vis  AI
GL             —   ←   ←   ←    ←     →    →    ←   ←     —     —     —    —    —    →    ←
Invoice        →   —   →   →    —     ←    —    —   →     —     —     —    —    —    →    ←
AR             →   ←   —   —    →     ←    —    —   —     —     —     —    —    —    →    ←
AP             →   ←   —   —    →     —    —    —   —     —     —     —    —    ←    →    ←
Cash           →   —   ←   ←    —     —    —    —   —     —     —     —    —    ←    →    ←
Sales/CRM      —   →   →   —    —     —    ←    —   —     —     ←    —    —    ←    →    ←
Inventory      →   —   —   —    —     ←    —    —   —     —     —     —    —    —    →    ←
HR/Payroll     →   —   —   —    →     —    —    —   →     —     ←    —    —    ←    →    ←
Projects       —   —   —   —    —     —    —    —   —     —     →    →    ←    ←    →    ←
Meetings       —   —   —   —    —     —    —    —   —     →     —    —    →    ←    →    ←
Visibility     ←   ←   ←   ←    ←     ←    ←    ←   ←     ←     ←    ←    ←    ←    —    →

→ = module này CUNG CẤP data cho module kia
← = module này NHẬN data từ module kia
```

---

*Mỗi file spec trong thư mục này là tài liệu đủ để một developer implement module đó độc lập.*  
*Cập nhật lần cuối: 2026-05-27*
