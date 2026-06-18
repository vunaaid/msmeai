# Đề xuất Dashboard theo vai trò (Role-based Dashboard)

> Tài liệu đề xuất — **chốt trước khi code**. Mô tả: (1) thay đổi điều hướng sau đăng nhập, (2) khung dashboard dùng chung, (3) nội dung hiển thị cho từng vai trò, (4) lộ trình triển khai.

---

## 1. Mục tiêu

1. **Sau khi đăng nhập → vào thẳng trang Dashboard** (không vào `/admin` như hiện tại).
2. **Dashboard là mục đầu tiên** trên menu trái (trên cả "Quản Trị").
3. **`/admin` chỉ hiển thị cho vai trò quản trị** (Company Admin / Super Admin), ẩn khỏi menu của user thường.
4. Mỗi vai trò thấy một dashboard **đúng nhu cầu công việc và đúng phạm vi dữ liệu (scope)** của họ.

---

## 2. Thay đổi điều hướng (routing & menu)

### 2.1. Route mới
| Hạng mục | Đề xuất |
|---|---|
| Route | `/dashboard` |
| Icon (Lucide) | `LayoutDashboard` |
| Vị trí menu | **Mục đầu tiên**, ghim cứng (giống cách "Quản Trị" đang được ghim) |
| Tier hiển thị | Luôn bật cho mọi user (giống module `work` vừa sửa) |

### 2.2. Điều hướng sau đăng nhập (`/redirect`)
Hiện tại `system_admin → /sysadmin`, `company_admin → /admin`, user thường → tenant `/admin`.

**Đề xuất mới:**
| accountType | Đích sau login |
|---|---|
| `system_admin` (Super Admin) | `/sysadmin` (giữ nguyên — quản trị nền tảng) |
| `company_admin` | `/dashboard` |
| User thường (board / c_suite / manager / staff) | tenant `/dashboard` |

> Ghi chú: Super Admin vận hành nền tảng đa công ty nên vẫn vào `/sysadmin`; nhưng vẫn có thể mở `/dashboard` từ menu nếu muốn xem theo công ty.

### 2.3. Gating `/admin`
- **Menu trái:** mục "Quản Trị" chỉ render khi `isCompanyAdmin(session)` (tức `accountType ∈ {company_admin, system_admin}` hoặc `isSuperAdmin`).
- **Server guard:** layout `(dashboard)/admin/layout.tsx` (tạo mới) kiểm tra quyền; nếu không phải admin → `redirect('/dashboard')`. Đảm bảo chặn cả khi user gõ trực tiếp URL.

> Cần bạn xác nhận: "role quản trị hệ thống" = **Company Admin + Super Admin** (đề xuất). Nếu chỉ Super Admin thì siết thêm.

---

## 3. Khung dashboard dùng chung

### 3.1. Bố cục
```
┌───────────────────────────────────────────────────────────┐
│ Header: Lời chào + Tên + Chức danh           [chuông] [↻]  │
├───────────────────────────────────────────────────────────┤
│ Hàng KPI (2–4 thẻ số liệu)                                 │
├──────────────────────────────────┬────────────────────────┤
│ Cột chính (2/3)                   │ Cột phụ (1/3)          │
│ - Danh sách việc / phê duyệt      │ - Trợ lý AI            │
│ - Biểu đồ                         │ - Thông báo / lịch     │
└──────────────────────────────────┴────────────────────────┘
│ Hàng "Thao tác nhanh" (quick actions theo quyền)           │
└───────────────────────────────────────────────────────────┘
```

