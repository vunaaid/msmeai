# Quản trị Nhân sự (HR) cho vSME — Lý thuyết, tham chiếu nền tảng & thiết kế module

> Tài liệu định nghĩa module **Quản trị Nhân sự (HR)** cho vSME: phân biệt rõ với phần
> quản lý tài khoản người dùng hiện có, tổng hợp lý thuyết HR + cách Base.vn / MISA AMIS /
> 1Office tổ chức, rồi đề xuất mô hình dữ liệu, quy trình và lộ trình. Cập nhật: 2026-06-07.

---

## 0. Đính chính khái niệm (QUAN TRỌNG)

Hai khái niệm **khác nhau**, không được lẫn:

| | Quản trị Nhân sự (HR) | Quản lý tài khoản user (IAM) — `/admin` hiện tại |
|---|---|---|
| Bản chất | **Module nghiệp vụ** quản trị con người theo toàn bộ vòng đời lao động | Lớp **định danh & phân quyền** kỹ thuật để đăng nhập/sử dụng phần mềm |
| Thực thể gốc | **Nhân viên (Employee)** — hồ sơ lao động | **User (tài khoản)** — danh tính đăng nhập |
| Phạm vi | Tuyển dụng, hợp đồng, hồ sơ, chấm công, nghỉ phép, lương, BHXH/thuế, đánh giá, đào tạo, nghỉ việc… | Email/mật khẩu, vai trò (role), quyền (permission), cây quản lý kỹ thuật |
| Quan hệ | Là **nguồn sự kiện** | Là **hệ quả** của sự kiện HR |

**Điểm nối giữa hai bên:**
- **Tuyển dụng → ký hợp đồng → mới CẤP tài khoản user** với role tương ứng **vị trí tuyển dụng**.
- **Điều chuyển/bổ nhiệm** → đổi role/cấp trên của tài khoản.
- **Nghỉ việc** → thu hồi tài sản + **vô hiệu hóa tài khoản** (`isActive=false`).

> Một nhân viên **có thể chưa có** tài khoản (vd công nhân không dùng hệ thống) hoặc có đúng 1 tài khoản. Vì vậy **Employee và User là 2 bảng tách biệt**, nối 1–(0..1). Hiện vSME đang gộp làm một (User = con người) — đây là khoảng trống lớn nhất (xem §6–7).

---

## 1. Lý thuyết Quản trị Nhân sự — vòng đời nhân viên

HR quản trị con người theo **vòng đời lao động (employee lifecycle)**. Các nhóm chức năng chuẩn:

```
Thiết kế tổ chức → Tuyển dụng → Onboarding/Hợp đồng (+cấp tài khoản)
   → Hồ sơ nhân sự (HRIS) → Chấm công → Nghỉ phép → Tiền lương → BHXH/Thuế
   → Đánh giá hiệu suất → Đào tạo & phát triển → Offboarding (+thu hồi tài khoản)
```

1. **Thiết kế tổ chức & hoạch định nhân lực** — sơ đồ tổ chức, phòng ban, **vị trí/chức danh (Position)**, mô tả công việc (JD), định biên (headcount), khung năng lực.
2. **Tuyển dụng (Recruitment)** — nhu cầu tuyển → đăng tin/nguồn ứng viên → sàng lọc CV → phỏng vấn (nhiều vòng) → đề nghị (offer) → tuyển.
3. **Hội nhập & Hợp đồng (Onboarding)** — ký **hợp đồng lao động** (chữ ký số), checklist hội nhập, **cấp tài khoản + thiết bị/tài sản**.
4. **Hồ sơ nhân sự (HRIS)** — hồ sơ điện tử tập trung: thông tin cá nhân, hợp đồng & phụ lục, quá trình công tác, điều chuyển/bổ nhiệm/khen thưởng/kỷ luật, giấy tờ, người phụ thuộc.
5. **Chấm công (Time & Attendance)** — ca/kíp, check-in (GPS/khuôn mặt/máy chấm công), tăng ca, đi muộn/về sớm, đa địa điểm.
6. **Nghỉ phép & công tác (Leave/Time-off)** — quỹ phép, đăng ký + **duyệt theo cây quản lý**, các loại nghỉ (phép năm, ốm, không lương…).
7. **Tiền lương (Payroll)** — công thức lương, phụ cấp, thưởng/phạt, **kế thừa dữ liệu chấm công + KPI**, bảng lương, phiếu lương, hạch toán sang kế toán.
8. **BHXH/BHYT & Thuế TNCN** — khai báo tăng/giảm, đóng bảo hiểm, quyết toán thuế, tuân thủ luật lao động.
9. **Đánh giá hiệu suất (Performance)** — mục tiêu/OKR/KPI, đánh giá định kỳ (tháng/quý/năm), phản hồi 360°.
10. **Đào tạo & phát triển (L&D)** — kế hoạch đào tạo, khóa học, khung năng lực, lộ trình thăng tiến.
11. **Gắn kết & truyền thông nội bộ** — thông báo, khảo sát, sổ tay nhân viên (tùy chọn).
12. **Nghỉ việc (Offboarding)** — đơn nghỉ, bàn giao, thu hồi tài sản, **vô hiệu hóa tài khoản**, thanh lý hợp đồng.

