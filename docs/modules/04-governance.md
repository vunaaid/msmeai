# Group 4: Quản Trị — Governance Modules

> **5 modules** — Tầng quản trị nội bộ: công việc, hiệu suất, cuộc họp, tài liệu, phê duyệt.  
> Tất cả độc lập với nhau và với nhóm kế toán.  
> Đây là nhóm trả lời câu hỏi: *"Ai đang làm gì? Tình trạng thế nào? Quyết định được đưa ra như thế nào?"*

---

## Dependency Tree

```
Documents (15)      ← độc lập hoàn toàn
Approvals (16)      ← độc lập; tích hợp với MỌI module có workflow duyệt
Projects (17)       ← độc lập; tích hợp Approvals + Performance
Performance (18)    ← cần HR (employee data); tích hợp Projects + Sales
Meetings (19)       ← độc lập; tích hợp Documents + Approvals + Projects
```

---

## Module 15: Quản Lý Tài Liệu (Documents)

### Mô Tả
Kho lưu trữ tài liệu tập trung của toàn công ty. Kiểm soát version, phân quyền truy cập, tìm kiếm nhanh. Khác với file đính kèm trong từng module — Documents là kho tài liệu chính thức (quy trình, chính sách, biểu mẫu, biên bản...).

### Chức Năng

**Tổ chức tài liệu:**
- Cây thư mục (folder tree) phân theo phòng ban, loại tài liệu
- Gán tag tự do cho từng tài liệu
- Tài liệu công ty (tất cả xem) vs tài liệu phòng ban (chỉ phòng đó xem) vs private
- Shortcut / bookmark tài liệu hay dùng

**Quản lý version:**
- Upload file mới → tự tạo version mới, giữ lịch sử
- So sánh 2 version (với file Word/PDF có thể xem diff)
- Rollback về version cũ
- Ghi chú thay đổi ở mỗi version (change log)

**Phân quyền:**
- Owner, Editor, Viewer theo user hoặc role/phòng ban
- Tài liệu có thể public (ai trong công ty cũng xem được)
- Tài liệu confidential (chỉ người được cấp quyền)
- Không cho download (chỉ xem online) cho tài liệu nhạy cảm

**Tìm kiếm:**
- Full-text search nội dung file (PDF, Word, Excel)
- Filter theo tag, loại, phòng ban, ngày, người tạo
- Kết quả highlight từ khoá trong nội dung

**Tích hợp:**
- Đính kèm tài liệu vào Meetings (biên bản)
- Đính kèm vào Contracts (phụ lục)
- Reference từ Projects (tài liệu dự án)

**Vòng đời tài liệu:**
- Trạng thái: draft → review → approved → published → archived
- Tài liệu có ngày hết hiệu lực → nhắc review/cập nhật
- Archive tài liệu cũ (không xóa, chỉ ẩn)

### Entities

```
DocFolder { id, company_id, name, parent_id, owner_id, access_level: public|dept|private }
Document {
  id, company_id, folder_id, title, type,
  tags: string[], access_level: public|restricted|private,
  current_version, status: draft|review|approved|published|archived,
  owner_id, expires_at
}
DocumentVersion {
  id, document_id, version_number, file_id,
  change_note, created_by, created_at, size, mime_type
}
DocumentPermission { id, document_id, grantee_type: user|role|dept, grantee_id, permission: view|edit|manage }
DocumentActivity { id, document_id, user_id, action: viewed|downloaded|edited|shared, at }
```

### Phụ Thuộc Vào
- Foundation (File Storage, Auth)

### Cung Cấp Cho
- **Meetings**: đính kèm tài liệu vào cuộc họp, lưu biên bản
- **Contracts**: lưu hợp đồng đã ký
- **Projects**: tài liệu dự án tập trung
- **HR**: template HĐLĐ, quy chế nội bộ
- **Approvals**: đính kèm hồ sơ vào approval request

### Standalone: ✅ Hoàn toàn độc lập. Dùng như Google Drive nội bộ.

---

## Module 16: Phê Duyệt & Workflow (Approvals)

### Mô Tả
Engine xử lý mọi loại yêu cầu phê duyệt trong hệ thống. Thay vì mỗi module tự build workflow riêng, tất cả đều dùng Approvals module — đảm bảo nhất quán, có audit trail, dễ cấu hình.

### Chức Năng

**Định nghĩa workflow:**
- Tạo loại approval: chi phí, tuyển dụng, nghỉ phép, mua hàng, hợp đồng...
- Định nghĩa các bước (steps): 1→2→3 tuần tự hoặc song song
- Mỗi bước: approver là ai (cụ thể / role / manager của requester)
- Điều kiện: ngưỡng giá trị, loại request... để bỏ qua bước hoặc thêm bước
- Timeout: nếu approver không phản hồi trong N giờ → tự động escalate