### 3.2. Thư viện widget (tái sử dụng)
| Widget | Mô tả | Nguồn dữ liệu | Sẵn sàng? |
|---|---|---|---|
| `KpiCard` | Thẻ số liệu (số + nhãn + xu hướng) | tuỳ module | ✅ |
| `MyTasksList` | Việc được giao cho tôi | `/api/work?view=assigned_to_me` | ✅ (module work) |
| `PendingApprovals` | Việc/đối tượng chờ tôi duyệt | `/api/work?view=pending_approval` | ✅ |
| `DelegatedTasks` | Việc tôi giao cho người khác | `/api/work?view=created_by_me` | ✅ |
| `OverduePanel` | Việc quá hạn (theo scope) | work + filter dueDate | ✅ |
| `ProjectsSummary` | Tiến độ dự án | `/api/projects` | ✅ |
| `RecurringDue` | Việc định kỳ sắp đến hạn | `/api/recurring` | ✅ |
| `AiAssistant` | Khung chat trợ lý AI | module `ai-agents` | ✅ |
| `AiApprovalsQueue` | Hàng chờ phê duyệt AI | `/ai/approvals` | ✅ |
| `NotificationsFeed` | Thông báo chưa đọc | notification.service | ✅ |
| `RecentDocuments` | Tài liệu gần đây | module `documents` | ✅ |
| `AuditFeed` | Nhật ký hoạt động | `/admin/audit` | ✅ (chỉ admin) |
| `AdminStats` | Users / Modules / Audit | admin | ✅ (chỉ admin) |
| `FinanceSnapshot` | Doanh thu · Chi phí · Lợi nhuận kỳ này | `/gl/reports/financial` (incomeStatement) | ✅ **GL thật** |
| `BalanceSheetCard` | Tổng tài sản · Nợ phải trả · Vốn CSH + cờ cân đối | `/gl/reports/financial` (balanceSheet) | ✅ **GL thật** |
| `CashPositionCard` | Số dư tiền mặt & ngân hàng (TK 111/112), đầu kỳ→cuối kỳ | `/gl/reports/financial` (cashFlow) | ✅ GL thật (đơn giản hoá) |
| `PendingGlEntries` | Bút toán chờ KTT duyệt (post) | `/gl/entries?status=pending` | ✅ GL thật |
| `GlHealthAlerts` | Cảnh báo: cân đối lệch · kỳ chưa đóng · bút toán treo lâu | `/gl/reports/financial` + entries | ✅ GL thật |
| `ProfitTrendChart` | Xu hướng Doanh thu/Lợi nhuận theo quý | `/gl/reports/financial` (lặp theo quý) | ✅ GL thật |
| `ArApSummary` | Công nợ phải thu/phải trả theo tuổi nợ | ar/ap | ⏳ **Sắp ra mắt** (chưa có model) |
| `TaxDeadlines` | Hạn khai/nộp thuế (VAT/CIT/PIT) | tax/invoice | ⏳ **Sắp ra mắt** |

> **Quan trọng (cập nhật 2026-06-05):** Module **GL (Kế Toán Tổng Hợp) đã có dữ liệu tài chính THẬT** —
> BCTC/KQKD/LCTT/CĐPS tính trực tiếp từ bút toán `posted` theo kỳ (quý/năm) qua
> `GET /api/gl/reports/financial?year=&quarter=`. Vì vậy **cụm widget tài chính ở trên build được ngay (✅)**.
> Phần còn ⏳ là **công nợ AR/AP, hoá đơn, thuế, tài sản, lương** — chưa có model/endpoint, dùng placeholder
> "Sắp ra mắt" cho tới khi module tương ứng lên. LCTT hiện đơn giản hoá theo TK 111/112 (chưa đủ 3 dòng tiền chuẩn).

### 3.3. Phạm vi dữ liệu (scope) theo quyền
Tái dùng RBAC sẵn có (`self < team < dept < company`). Widget tự lọc theo scope cao nhất user có ở module đó:
- `company` → thấy toàn công ty
- `team`/`dept` → thấy phòng/nhóm
- `self` → chỉ việc của mình

---

## 4. Nội dung dashboard theo từng vai trò

> Nhóm theo `level` cho dễ theo dõi. Mỗi vai trò: **mục tiêu → KPI → widget cột chính → widget cột phụ → thao tác nhanh.**