---

## 2. Tham chiếu nền tảng (Base.vn / MISA AMIS / 1Office)

Cách 3 nền tảng VN tổ chức module nhân sự — ánh xạ theo nhóm chức năng:

| Nhóm chức năng | Base HRM+ | MISA AMIS HRM | 1Office (1HRM) |
|---|---|---|---|
| Thiết kế tổ chức | Thiết kế tổ chức (Org) | Thông tin tổ chức | Sơ đồ tổ chức |
| Tuyển dụng | **Base E-Hiring** | **AMIS Tuyển dụng** (AI sàng lọc) | Phân hệ Tuyển dụng (AI) |
| Hội nhập | **Base Onboard** | (trong Thông tin NS) | (trong 1HRM) |
| Hồ sơ nhân sự | **Base HRM** (HRIS) | **AMIS Thông tin nhân sự** | **1HRM** (hồ sơ, cloud) |
| Chấm công | **Base Timesheet / Checkin / Vision** | **AMIS Chấm công** | Chấm công (app/đa điểm) |
| Nghỉ phép/công tác | **Base Timeoff** | (trong Chấm công) | Nghỉ phép |
| Tiền lương | **Base Payroll** | **AMIS Tiền lương** | Tính lương (kế thừa chấm công/KPI) |
| BHXH/Thuế | (qua Payroll) | **AMIS BHXH + Thuế TNCN** | BHXH/BHYT |
| Chữ ký số | **Base Sign** (e-sign HĐ) | (e-sign) | (e-sign) |
| Đánh giá hiệu suất | **Base Goal / Review** | **AMIS Đánh giá** (mục tiêu) | Đánh giá theo **KPI** |
| Đào tạo & PT | Đào tạo & Phát triển | (gói cao) | Đào tạo |
| Tài sản cấp phát | **Base Asset** | — | — |

**Nhận xét chung:**
- Cả ba đều coi HR là **bộ nhiều phân hệ** xoay quanh **hồ sơ nhân sự tập trung (HRIS)**, không phải "quản lý user".
- Luồng giá trị lõi: **Chấm công → Lương** và **Tuyển dụng → Hồ sơ → Hợp đồng**; KPI/đánh giá kế thừa từ module công việc.
- Chữ ký số (e-sign) là mắt xích ký hợp đồng → kích hoạt cấp tài khoản.