**Quy trình duyệt:**
- Requester tạo request: loại, mô tả, dữ liệu, file đính kèm
- Hệ thống xác định workflow phù hợp, gửi notification cho approver
- Approver xem context đầy đủ → Approve / Reject / Request more info
- Comment thread giữa requester và approver
- Sau khi approve đủ bước → phát event cho module liên quan thực thi

**Delegation:**
- Approver ủy quyền cho người khác khi đi vắng (có thời hạn)
- Acting approver nhận notification thay

**Theo dõi:**
- Dashboard "Cần tôi duyệt" / "Tôi đã tạo"
- SLA tracking: bao lâu từ tạo → duyệt
- Báo cáo bottleneck: ai hay duyệt chậm nhất

### Entities

```
ApprovalWorkflow {
  id, company_id, name, module_key, trigger_conditions: JSON,
  steps: [{
    order, approver_type: specific|role|manager|dept_head,
    approver_id, timeout_hours, on_timeout: escalate|auto_approve|reject
  }]
}
ApprovalRequest {
  id, company_id, workflow_id,
  requester_id, module_key, entity_type, entity_id,
  title, description, data: JSON,
  current_step, status: pending|approved|rejected|cancelled,
  created_at, completed_at
}
ApprovalStep {
  id, request_id, step_order,
  approver_id, status: pending|approved|rejected|delegated,
  comment, decided_at, delegated_to
}
ApprovalAttachment { id, request_id, file_id, uploaded_by }
```

### Events Phát Ra

```
approval.request.created    → Notify approver(s)
approval.step.approved      → Chuyển bước tiếp theo hoặc hoàn thành
approval.request.approved   → Notify requester + module liên quan thực thi
approval.request.rejected   → Notify requester với lý do
approval.step.timeout       → Escalate hoặc auto-action theo config
```

### Phụ Thuộc Vào
- Foundation

### Cung Cấp Cho (tất cả module có workflow duyệt đều dùng)
- **Procurement**: duyệt PR, PO
- **HR**: duyệt nghỉ phép, bảng lương, tuyển dụng
- **Cash**: duyệt thanh toán vượt ngưỡng
- **Contracts**: duyệt trước khi ký
- **Projects**: duyệt milestone, ngân sách
- **AI Agent**: approval request khi AI vượt thẩm quyền

### Standalone: ✅ Chạy độc lập như công cụ phê duyệt nội bộ.

---

## Module 17: Dự Án & Công Việc (Projects & Tasks)

### Mô Tả
Quản lý dự án và công việc hàng ngày của toàn công ty. Từ dự án lớn nhiều tháng đến task nhỏ trong ngày — tất cả có thể theo dõi, assign, và biết trạng thái real-time.

### Chức Năng

**Dự án (Projects):**
- Tạo dự án: tên, mô tả, ngày bắt đầu/kết thúc, ngân sách, team
- Phân loại: loại dự án (phát triển sản phẩm, marketing campaign, nội bộ...)
- Milestone: mốc quan trọng với deadline và deliverables
- Progress tracking: % hoàn thành tự động từ tasks
- Gantt chart view
- Gắn với phòng ban hoặc cross-department
- Báo cáo dự án: chi phí thực tế vs ngân sách, tiến độ vs kế hoạch

**Công việc (Tasks):**
- Tạo task: tiêu đề, mô tả, assignee (1 hoặc nhiều), deadline, priority, tags
- Sub-tasks (checklist trong task)
- Task dependencies: "Task B chỉ bắt đầu sau khi Task A xong"
- Nhiều view: Kanban (by status), List, Calendar, Timeline
- Comment thread trong từng task
- File đính kèm (tích hợp Documents module)
- Time tracking: log giờ làm việc thực tế

**Theo dõi theo cấp (Visibility):**
- **CEO/C-Suite**: tất cả dự án cross-company, health score
- **Trưởng phòng**: tasks của team mình, workload map
- **Nhân viên**: tasks được assign cho mình

**Templates:**
- Dự án template (marketing campaign, product launch, onboarding...)
- Checklist template (tasks tự động tạo khi tạo dự án từ template)

**Tích hợp:**
- Task từ Approval rejection → tự tạo task "sửa và nộp lại"
- Task từ Meeting action item → tự tạo task với deadline
- Task từ AI Agent → AI tạo task và assign người

### Entities