### 4.1. HĐQT — Chủ tịch HĐQT, Board Member  (`level: board`, scope toàn công ty)
- **Mục tiêu:** nhìn tổng thể công ty, tập trung vào phê duyệt chiến lược & **chỉ số tài chính cấp cao**.
- **KPI (✅ GL thật):** Doanh thu kỳ này · Lợi nhuận kỳ này · Tổng tài sản · Số dư tiền (111/112).
- **Cột chính:** `FinanceSnapshot` + `BalanceSheetCard` (sức khỏe tài chính) → `ProfitTrendChart` (xu hướng LN theo quý) → `PendingApprovals` (phê duyệt chiến lược) → `ProjectsSummary`.
- **Cột phụ:** `GlHealthAlerts` (cảnh báo cân đối/đóng kỳ) · `AiAssistant` (hỏi đáp số liệu) · `AuditFeed`.
- **Thao tác nhanh:** Mở BCTC (`/accounting` tab BCTC) · Duyệt · Xuất báo cáo (export).
- *Khác biệt Chủ tịch vs Board Member:* Chủ tịch có thêm `configure` → nút "Cấu hình công ty"; Board Member **chỉ đọc tài chính + duyệt + export**, không thao tác.

### 4.2. C-Suite — CEO, CFO  (`level: c_suite`, scope toàn công ty)
**CEO** (toàn quyền đọc/duyệt/cấu hình mọi module)
- **Mục tiêu:** điều hành toàn công ty — vừa tài chính vừa vận hành.
- **KPI:** Doanh thu/Lợi nhuận kỳ này (✅ GL) · Việc chờ duyệt · Dự án trễ hạn · Việc quá hạn toàn công ty.
- **Cột chính:** `FinanceSnapshot` (1 dòng tài chính) → `PendingApprovals` → `ProjectsSummary` → `OverduePanel` (toàn công ty).
- **Cột phụ:** `AiApprovalsQueue` · `AiAssistant` · `GlHealthAlerts` · `NotificationsFeed`.
- **Thao tác nhanh:** Tạo công việc/dự án · Duyệt · Mở BCTC · Xuất báo cáo.

**CFO** (chuyên sâu các module tài chính: gl + ⏳ invoice/ar/ap/cash/tax + reports)
- **Mục tiêu:** sức khỏe tài chính — đây là role **trọng tâm Cụm Tài Chính** (xem §6.1).
- **KPI (✅ GL thật):** Doanh thu · Chi phí · Lợi nhuận kỳ này · Số dư tiền · (⏳ Công nợ phải thu/phải trả · Thuế phải nộp).
- **Cột chính:** `FinanceSnapshot` + `BalanceSheetCard` → `ProfitTrendChart` (xu hướng quý) → `CashPositionCard` → (⏳ `ArApSummary`).
- **Cột phụ:** `PendingGlEntries` (duyệt bút toán) · `GlHealthAlerts` · `AiAssistant` · `RecentDocuments`.
- **Thao tác nhanh:** Duyệt bút toán (post) · Mở CĐPS/BCTC · Xuất BCTC (reports) · (⏳ Khai thuế).

### 4.3. Manager — KTT, Sales Manager, HR Manager, TP Hành Chính TH  (`level: manager`, scope team/phòng)
Khung chung manager: tập trung **việc của phòng + phê duyệt cấp team**.
- **KPI:** Việc chờ tôi duyệt (team) · Việc nhóm quá hạn · Việc tôi đang giao · Việc của tôi.
- **Cột chính:** `PendingApprovals` (team) → `DelegatedTasks` → `OverduePanel` (team).
- **Cột phụ:** `AiAssistant` · `NotificationsFeed` · `RecurringDue` (việc định kỳ của vai trò).
- **Thao tác nhanh:** Giao việc · Duyệt · Xuất báo cáo (theo quyền export).

