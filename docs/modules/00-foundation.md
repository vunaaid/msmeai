# Group 0: Foundation — Nền Tảng Hệ Thống

> Nhóm này phải được xây dựng **trước tất cả** các module khác.  
> Không module nào có thể deploy nếu thiếu Foundation.

---

## Tổng Quan

Foundation không phải một module bật/tắt — đây là **infrastructure bắt buộc** của toàn bộ platform. Gồm 4 sub-systems chạy xuyên suốt:

| Sub-system | Mô tả |
|-----------|-------|
| **Auth & RBAC** | Xác thực, phân quyền theo role và org chart |
| **Module Registry** | Bật/tắt, kiểm tra dependency các module |
| **Audit & Event Bus** | Ghi log mọi thay đổi, phát sự kiện cho các module |
| **Platform Services** | Notification, File Storage, Queue, Config |

---

## Sub-system 1: Auth & RBAC

### Chức Năng

- **Đăng nhập / Đăng xuất** — Email/password, session-based (NextAuth.js v5)
- **Multi-tenant** — 1 instance phục vụ nhiều công ty, dữ liệu hoàn toàn tách biệt
- **Quản lý người dùng** — CRUD users, gán role, đặt lại mật khẩu
- **Role hierarchy** — Phản ánh đúng org chart: board → c-suite → manager → staff
- **Permission matrix** — Mỗi role có danh sách permission cụ thể theo module
- **Resource-level access** — Không chỉ "xem được module" mà còn "xem được record nào" (VD: Sales Rep chỉ thấy deals của mình)
- **Scope inheritance** — Manager thấy data của toàn team, C-Suite thấy toàn dept

### Entities

```
Company { id, name, tax_code, settings, ai_mode, modules_config }
User    { id, company_id, email, name, role_id, department_id, is_active }
Role    { id, name, level: board|c_suite|manager|staff, permissions[] }
Permission { id, module_key, action: read|write|delete|approve, scope: self|team|dept|company }
Session { id, user_id, expires_at, device_info }
```

### API

```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/users                 (admin only)
POST   /api/users                 (admin only)
PUT    /api/users/:id
GET    /api/roles
PUT    /api/users/:id/role
```

### Điều Kiện Deploy Độc Lập

✅ Chỉ cần: PostgreSQL, Redis (session store)  
✅ Không phụ thuộc module nào khác  
✅ Là điều kiện tối thiểu để mọi module khác hoạt động

---

## Sub-system 2: Module Registry

### Chức Năng

- **Đăng ký module** — Khai báo module key, tier, dependencies
- **Bật/tắt module** — Per-company setting, realtime (không cần redeploy)
- **Dependency check** — Không cho tắt GL nếu Invoice đang bật
- **Feature flags** — Bật/tắt tính năng nhỏ trong từng module
- **Module settings** — Cấu hình riêng cho từng module (VD: số hiệu hóa đơn bắt đầu từ)
- **Dynamic sidebar** — Menu UI tự ẩn/hiện theo module config
- **License/tier check** — Kiểm tra module có trong gói đăng ký không

### Entities

```
ModuleConfig {
  id, company_id, module_key, enabled, settings: JSON,
  enabled_at, enabled_by
}
FeatureFlag { id, company_id, module_key, flag_key, enabled }
```

### API

```
GET    /api/admin/modules              → Danh sách modules + trạng thái
PUT    /api/admin/modules/:key/toggle  → Bật/tắt module
GET    /api/admin/modules/:key/settings
PUT    /api/admin/modules/:key/settings
```

### Logic Dependency Check

```typescript
// Trước khi tắt module:
function canDisable(moduleKey: string, companyId: string): boolean {
  const dependents = getModulesThatDependOn(moduleKey);
  const enabledDependents = dependents.filter(m => isEnabled(m, companyId));
  return enabledDependents.length === 0;
}

// Trước khi bật module:
function canEnable(moduleKey: string, companyId: string): boolean {
  const deps = MODULE_REGISTRY[moduleKey].dependencies;
  return deps.every(dep => isEnabled(dep, companyId));
}
```