```
Project {
  id, company_id, name, description, type,
  owner_id, department_id, team_members: user_id[],
  start_date, end_date, budget, actual_cost,
  status: planning|active|on_hold|completed|cancelled,
  progress_pct
}
Milestone { id, project_id, title, due_date, status: pending|completed, deliverables }
Task {
  id, company_id, project_id (nullable), milestone_id (nullable),
  title, description, assignees: user_id[], reporter_id,
  priority: low|medium|high|urgent,
  status: todo|in_progress|in_review|done|cancelled,
  due_date, estimated_hours, actual_hours,
  parent_task_id, depends_on: task_id[],
  tags: string[]
}
TaskComment { id, task_id, user_id, content, created_at }
TimeLog { id, task_id, user_id, date, hours, description }
```

### Events Phát Ra

```
task.overdue              → Alert assignee + manager
task.completed            → Update project progress
project.milestone.missed  → Alert project owner + C-Suite
project.budget.exceeded   → Alert CFO + project owner
```

### Phụ Thuộc Vào
- Foundation
- **Approvals** (tuỳ chọn): duyệt ngân sách dự án
- **Documents** (tuỳ chọn): tài liệu dự án

### Cung Cấp Cho
- **Performance**: task completion rate → KPI của nhân viên
- **Visibility**: workload map, project health
- **Meetings**: action items → tasks tự động
- **AI Agents**: AI tạo/assign/theo dõi task

### Standalone: ✅ Dùng như project management tool độc lập (Jira-lite).

---

## Module 18: KPI & OKR (Performance Management)

### Mô Tả
Thiết lập, theo dõi và đánh giá hiệu suất làm việc theo KPI/OKR ở mọi cấp: công ty → phòng ban → cá nhân. Là nền tảng để Visibility Engine tính "health score" và để HR tính thưởng theo KPI.

### Chức Năng

**OKR (Objectives & Key Results):**
- Tạo Objective: mục tiêu định tính, inspiring
- Gắn Key Results: kết quả đo được cụ thể (số, %)
- Phân cấp OKR: Company OKR → Dept OKR (aligned với Company) → Personal OKR
- Kỳ: Quarterly hoặc Yearly
- Check-in hàng tuần: cập nhật % tiến độ + confidence level + comment
- Dashboard alignment: xem OKR cấp dưới đang đóng góp thế nào cho OKR cấp trên

**KPI:**
- Định nghĩa KPI per role/position (template theo ngành)
- Ví dụ KPI Sales: Quota attainment, Deal count, Win rate, Activity count
- Ví dụ KPI HR: Time-to-hire, Turnover rate, Training hours
- KPI có thể lấy data tự động từ các module (Sales → quota, HR → turnover)
- KPI nhập thủ công cho các chỉ số không có module
- Ngưỡng: Green (≥90%), Yellow (70-90%), Red (<70%)

**Đánh giá hiệu suất (Performance Review):**
- Chu kỳ: tháng, quý, năm (configurable)
- 360-degree review: tự đánh giá + quản lý đánh giá + peer review (tuỳ chọn)
- Thang điểm configurable (1-5, 1-10, Exceeds/Meets/Below)
- Kết quả đánh giá → gắn với quyết định tăng lương/thưởng (HR module)
- Calibration: manager điều chỉnh để phân phối điểm cân bằng toàn team

**Báo cáo:**
- Phân phối điểm KPI toàn công ty
- Top/bottom performers
- OKR completion rate theo phòng ban
- Xu hướng theo thời gian

### Entities

```
OKRCycle { id, company_id, name, type: quarterly|yearly, start_date, end_date, status }
Objective {
  id, cycle_id, owner_type: company|dept|individual,
  owner_id, title, description, progress_pct, confidence: 0-100
}
KeyResult {
  id, objective_id, title, metric_type: number|percent|boolean,
  target_value, current_value, unit, progress_pct
}
KPIDefinition {
  id, company_id, name, department_id, role_id,
  data_source: manual|module, module_key, metric_key,
  target_value, unit, frequency: monthly|quarterly,
  thresholds: {green: number, yellow: number}
}
KPIRecord {
  id, kpi_def_id, employee_id, period, actual_value,
  achievement_pct, status: green|yellow|red, notes
}
PerformanceReview {
  id, company_id, cycle_id, reviewee_id, reviewer_id,
  type: self|manager|peer,
  scores: JSON, overall_score, strengths, improvements,
  status: draft|submitted|acknowledged, submitted_at
}
```

### Events Phát Ra

```
performance.kpi.red         → Alert employee + manager
performance.review.due      → Remind reviewee + reviewer
performance.review.complete → HR: input cho quyết định lương/thưởng
okr.checkin.missed          → Remind owner
```