Khác biệt theo phòng (thêm widget module đặc thù khi module sẵn sàng):
- **Kế Toán Trưởng (KTT):** role tài chính cấp phòng, có `gl:approve`. Bố cục riêng (xem §6.1):
  - **KPI (✅ GL thật):** Bút toán chờ tôi duyệt · Doanh thu/Chi phí/LN kỳ · Số dư tiền.
  - **Cột chính:** `PendingGlEntries` ⭐ (duyệt/post bút toán) → `FinanceSnapshot` + `CashPositionCard` → `GlHealthAlerts` (cân đối lệch, kỳ chưa đóng, bút toán treo lâu).
  - **Thao tác nhanh:** Duyệt bút toán · Tạo bút toán · Mở CĐPS · Mở BCTC.
- **Sales Manager:** + KPI bán hàng/tồn kho (⏳ sales, inventory); hợp đồng (`documents`/contracts).
- **HR Manager:** + KPI nhân sự (⏳ hr): chấm công, hồ sơ, hợp đồng lao động (`RecentDocuments`).
- **TP Hành Chính TH:** + `RecentDocuments` (văn thư) · tài sản/CSVC (⏳ assets) · tổng hợp `reports` (read/export công ty).

### 4.4. Staff — Kế Toán Viên, Sales Staff, NV Hành Chính, Viewer  (`level: staff`, scope self/team)
Khung chung staff: tập trung **việc của tôi**, không có khu phê duyệt.
- **KPI:** Việc được giao cho tôi · Việc quá hạn của tôi · Việc định kỳ sắp đến hạn.
- **Cột chính:** `MyTasksList` → `OverduePanel` (self) → `RecurringDue` (theo vai trò).
- **Cột phụ:** `AiAssistant` (gợi ý cách làm việc — đã có sẵn ở module work) · `NotificationsFeed`.
- **Thao tác nhanh:** Tạo công việc · Nhờ AI hỗ trợ · Mở tài liệu/biểu mẫu.
- Khác biệt:
  - **Kế Toán Viên / Sales Staff:** thêm shortcut tới module nghiệp vụ của mình (⏳ khi module bật).
  - **NV Hành Chính:** + `RecentDocuments` (văn thư, biểu mẫu).
  - **Viewer:** **chỉ đọc** — bỏ mọi nút tạo/sửa, chỉ KPI + danh sách + biểu đồ read-only.

### 4.5. Company Admin  (`accountType: company_admin`)
- **Mục tiêu:** quản trị công ty (users, roles, modules, audit) + nắm tổng quan vận hành.
- **KPI:** `AdminStats` — Người dùng đang hoạt động · Modules đang bật · Audit logs · Số vai trò.
- **Cột chính:** `AdminStats` → `AuditFeed` (hoạt động gần đây) → `ProjectsSummary` (tổng quan công việc công ty).
- **Cột phụ:** `NotificationsFeed` · `AiAssistant`.
- **Thao tác nhanh:** Thêm người dùng · Cấu hình modules · Phân quyền vai trò · Việc định kỳ.
- *(Đây là nơi gom các shortcut `/admin` hiện tại — nên `/admin` chỉ còn là trang quản trị chuyên sâu, không phải landing.)*

### 4.6. Super Admin / System Admin  (`accountType: system_admin`)
- Vẫn vào `/sysadmin` (quản trị nền tảng: danh sách công ty, gói, vận hành hệ thống).
- Khi xem theo một công ty cụ thể → dùng dashboard giống Company Admin nhưng scope toàn nền tảng.

---

## 5. Bảng tóm tắt widget × vai trò

