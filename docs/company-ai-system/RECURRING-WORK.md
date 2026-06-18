# Công Việc Định Kỳ Tự Động Lên Workboard (Recurring Work)

> Tài liệu thiết kế: tự sinh **công việc định kỳ/thường xuyên** của từng vai trò lên workboard
> (tab "Việc của tôi"). Danh mục có thể **tuỳ biến theo từng công ty**.
> Liên quan: [ACTION-ASSISTANT.md](./ACTION-ASSISTANT.md) (việc phát sinh do trigger/escalate).

---

## 1. Mục tiêu

- Mỗi vai trò (HĐQT, CEO, CFO, trưởng phòng, nhân viên…) có **danh mục việc định kỳ** (họp, duyệt báo cáo, rà soát KPI…).
- Hệ thống **tự tạo work_item** đúng hạn → hiện trên workboard người giữ vai trò, không cần tạo tay.
- Danh mục là **dữ liệu theo công ty** (`recurring_work`): mỗi công ty có bản riêng, sửa/thêm/tắt được; có thể **nạp nhanh từ catalog mặc định**.

---

## 2. Mô hình dữ liệu

`recurring_work` (theo công ty, gán theo **role**):

| Cột | Ý nghĩa |
|---|---|
| `companyId` | Công ty |
| `roleId` | Vai trò được giao (FK roles) |
| `title`, `description` | Nội dung việc |
| `cadence` | `weekly` / `monthly` / `quarterly` / `yearly` |
| `module` | Module liên quan (tuỳ chọn) |
| `priority` | urgent/high/normal/low |
| `dueOffsetDays` | Hạn = ngày sinh + offset |
| `active` | Bật/tắt |
| `source` | `default` (từ catalog) / `custom` |
| `lastGeneratedAt` | Lần sinh gần nhất (chống trùng) |

→ Vì gán theo `roleId`, mọi user giữ vai trò đó đều nhận việc; đổi người giữ vai trò → tự đúng người.

---

## 3. Cơ chế sinh việc

- **Generator** (`recurring.service.ts`) chạy định kỳ (mặc định **hằng ngày**):
  1. Lấy các `recurring_work` đang `active`.
  2. Với mỗi mục: nếu **đến hạn** (đủ số ngày của cadence kể từ `lastGeneratedAt`, hoặc chưa từng sinh) → tạo `work_item` (`operational`, `status=active`, `assignedTo` = từng user giữ role, `dueDate = now + dueOffsetDays`), rồi cập nhật `lastGeneratedAt`.
- Cadence → số ngày: weekly=7, monthly=30, quarterly=90, yearly=365 (MVP; có thể nâng cấp dùng mốc lịch chính xác sau).
- Chạy tự động: script `scripts/generate-recurring.ts` (chạy bằng `tsx`) đặt **cron hằng ngày** (hoặc BullMQ repeatable — Phase 2).

---

## 4. Danh mục công việc định kỳ mặc định (catalog theo role)

> Khớp theo `level` + từ khoá tên vai trò. Công ty không có vai trò tương ứng sẽ bỏ qua.

### HĐQT
**Chủ Tịch HĐQT** (board · "Chủ Tịch")
- Chủ trì họp HĐQT định kỳ — *quarterly*
- Duyệt báo cáo tài chính quý — *quarterly*
- Phê duyệt dự toán ngân sách năm — *yearly*
- Đánh giá hiệu quả CEO & C-Suite — *yearly*
- Rà soát rủi ro & tuân thủ — *quarterly*

**Thành Viên HĐQT** (board · "Thành Viên")
- Dự họp HĐQT & bỏ phiếu — *quarterly*
- Giám sát lĩnh vực phụ trách — *monthly*
- Rà soát KPI công ty — *quarterly*

### C-Suite
**Tổng Giám Đốc / CEO** (c_suite · "Tổng Giám Đốc")
- Họp giao ban C-Suite — *weekly*
- Rà soát dòng tiền — *weekly*
- Duyệt báo cáo KPI tháng — *monthly*
- Báo cáo HĐQT — *quarterly*
- Lập kế hoạch kinh doanh năm — *yearly*

**Giám Đốc Tài Chính / CFO** (c_suite · "Tài Chính")
- Rà soát dòng tiền tuần — *weekly*
- Duyệt báo cáo tài chính tháng — *monthly*
- Quyết toán & khai báo thuế quý — *quarterly*
- Lập ngân sách năm — *yearly*

### Quản lý (manager) — áp cho mọi trưởng phòng
- Họp giao ban phòng — *weekly*
- Báo cáo công việc phòng — *monthly*
- Đánh giá nhân sự phòng — *quarterly*

### Nhân viên (staff)
- Báo cáo công việc tuần — *weekly*

> Có thể mở rộng catalog cho COO/CMO/CHRO/CTO/CLO theo cùng khuôn.

---

## 5. Tuỳ biến theo công ty

- **Nạp mặc định**: `POST /api/recurring/import-defaults` → tạo các mục từ catalog cho công ty (khớp role theo level + tên), đánh dấu `source=default`.
- **CRUD**: thêm/sửa/tắt từng mục (`source=custom`) — mỗi công ty quản lý danh mục riêng.
- **Sinh thủ công**: `POST /api/recurring/generate` (admin) chạy ngay phần đến hạn.

---

## 6. API

| Method | Endpoint | Quyền |
|---|---|---|
| GET | `/api/recurring` | admin:read — danh sách mục định kỳ |
| POST | `/api/recurring` | admin:configure — tạo |
| PUT | `/api/recurring/:id` | admin:configure — sửa |
| DELETE | `/api/recurring/:id` | admin:configure — xoá |
| POST | `/api/recurring/import-defaults` | admin:configure — nạp catalog |
| POST | `/api/recurring/generate` | admin:configure — sinh việc đến hạn |
| GET | `/api/recurring/catalog` | admin:read — xem catalog mặc định |

---

## 7. Hiện trạng / lộ trình

- ✅ Phase 1 (tài liệu này): model `recurring_work`, catalog mặc định, service generator + import, API, script cron.
- ⏳ Phase 2: UI quản lý danh mục trong trang Admin; BullMQ repeatable job thay cron; mốc lịch chính xác (đầu tuần/đầu tháng/đầu quý); gắn việc định kỳ vào module liên quan.

## 8. Tham chiếu code
- Model: `packages/db/prisma/schema.prisma` (`RecurringWork`, enum `RecurringCadence`)
- Catalog: `apps/api/src/modules/work/recurring-catalog.ts`
- Service: `apps/api/src/modules/work/recurring.service.ts`
- Router: `apps/api/src/modules/work/recurring.router.ts` (mount `/api/recurring`)
- Cron script: `apps/api/src/scripts/generate-recurring.ts`
