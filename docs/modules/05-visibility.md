# Group 5: Báo Cáo & Giám Sát — Visibility Modules

> **2 modules** — Lớp nhìn xuyên suốt toàn bộ hệ thống.  
> Reports: xuất báo cáo định kỳ (tài chính, kế toán, thuế).  
> Visibility Engine: giám sát vận hành real-time theo từng cấp quản lý.  
> Cả hai đều là "consumer" — đọc data từ các module khác, không tạo data mới.

---

## Module 20: Báo Cáo & Dashboard (Reports)

### Mô Tả
Tổng hợp và xuất toàn bộ báo cáo tài chính, kế toán, thuế, nghiệp vụ. Gồm 2 phần: báo cáo pháp lý (bắt buộc theo TT200) và dashboard phân tích (linh hoạt theo nhu cầu).

### Chức Năng

**Báo cáo tài chính (Financial Reports — TT200):**
- B01-DN: Bảng cân đối kế toán
- B02-DN: Kết quả hoạt động kinh doanh
- B03-DN: Lưu chuyển tiền tệ (trực tiếp + gián tiếp)
- B09-DN: Thuyết minh báo cáo tài chính
- Bảng CĐSPS: Cân đối số phát sinh tháng/quý/năm
- Sổ chi tiết tài khoản (theo khoảng thời gian, tài khoản)
- Tất cả xuất được PDF + Excel, đúng form mẫu TT200

**Báo cáo thuế:**
- 01/GTGT: Tờ khai thuế GTGT tháng/quý (có 01-1, 01-2 kèm theo)
- Quyết toán thuế TNDN
- Quyết toán thuế TNCN
- Bảng kê BHXH (D02-TS hàng tháng)

**Báo cáo nghiệp vụ:**
- Báo cáo bán hàng: doanh thu theo SP/KH/sales rep/kênh, funnel report
- Báo cáo mua hàng: chi phí theo vendor/loại, PO status
- Báo cáo kho: tồn kho hiện tại, nhập xuất tồn, hàng chậm luân chuyển
- Báo cáo nhân sự: headcount, turnover, payroll cost, attendance
- Báo cáo hợp đồng: sắp hết hạn, giá trị theo loại, theo đối tác

**Dashboard:**
- Mỗi role có dashboard layout riêng (xem Visibility module)
- CEO Dashboard: doanh thu, lợi nhuận, cash flow, headcount, top KPIs
- CFO Dashboard: chi tiết tài chính, cash position, AR/AP aging, tax schedule
- Sales Dashboard: pipeline, quota, win rate, top deals
- HR Dashboard: headcount by dept, turnover, open positions, payroll cost

**Tự động hoá:**
- Scheduled reports: tự tạo và gửi email định kỳ (hàng ngày/tuần/tháng)
- Subscription: đăng ký nhận báo cáo cụ thể vào hòm thư
- Report history: lưu lại các lần chạy báo cáo

**Export:**
- PDF (đúng format in ấn)
- Excel (data thô để phân tích thêm)
- CSV (để import vào BI tools)

### Entities

```
ReportDefinition {
  id, company_id, name, type: financial|tax|operational|custom,
  module_key, query_config: JSON, layout_config: JSON,
  is_system (TT200 reports) | is_custom
}
ReportRun {
  id, report_def_id, run_by, params: JSON,
  status: queued|running|completed|failed,
  file_id, run_at, completed_at
}
ReportSchedule {
  id, report_def_id, frequency: daily|weekly|monthly,
  day_of_week | day_of_month, time,
  recipients: email[], is_active
}
Dashboard {
  id, company_id, owner_id, role, name,
  widgets: [{type, position, size, config}]
}
```

### Phụ Thuộc Vào
- Foundation
- Đọc data từ: **GL, Invoice, AR, AP, Cash, Tax, Assets** (financial reports)
- Đọc data từ: **Sales, Inventory, HR, Procurement** (operational reports)
- Đọc data từ: **Performance, Projects** (management reports)