---

## Sub-system 3: Audit & Event Bus

### Chức Năng

**Audit Log:**
- Ghi log **mọi write operation** tự động qua Prisma middleware
- Lưu: ai làm gì, lúc nào, record nào, data trước/sau
- Không thể xóa audit log (append-only)
- Search & filter audit log cho admin
- Export audit log (CSV/PDF) cho compliance

**Event Bus:**
- Phát event khi có thay đổi quan trọng trong hệ thống
- Module khác subscribe để phản ứng (VD: Invoice confirmed → GL tạo bút toán)
- Async qua BullMQ queue, không block main flow
- Retry tự động nếu handler lỗi
- Dead letter queue cho events không xử lý được

### Entities

```
AuditLog {
  id, company_id, user_id, action: create|update|delete|approve,
  module_key, entity_type, entity_id,
  data_before: JSON, data_after: JSON,
  ip_address, user_agent, created_at
}

DomainEvent {
  id, company_id, event_type, source_module,
  payload: JSON, published_at, processed_at, status
}
```

### Event Types (chuẩn)

```typescript
// Convention: {module}.{entity}.{action}
'gl.journal.posted'
'invoice.outgoing.confirmed'
'invoice.outgoing.sent_to_tct'
'ar.payment.received'
'sales.deal.stage_changed'
'sales.deal.won'
'hr.employee.onboarded'
'hr.payroll.approved'
'approval.request.created'
'approval.request.approved'
'approval.request.rejected'
'ai.task.completed'
'ai.escalation.triggered'
```

### Prisma Audit Middleware

```typescript
// Tự động cho mọi model — không cần thêm vào từng service
prisma.$use(async (params, next) => {
  const before = params.action.includes('update') 
    ? await prisma[params.model].findUnique(...) 
    : null;
  const result = await next(params);
  await writeAuditLog({ params, before, after: result, user: getCurrentUser() });
  return result;
});
```

---

## Sub-system 4: Platform Services

### 4a. Notification Service

**Chức năng:**
- Gửi notification in-app (realtime qua SSE/WebSocket)
- Gửi email (SMTP via Nodemailer)
- Template notification theo loại sự kiện
- Notification preferences per user (opt-in/out)
- Notification history + đánh dấu đã đọc

```
Notification { id, user_id, type, title, body, data: JSON, read_at, created_at }
NotificationTemplate { id, event_type, channel: email|inapp, subject, body_template }
```

### 4b. File Storage Service

**Chức năng:**
- Upload/download files qua MinIO
- Signed URLs (file không public trực tiếp)
- File metadata (owner, module, entity_type, entity_id)
- Virus scan trước khi lưu
- Tự động cleanup files orphan

```
FileRecord { id, company_id, module_key, entity_type, entity_id,
             filename, mime_type, size, storage_path, uploaded_by }
```

### 4c. Queue Service (BullMQ)

**Queues:**
- `ai-tasks` — AI agent processing (concurrency: 5)
- `notifications` — Gửi email/notification (concurrency: 10)
- `reports` — Generate báo cáo nặng (concurrency: 2)
- `tct-sync` — Đồng bộ TCT eTax (concurrency: 1)
- `events` — Domain event processing (concurrency: 20)

---

## Dependency Map

```
Foundation (Group 0)
    │
    ├── KHÔNG phụ thuộc module nào
    │
    └── Được dùng bởi: TẤT CẢ modules khác
```

## Checklist Deploy

```
□ PostgreSQL 16 running
□ Redis 7 running  
□ MinIO running
□ .env configured (DATABASE_URL, REDIS_URL, MINIO_*, SMTP_*, NEXTAUTH_SECRET)
□ pnpm db:migrate
□ pnpm db:seed (tạo super admin, default company)
□ App running → /login accessible
```