### Phụ Thuộc Vào
- Foundation
- **HR** (tuỳ chọn): employee data, liên kết kết quả đánh giá với lương/thưởng
- **Sales** (tuỳ chọn): lấy KPI quota tự động
- **Projects** (tuỳ chọn): task completion rate → KPI cá nhân

### Cung Cấp Cho
- **HR**: kết quả review → input tăng lương, thưởng
- **Visibility**: KPI scores → department health score
- **AI C-Suite Agents**: KPI data để tổng hợp báo cáo lên CEO/HĐQT

### Standalone: ✅ Dùng độc lập như OKR tool (không cần module nghiệp vụ).

---

## Module 19: Cuộc Họp & Biên Bản (Meetings)

### Mô Tả
Quản lý vòng đời cuộc họp: lên lịch → chuẩn bị → họp → biên bản → follow-up action items. Đặc biệt quan trọng cho HĐQT và C-Suite để có audit trail quyết định.

### Chức Năng

**Lên lịch họp:**
- Tạo cuộc họp: tiêu đề, loại (1-1, team, HĐQT, board meeting, all-hands...), agenda
- Mời người tham gia: nội bộ hoặc khách ngoài (gửi email invite)
- Kiểm tra lịch trống (nếu tích hợp Google/Outlook calendar)
- Recurring meetings (họp daily standup, weekly review...)
- Nhắc trước 1 ngày / 1 giờ

**Chuẩn bị tài liệu:**
- Upload tài liệu đọc trước (pre-read materials)
- Agenda có thể gán người phụ trách từng điểm
- Tài liệu lưu kết nối với Documents module

**Trong cuộc họp:**
- Điểm danh: ai có mặt, vắng có phép, vắng không phép
- Ghi chú realtime (editor cộng tác)
- Ghi nhận quyết định (Decision log)
- Tạo action items ngay trong meeting: tên task, assignee, deadline

**Biên bản cuộc họp:**
- Template biên bản theo loại họp
- Auto-fill: ngày giờ, địa điểm, thành phần, nội dung từ ghi chú
- Ký duyệt biên bản (thư ký + chủ tọa)
- Lưu vào Documents module
- Gửi biên bản cho tất cả người tham dự

**Theo dõi sau họp:**
- Action items tự động tạo Tasks trong Projects module
- Theo dõi tiến độ action items: đã làm chưa? đúng deadline không?
- Báo cáo: % action items được hoàn thành đúng hạn

**HĐQT / Board Meetings:**
- Đặc biệt: ghi nhận từng nghị quyết, biểu quyết (số phiếu thuận/chống/vắng)
- Nghị quyết HĐQT có số hiệu, hiệu lực từ ngày
- Export biên bản nghị quyết đúng pháp lý

### Entities

```
Meeting {
  id, company_id, title, type: standup|team|1on1|board|all_hands|...,
  organizer_id, location, meeting_link,
  start_at, end_at, status: scheduled|in_progress|completed|cancelled,
  is_recurring, recurrence_rule
}
MeetingAttendee { id, meeting_id, user_id, email (khách ngoài), status: invited|accepted|declined|attended|absent }
MeetingAgendaItem { id, meeting_id, order, title, presenter_id, duration_minutes, notes }
MeetingNote { id, meeting_id, content, updated_by, updated_at }
MeetingDecision { id, meeting_id, title, description, made_by, effective_date }
MeetingActionItem {
  id, meeting_id, title, assignee_id, due_date,
  status: open|in_progress|done|overdue,
  task_id (linked Projects task)
}
BoardResolution {
  id, meeting_id, number, title, content,
  votes_for, votes_against, votes_abstain,
  status: passed|failed, effective_date, file_id
}
```

### Events Phát Ra

```
meeting.scheduled           → Notify attendees, calendar invite
meeting.action_item.created → Tạo Task trong Projects module
meeting.completed           → Gửi biên bản, reminder action items
meeting.action_item.overdue → Alert assignee + meeting organizer
board.resolution.passed     → Lưu nghị quyết, notify C-Suite thực thi
```

### Phụ Thuộc Vào
- Foundation
- **Documents** (tuỳ chọn): lưu biên bản, tài liệu cuộc họp
- **Projects** (tuỳ chọn): action items → tasks tự động
- **Approvals** (tuỳ chọn): quyết định họp cần duyệt chính thức

### Cung Cấp Cho
- **Projects**: action items → tasks
- **Documents**: biên bản họp được lưu tập trung
- **Visibility**: meeting cadence, action item completion rate
- **AI HĐQT Agents**: tổng hợp quyết định HĐQT, theo dõi thực thi nghị quyết

### Standalone: ✅ Dùng độc lập như công cụ quản lý cuộc họp nội bộ.