| Widget | Board | CEO | CFO | Manager | Staff | Viewer | Company Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| KPI cơ bản (work) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅(RO) | ✅ |
| MyTasksList | – | ✅ | ✅ | ✅ | ✅ | ✅(RO) | ✅ |
| PendingApprovals | ✅ | ✅ | ✅ | ✅(team) | – | – | – |
| DelegatedTasks | – | ✅ | ✅ | ✅ | – | – | – |
| OverduePanel | ✅(cty) | ✅(cty) | ✅ | ✅(team) | ✅(self) | ✅(RO) | ✅(cty) |
| ProjectsSummary | ✅ | ✅ | – | ✅ | – | – | ✅ |
| RecurringDue | – | – | – | ✅ | ✅ | – | – |
| AiAssistant | ✅ | ✅ | ✅ | ✅ | ✅ | – | ✅ |
| AiApprovalsQueue | – | ✅ | – | – | – | – | – |
| RecentDocuments | – | – | ✅ | ✅ | ✅(HC) | – | – |
| FinanceSnapshot ✅ | ✅ | ✅ | ✅ | ✅(KTT) | – | – | – |
| BalanceSheetCard ✅ | ✅ | – | ✅ | – | – | – | – |
| CashPositionCard ✅ | ✅ | – | ✅ | ✅(KTT) | – | – | – |
| ProfitTrendChart ✅ | ✅ | ✅ | ✅ | – | – | – | – |
| PendingGlEntries ✅ | – | – | ✅ | ✅(KTT) | – | – | – |
| GlHealthAlerts ✅ | ✅ | ✅ | ✅ | ✅(KTT) | – | – | – |
| ArApSummary ⏳ | ✅ | – | ✅ | ✅(KTT) | – | – | – |
| AdminStats / AuditFeed | (audit RO) | – | – | – | – | – | ✅ |

`RO` = chỉ đọc · `cty` = company · `team` = phòng/nhóm · `self` = cá nhân · `⏳` = chờ module.

---

## 6. Cụm "Board nghiệp vụ" tái sử dụng

Thay vì xếp lẻ từng widget, gom thành **các cụm (board) theo domain**. Mỗi role chỉ "lắp" các cụm mình
được phép xem (theo module bật + scope). Dễ bảo trì, đồng nhất giao diện, và thêm role mới = chọn cụm.

### 6.1. Cụm TÀI CHÍNH (Finance Board) — ✅ dữ liệu GL thật
**Dành cho:** KTT · CFO · CEO · HĐQT (CT + thành viên). Gate theo `gl:read`; phần duyệt gate `gl:approve`.

| Lớp | Widget | Endpoint thật | Hiện cho ai |
|---|---|---|---|
| KPI số | `FinanceSnapshot` (DT/CP/LN kỳ) | `GET /gl/reports/financial?year=&quarter=` → `incomeStatement` | tất cả role TC |
| KPI số | `BalanceSheetCard` (TS/Nợ/VCSH + cờ `balanced`) | cùng endpoint → `balanceSheet` | CFO, HĐQT |
| KPI số | `CashPositionCard` (tiền 111/112, đầu→cuối kỳ) | cùng endpoint → `cashFlow` | KTT, CFO, HĐQT |
| Biểu đồ | `ProfitTrendChart` (DT/LN theo 4 quý) | gọi endpoint lặp `quarter=1..4` | CFO, CEO, HĐQT |
| Hành động | `PendingGlEntries` (bút toán chờ post) ⭐ | `GET /gl/entries?status=pending` + `POST /gl/entries/:id/post` | KTT, CFO |
| Cảnh báo | `GlHealthAlerts` (cân đối lệch · kỳ chưa đóng · bút toán treo > N ngày) | financial + entries | KTT, CFO, CEO, HĐQT |
| ⏳ chờ | `ArApSummary` (tuổi nợ phải thu/trả) · `TaxDeadlines` (hạn thuế) | ar/ap/tax (chưa có) | CFO, HĐQT |

**Bộ lọc kỳ dùng chung:** chọn Năm + Quý (0 = cả năm) — đúng tham số endpoint sẵn có. Mọi widget trong cụm
chia sẻ 1 selector kỳ.

**Khác biệt theo role trong cùng cụm:**
- **KTT** = thiên *vận hành sổ sách*: ưu tiên `PendingGlEntries` + `GlHealthAlerts` + tiền; duyệt scope phòng.
- **CFO** = *toàn cảnh tài chính*: đủ 6 widget, scope công ty; duyệt giá trị lớn.
- **CEO** = *tóm tắt*: chỉ `FinanceSnapshot` + `GlHealthAlerts`, phần còn lại nằm ở cụm Vận hành.
- **HĐQT** = *chỉ đọc cấp cao*: KPI + xu hướng + cảnh báo, **ẩn nút thao tác/duyệt sổ**.