### Cung Cấp Cho
- Người dùng cuối: báo cáo PDF/Excel
- **AI Agents**: data tổng hợp cho AI tạo insights
- **Visibility**: widget data cho dashboards

### Standalone: ⚠️ Cần ít nhất 1 module data source. Tối thiểu nên bật cùng GL.

---

## Module 21: Visibility Engine (Giám Sát Vận Hành)

### Mô Tả
Lớp thông minh giám sát toàn bộ hoạt động công ty theo thời gian thực. Mỗi role thấy đúng scope của mình, dữ liệu được tổng hợp từ dưới lên (roll-up), AI tóm tắt tình hình và chỉ ra điều cần chú ý — không cần hỏi thủ công.

### Triết Lý Thiết Kế

```
Vấn đề cần giải quyết:
  CEO không nên phải gọi từng GĐ để biết công ty đang thế nào.
  GĐ không nên phải hỏi từng trưởng phòng mới biết team đang làm gì.
  Mọi người chỉ nên thấy những gì quan trọng với họ — không thừa, không thiếu.

Giải pháp:
  1. Role-scoped data: filter data theo scope của từng role
  2. Aggregation: roll-up từ staff → manager → C-Suite → CEO
  3. Health scoring: tính "điểm sức khỏe" cho từng dept/người
  4. Anomaly detection: phát hiện tự động khi có gì đó bất thường
  5. AI briefing: tóm tắt tình hình mỗi sáng theo role
```

### Chức Năng

**Scope-based Data Access:**
- Mỗi role có `visibility_scope`: self | team | department | company
- Query tự động filter theo scope + org chart
- Manager thấy data của toàn team (bao gồm cả nested reports)
- C-Suite thấy toàn bộ department
- CEO thấy company-wide

**Roll-up Aggregation Engine:**
- Lắng nghe tất cả domain events từ các module
- Tự động tính toán aggregate metrics:
  - Sales: pipeline value, quota attainment, win rate
  - Finance: cash balance, AR overdue, AP due
  - HR: headcount, open positions, leaves today
  - Projects: tasks overdue, project health
  - Performance: KPI green/yellow/red count
- Cache kết quả, refresh khi có event mới (không tính lại từ đầu)
- Lịch sử metrics để vẽ trend chart

**Department Health Score:**
- Mỗi phòng ban có điểm 0-100, màu xanh/vàng/đỏ
- Tính từ: KPI achievement, tasks on-time, budget compliance, attendance
- Trọng số configurable theo công ty
- Trend: tháng này so với tháng trước

**Anomaly Detection:**
- Rule-based alerts (có thể config):
  - Cash balance < X triệu
  - Deal không update > 7 ngày
  - Task overdue > 3 tasks/person
  - KPI dưới 70% đã 2 kỳ liên tiếp
  - Nhân viên vắng không phép
  - HĐ sắp hết hạn trong 30 ngày
- ML-based anomalies (Phase 2): phát hiện bất thường không theo rule

**Role-based Dashboards:**
- Mỗi role có dashboard layout mặc định + tuỳ chỉnh
- Widgets: metric card, chart, table, activity feed, alerts

```
CEO Dashboard:
  ├── Company health score (tổng)
  ├── 6 dept health scores (mini cards)
  ├── Revenue vs target (YTD)
  ├── Cash position + 30-day forecast
  ├── Top 5 urgent alerts
  └── AI morning briefing

C-Suite Dashboard (VD: GĐ KD):
  ├── Dept health score
  ├── Team workload map
  ├── Pipeline funnel
  ├── Quota attainment (individual)
  ├── Deals cần chú ý (stuck, expiring)
  └── Team activities hôm nay

Manager Dashboard:
  ├── Team tasks status
  ├── Ai đang làm gì (live)
  ├── Overdue tasks
  ├── Upcoming deadlines (7 ngày)
  └── Blockers reported

Employee Dashboard:
  ├── My tasks hôm nay
  ├── My KPIs
  ├── Upcoming deadlines
  └── Team announcements
```