Nguồn: [Base HRM+](https://base.vn/platform/hrm), [Base E-Hiring](https://base.vn/app/e-hiring), [Base Timesheet](https://base.vn/timesheet), [MISA AMIS HRM](https://amis.misa.vn/90798/danh-gia-toan-dien-phan-mem-nhan-su-amis-misa-amis-hrm/), [AMIS Tuyển dụng](https://amis.misa.vn/amis-tuyen-dung/), [1Office HRM](https://1office.vn/phan-mem-quan-ly-nhan-su), [1HRM](https://1office.vn/1hrm).

---

## 3. Mô hình dữ liệu đề xuất cho vSME

Tách **Employee (nhân viên)** khỏi **User (tài khoản)** — đây là thay đổi nền tảng.

```
Department ──< Position (vị trí/chức danh + JD + roleId mặc định)
                   │
Candidate ──(tuyển)──► Employee (hồ sơ NS)            User (tài khoản, 0..1)
                          │  └── Contract (HĐLĐ, e-sign)   ▲
                          │  └── EmploymentHistory          │ provision khi ký HĐ
                          │  └── Attendance / LeaveRequest  │ (role = Position.role)
                          │  └── PayrollItem                │
                          │  └── PerformanceReview          ┘
```

| Thực thể | Vai trò | Quan hệ |
|---|---|---|
| **Department** | Phòng ban (cây) | tự tham chiếu parent; trưởng phòng = Employee |
| **Position** | Vị trí/chức danh + JD + **roleId mặc định** | thuộc Department |
| **Candidate / Application** | Ứng viên + đơn ứng tuyển theo Position | → chuyển thành Employee khi tuyển |
| **Employee** | **Hồ sơ nhân sự gốc** (mã NV, ngày vào, trạng thái LĐ, positionId, managerId, departmentId) | 1–(0..1) với **User** |
| **Contract** | Hợp đồng lao động (loại, thời hạn, lương, e-sign) | thuộc Employee |
| **EmploymentEvent** | Điều chuyển/bổ nhiệm/khen thưởng/kỷ luật | lịch sử của Employee |
| **Attendance / Shift** | Chấm công, ca | thuộc Employee |
| **LeaveRequest / LeaveBalance** | Nghỉ phép + quỹ phép, duyệt theo `getManagerChain` | thuộc Employee |
| **PayrollPeriod / PayrollItem** | Kỳ lương + phiếu lương, hạch toán → kế toán | từ Attendance + KPI |
| **PerformanceReview / Goal** | Đánh giá + mục tiêu (kế thừa module Công việc) | thuộc Employee |
| **User** *(đã có)* | **Tài khoản hệ thống** (đăng nhập, role, permission) | gắn `employeeId`; provision/vô hiệu theo sự kiện HR |

> Nguyên tắc: **Employee là master**; **User là tài khoản cấp cho Employee khi cần truy cập hệ thống**. Role của User lấy mặc định từ **Position** đã tuyển.

---

## 4. Các quy trình HR lõi (gắn với vSME)

### 4.1 Tuyển dụng → Hợp đồng → Cấp tài khoản (điểm nối với IAM)
```
Nhu cầu tuyển (theo Position) → đăng tin → ứng viên → sàng lọc → phỏng vấn (nhiều vòng)
   → offer → tạo Employee → ký Hợp đồng (e-sign) → ✅ CẤP USER (role = Position.roleId, managerId)
   → checklist onboarding + cấp tài sản
```
Tận dụng sẵn: chữ ký/tài liệu (MinIO + e-sign), cây quản lý (`hierarchy.ts`), tạo user ([users.router.ts](../apps/api/src/modules/users/users.router.ts)).

### 4.2 Chấm công → Nghỉ phép → Tiền lương
```
Chấm công (ca/checkin) ─┐
Nghỉ phép (duyệt theo cây) ─┤→ Bảng công kỳ → Tính lương (công thức + phụ cấp + KPI)
KPI từ module Công việc ─┘     → Phiếu lương → Hạch toán sang Kế toán (GL)
```
Tận dụng: cây duyệt `getManagerChain`, module Công việc (KPI), module Kế toán (hạch toán lương).

### 4.3 Đánh giá hiệu suất
Mục tiêu/KPI theo kỳ → đánh giá định kỳ (tháng/quý/năm) → ảnh hưởng lương thưởng. Kế thừa trạng thái việc/hoàn thành từ module Công việc + việc định kỳ.

### 4.4 Nghỉ việc (Offboarding)
```
Đơn nghỉ → duyệt → bàn giao + thu hồi tài sản → thanh lý HĐ → ✅ VÔ HIỆU HÓA USER (isActive=false)
```

---

## 5. Hiện trạng vSME — đã có gì để tận dụng

vSME **chưa có module HR**, nhưng có sẵn các mảnh ghép nền tảng (thuộc lớp IAM/tổ chức và các module khác):

| Đã có | Tận dụng cho HR |
|---|---|
| **User + Role + Permission** ([rbac.ts](../apps/api/src/lib/rbac.ts), [users.router.ts](../apps/api/src/modules/users/users.router.ts)) | Lớp tài khoản downstream — cấp/thu hồi theo sự kiện HR |
| **Cây quản lý `managerId`** ([hierarchy.ts](../apps/api/src/lib/hierarchy.ts)) | Cây duyệt nghỉ phép/đánh giá; sơ đồ tổ chức |
| **Role lai (extraRoleIds)** + onboarding tự seed vai trò ([signup.router.ts](../apps/api/src/modules/auth/signup.router.ts)) | Khung chức danh ban đầu |
| **Tài liệu + chữ ký (MinIO)** | Lưu & ký **hợp đồng lao động** |
| **Module Công việc + việc định kỳ** | Nguồn **KPI/đánh giá** |
| **Module Kế toán (GL)** | **Hạch toán tiền lương** |
| **Nhân sự ảo (CompanyAgent)** | Agent HR hỗ trợ sàng lọc CV, nhắc hạn hợp đồng… |

> Hiện trạng chi tiết của lớp tài khoản/tổ chức (User CRUD, RBAC, hierarchy, agent, onboarding) đã hoạt động đầy đủ — nhưng đó là **IAM**, không phải HR.

---

## 6. Khoảng trống so với một module HR đúng nghĩa

| Thành phần HR | vSME | Ghi chú |
|---|---|---|
| Hồ sơ nhân viên (Employee) tách khỏi User | ❌ | Đang gộp User = con người |
| Phòng ban (Department) | ❌ | Mới là field `departmentId`, chưa có model/CRUD |
| Vị trí/chức danh + JD (Position) | ❌ | Chưa có; role đang đóng vai trò thay thế thô |
| Tuyển dụng (Candidate/Application) | ❌ | Chưa có |
| Hợp đồng lao động + e-sign | ⚠️ | Có hạ tầng tài liệu/chữ ký, chưa có nghiệp vụ HĐ |
| Chấm công | ❌ | Chưa có |
| Nghỉ phép + quỹ phép | ❌ | Chưa có (có sẵn cây duyệt) |
| Tiền lương + BHXH/Thuế | ❌ | Chưa có (có sẵn GL để hạch toán) |
| Đánh giá hiệu suất | ⚠️ | Có dữ liệu việc/KPI thô, chưa có nghiệp vụ đánh giá |
| Đào tạo & phát triển | ❌ | Chưa có |

---

## 7. Lộ trình triển khai đề xuất (theo giai đoạn)

**Giai đoạn 1 — Nền tảng tổ chức & hồ sơ (ưu tiên cao):**
- `Department` (cây phòng ban) + `Position` (vị trí + JD + roleId mặc định).
- `Employee` tách khỏi `User`; `User.employeeId`; chuẩn hóa **provision/deactivate tài khoản theo sự kiện HR**.

**Giai đoạn 2 — Tuyển dụng & Hợp đồng (khép vòng nối IAM):**
- Tuyển dụng (Candidate → phỏng vấn → offer) → tạo Employee.
- Hợp đồng lao động + ký số (dùng hạ tầng tài liệu) → tự cấp tài khoản theo Position.

**Giai đoạn 3 — Vận hành hằng ngày:**
- Chấm công + Nghỉ phép (duyệt theo `getManagerChain`).

**Giai đoạn 4 — Lương & tuân thủ:**
- Tiền lương (kế thừa chấm công + KPI) → hạch toán GL; BHXH/Thuế TNCN.

**Giai đoạn 5 — Phát triển con người:**
- Đánh giá hiệu suất (mục tiêu/KPI) + Đào tạo & phát triển.

---

## 8. Tham chiếu

- Lớp IAM/tổ chức hiện có: [users.router.ts](../apps/api/src/modules/users/users.router.ts) · [roles.router.ts](../apps/api/src/modules/roles/roles.router.ts) · [hierarchy.ts](../apps/api/src/lib/hierarchy.ts) · [rbac.ts](../apps/api/src/lib/rbac.ts) · [signup.router.ts](../apps/api/src/modules/auth/signup.router.ts) · [schema.prisma](../packages/db/prisma/schema.prisma)
- Nền tảng tham chiếu: Base HRM+, MISA AMIS HRM, 1Office 1HRM (link ở §2).
- Tài liệu liên quan: [work-management-model.md](work-management-model.md)