### 6.2. Các board nghiệp vụ tương tự (cùng khuôn mẫu)
Áp dụng đúng cấu trúc *KPI số → biểu đồ → hành động → cảnh báo* cho từng domain. Trạng thái dữ liệu hiện tại:

| Board | Cụm widget | Role chính | Dữ liệu |
|---|---|---|---|
| **Vận hành / Công việc** | `MyTasksList` · `PendingApprovals` · `DelegatedTasks` · `OverduePanel` · `ProjectsSummary` · `RecurringDue` | mọi role (scope khác nhau) | ✅ thật (module work) |
| **AI Agents** | `AiApprovalsQueue` · `AgentStatus` (đang chạy/lỗi) · `AiAssistant` | manager+ , admin | ✅ thật (ai-agents) |
| **Tài liệu** | `RecentDocuments` · template gần đây · tài liệu chờ ký (⏳) | HC, HR, mọi role | ✅ một phần (documents) |
| **Quản trị** | `AdminStats` · `AuditFeed` · health vận hành | Company/Super Admin | ✅ thật (admin) |
| **Nhân sự (HR)** | KPI headcount · chấm công · hợp đồng LĐ | HR Manager, Board | ⏳ chờ module hr |
| **Bán hàng / CRM** | pipeline Lead→Order · doanh số · tồn kho | Sales Manager, CEO | ⏳ chờ module sales/inventory |
| **Thuế & Tuân thủ** | hạn khai/nộp · trạng thái nộp TCT | CFO, KTT, Board | ⏳ chờ module tax/invoice |

> Nguyên tắc: board nào **chưa có dữ liệu thật** thì hiển thị thẻ "Sắp ra mắt" gọn (không chiếm chỗ),
> hoặc ẩn hẳn theo lựa chọn ở §8 câu 5. Board ✅ build ngay trong Phase 2–3.

---

## 7. Lộ trình triển khai (sau khi bạn duyệt)

**Phase 1 — Khung & điều hướng**
1. Thêm route `/dashboard` + layout, ghim "Dashboard" làm mục menu đầu tiên.
2. Sửa `/redirect`: company_admin & user thường → `/dashboard`.
3. Gating `/admin`: ẩn menu + thêm server guard `redirect('/dashboard')` cho non-admin.

**Phase 2 — Widget core (build được ngay)**
4. Dựng thư viện widget: KPI, MyTasks, PendingApprovals, DelegatedTasks, Overdue, Projects, Recurring, Notifications, AiAssistant, RecentDocuments.
5. Tạo cấu hình `DASHBOARD_LAYOUT[role/level]` ánh xạ vai trò → danh sách widget (1 nguồn sự thật, dễ chỉnh).

**Phase 3 — Admin & hoàn thiện**
6. AdminStats / AuditFeed cho Company Admin.
7. Placeholder "Sắp ra mắt" cho FinanceKpi/Charts; thay bằng dữ liệu thật khi module tài chính lên.

---

## 8. Cần bạn xác nhận trước khi code
1. **Phạm vi "role quản trị hệ thống"** ẩn `/admin`: là **Company Admin + Super Admin** (đề xuất) hay chỉ Super Admin?
2. **Route tên `/dashboard`** ổn chứ, hay muốn dùng `/` (trang chủ nội bộ) / tên khác?
3. **Cấu hình theo `level` hay theo từng `role` cụ thể?** Đề xuất: theo `level` + ghi đè (override) cho vài role đặc thù (CFO, HR, TP HCTH) — gọn và dễ bảo trì.
4. **Super Admin** sau login giữ `/sysadmin` hay cũng về `/dashboard`?
5. Các KPI tài chính hiển thị **"Sắp ra mắt"** ngay từ đầu (đề xuất) hay ẩn hẳn cho tới khi module sẵn sàng?