**AI Morning Briefing:**
- Mỗi sáng, AI tạo briefing ngắn gọn theo role
- Nội dung: tóm tắt tình hình, điểm nổi bật, cần làm gì hôm nay
- Gửi qua: in-app notification + email (optional)

```
Briefing mẫu cho GĐ Kinh doanh (7:30 sáng):
"Tuần này:
 • Pipeline: 12.4 tỷ, 47 deals — tăng 3 deals so với tuần trước
 • Cần chú ý: Trần B (62% quota), Phạm D (31% quota) — gợi ý 1-1
 • 3 deals im lặng >5 ngày: ABC Corp, XYZ Ltd, StartupVN
 • Deal TechCorp 800M đang chờ CEO approve (ngày 3)
Hôm nay cần làm:
 • [Review deal TechCorp] [Check-in Phạm D] [Pipeline review 16h]"
```

**Activity Feed:**
- Dòng thời gian các sự kiện quan trọng trong scope của role
- Filter theo module, loại event, người
- "15 phút trước: Nguyễn A cập nhật deal ABC Corp sang Negotiation"

### Entities

```
VisibilityScope {
  role_id, module_key, metric_key,
  aggregation: sum|avg|count|last,
  filter_by_scope: boolean
}
MetricSnapshot {
  id, company_id, scope_type: dept|team|individual,
  scope_id, metric_key, value, period, captured_at
}
HealthScore {
  id, company_id, entity_type: company|dept|team|employee,
  entity_id, score: 0-100, color: green|yellow|red,
  breakdown: JSON, calculated_at
}
VisibilityAlert {
  id, company_id, rule_id, entity_type, entity_id,
  severity: info|warning|critical,
  title, description, data: JSON,
  acknowledged_by, acknowledged_at, created_at
}
AlertRule {
  id, company_id, name, module_key, metric_key,
  condition: lt|gt|eq|..., threshold, severity,
  notify_roles: role_id[], is_active
}
AIBriefing {
  id, user_id, date, content, delivery_channels: inapp|email,
  sent_at, read_at
}
```

### Events Tiêu Thụ (Subscribe to)

```
← gl.journal_entry.posted
← invoice.outgoing.confirmed
← ar.payment.received
← sales.deal.stage_changed
← sales.quota.below_target
← hr.employee.onboarded / offboarded
← hr.leave.approved
← task.overdue
← project.milestone.missed
← performance.kpi.red
← cash.balance.low
← contract.expiring
← approval.request.timeout
(và tất cả events từ mọi module)
```

### Events Phát Ra

```
visibility.alert.triggered   → Notify đúng người theo role
visibility.health.degraded   → Alert khi dept health xuống dưới ngưỡng
visibility.briefing.ready    → Gửi AI briefing buổi sáng
```

### Phụ Thuộc Vào
- Foundation (Event Bus bắt buộc)
- Đọc data từ: **tất cả module** qua event subscription và direct query
- **AI Agents** (tuỳ chọn): để tạo AI briefing thông minh

### Cung Cấp Cho
- Người dùng: role-based dashboard, alerts, briefings
- **Reports**: pre-aggregated metrics cho dashboard widgets
- **AI Agents**: context hiện tại của từng phòng ban để ra quyết định

### Standalone: ⚠️ Cần ít nhất 1-2 module data để có data hiển thị. Nên bật cùng Foundation và ít nhất 1 module nghiệp vụ.

---

## Sơ Đồ Luồng Dữ Liệu Visibility

```
Module Events
(sales, hr, finance...)
        │
        ▼ publish to Event Bus
┌───────────────────────┐
│   AGGREGATION ENGINE  │
│  Subscribe all events │
│  Update metric cache  │
│  Recalculate health   │
└──────────┬────────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
Anomaly       Metric
Detection     Snapshots
    │             │
    ▼             ▼
Alerts       Role-scoped
(notify       Dashboard
 right people) Queries
           │
           ▼
      AI Briefing
   (summarize context
    per role each morning)
```
