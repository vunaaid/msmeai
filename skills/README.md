# vSME Agent Skills

Mỗi file `.skill.md` định nghĩa một AI agent trong hệ thống. Được parse bởi `packages/ai-sdk/src/skill/parser.ts`.

## Format File

```markdown
---
agent_id: <unique_id>          # Unique identifier, dùng trong URL /ai/chat/<agent_id>
display_name: "Tên Hiển Thị"   # Tên tiếng Việt hiển thị cho người dùng
level: c_suite                 # board | c_suite | manager | staff | special
department: "Phòng Ban"        # Phòng ban/bộ phận
reports_to: ceo                # agentId của cấp trên trực tiếp
manages: [cfo, chro]           # agentId của những người trực thuộc
preferred_provider: claude     # claude | gemini | ollama (optional)
preferred_model: claude-sonnet-4-6  # Model cụ thể (optional)
modules: [gl, invoice, ar]     # Modules agent có quyền truy cập
capabilities:
  - "Mô tả khả năng 1"
  - "Mô tả khả năng 2"
authority_table:
  - action: "approve_payment"
    result: "SELF_EXECUTE"        # SELF_EXECUTE | NEEDS_APPROVAL | ESCALATE | NOT_ALLOWED
    condition:                    # (optional)
      field: "amount"
      operator: "<="              # < | > | <= | >= | == | in | not_in
      value: 200000000
    approver: "ceo"               # (optional) - ai cần approve
    note: "Ghi chú"              # (optional)
workflow_triggers:
  - event: "invoice.outgoing.confirmed"
    action: "verify_gl_posting"
kpis:
  - name: "Tên KPI"
    metric: "module.metric_key"
    unit: "VND"
    frequency: "monthly"
---

# Tiêu đề Agent

[Nội dung markdown — sẽ được inject vào system prompt của LLM]

## Trách Nhiệm Chính
...
```

## Danh Sách Agents (26 files)

| File | Agent | Level | Manages |
|------|-------|-------|---------|
| `orchestrator.skill.md` | Orchestrator | special | Tất cả |
| `board_chair.skill.md` | Chủ Tịch HĐQT | board | CEO |
| `board_member.skill.md` | Thành Viên HĐQT | board | — |
| `ceo.skill.md` | CEO | c_suite | C-Suite |
| `cfo.skill.md` | CFO | c_suite | Finance Manager |
| `coo.skill.md` | COO | c_suite | Ops Manager |
| `cmo.skill.md` | CMO | c_suite | Sales Manager |
| `cto.skill.md` | CTO | c_suite | — |
| `chro.skill.md` | CHRO | c_suite | HR Manager |
| `clo.skill.md` | CLO | c_suite | — |
| `finance_manager.skill.md` | Trưởng Phòng Tài Chính | manager | Accountant |
| `sales_manager.skill.md` | Trưởng Phòng Kinh Doanh | manager | Sales Staff |
| `hr_manager.skill.md` | Trưởng Phòng Nhân Sự | manager | HR Staff |
| `admin_manager.skill.md` | Trưởng Phòng Hành Chính Tổng Hợp | manager | Doc Manager |
| `ops_manager.skill.md` | Trưởng Phòng Vận Hành | manager | Procurement Staff |
| `project_manager.skill.md` | Trưởng Phòng Dự Án | manager | — |
| `support_manager.skill.md` | Trưởng Phòng CSKH | manager | Support Staff |
| `accountant.skill.md` | Kế Toán Viên | staff | — |
| `sales_staff.skill.md` | Nhân Viên Kinh Doanh | staff | — |
| `hr_staff.skill.md` | Nhân Viên Nhân Sự | staff | — |
| `admin_staff.skill.md` | Nhân Viên Hành Chính | staff | — |
| `procurement_staff.skill.md` | Nhân Viên Mua Hàng | staff | — |
| `support_staff.skill.md` | Nhân Viên CSKH | staff | — |
| `report_analyzer.skill.md` | Report Analyzer | special | — |
| `doc_manager.skill.md` | Document Manager | special | — |
| `meeting_assistant.skill.md` | Meeting Assistant | special | — |

## Authority Results

| Result | Ý Nghĩa | Hành Động |
|--------|---------|-----------|
| `SELF_EXECUTE` | Trong thẩm quyền | Tự thực hiện (Full) hoặc đề xuất (Assistant) |
| `NEEDS_APPROVAL` | Vượt thẩm quyền | Tạo approval request, chờ người có thẩm quyền |
| `ESCALATE` | Cần chuyển cấp | Chuyển ngay lên cấp trên |
| `NOT_ALLOWED` | Không được phép | Từ chối, giải thích lý do |

## Chú Ý Khi Thêm Agent

1. `agent_id` phải **unique** trong toàn bộ skills directory
2. `reports_to` phải là `agent_id` của một agent khác đã tồn tại
3. Authority table được evaluate **theo thứ tự**, rule đầu tiên khớp sẽ win
4. Rule có `condition` được ưu tiên hơn rule không có `condition`
5. Skill file là **source of truth** cho behavior của agent — không hard-code logic trong code
