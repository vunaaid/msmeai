---
template: plan
version: "1.0"
usage: "AI dùng template này để tạo mọi kế hoạch trong hệ thống"
---

# 📋 PLAN TEMPLATE — [Tên Kế Hoạch]

---

## METADATA
```yaml
plan_id: PLN-[YYYY]-[NNN]          # Ví dụ: PLN-2026-001
title: "[Tên đầy đủ kế hoạch]"
type: [strategic|operational|project|campaign]
priority: [critical|high|medium|low]
status: DRAFT
requested_by: "[Tên + Role]"
owned_by: "[Tên + Role]"
approved_by: null
created_at: [YYYY-MM-DD]
approved_at: null
start_date: [YYYY-MM-DD]
end_date: [YYYY-MM-DD]
related_plans: []                  # Plan cha hoặc phụ thuộc
tags: []
```

---

## 1. BỐI CẢNH & LÝ DO (Context)

> AI tự điền từ phân tích dữ liệu

**Tại sao cần plan này:**
[AI mô tả ngắn gọn lý do, bối cảnh phát sinh]

**Dữ liệu nền AI đã phân tích:**
- [ ] Báo cáo tài chính gần nhất
- [ ] KPIs/OKRs hiện tại
- [ ] Kế hoạch trước đó liên quan
- [ ] Dữ liệu thị trường
- [ ] Feedback từ khách hàng/nhân viên

---

## 2. MỤC TIÊU (Objectives)

| # | Mục tiêu | Đo lường | Deadline | Trạng thái |
|---|---------|---------|---------|-----------|
| 1 | [Mục tiêu 1 — SMART] | [KPI cụ thể] | [DD/MM] | ⬜ Chưa bắt đầu |
| 2 | [Mục tiêu 2] | [KPI cụ thể] | [DD/MM] | ⬜ Chưa bắt đầu |
| 3 | [Mục tiêu 3] | [KPI cụ thể] | [DD/MM] | ⬜ Chưa bắt đầu |

---

## 3. WORKSTREAMS & TASKS

### WS-[N]: [Tên Workstream]
```
Owner: [Role + Tên người]
Budget: [X VND]
Timeline: [Ngày bắt đầu] → [Ngày kết thúc]
KPI: [Chỉ số đo lường thành công của WS này]
```

| Task ID | Tên Task | Người thực hiện | Deadline | Status | Ghi chú |
|---------|---------|----------------|---------|--------|--------|
| WS1-T1 | [Tên task] | [Tên] | [DD/MM] | 📥 TODO | |
| WS1-T2 | [Tên task] | [Tên] | [DD/MM] | 📥 TODO | |
| WS1-T3 | [Tên task] | [Tên] | [DD/MM] | 📥 TODO | |

---

## 4. MILESTONES

| ID | Tên Milestone | Ngày | Deliverable | Status |
|----|--------------|------|-------------|--------|
| M1 | [Tên] | [DD/MM/YY] | [Output cụ thể] | ⬜ |
| M2 | [Tên] | [DD/MM/YY] | [Output cụ thể] | ⬜ |
| M3 | [Tên] | [DD/MM/YY] | [Output cụ thể] | ⬜ |

---

## 5. NGÂN SÁCH

| Hạng mục | Dự toán | Thực chi | Còn lại | Ghi chú |
|---------|---------|---------|---------|--------|
| [Hạng mục 1] | [X VND] | 0 | [X VND] | |
| [Hạng mục 2] | [X VND] | 0 | [X VND] | |
| **TỔNG** | **[X VND]** | **0** | **[X VND]** | |

---

## 6. RỦI RO

| # | Rủi ro | Xác suất | Tác động | Biện pháp xử lý | Owner |
|---|--------|---------|---------|----------------|-------|
| R1 | [Mô tả] | Cao/TB/Thấp | Cao/TB/Thấp | [Biện pháp] | [Tên] |
| R2 | [Mô tả] | Cao/TB/Thấp | Cao/TB/Thấp | [Biện pháp] | [Tên] |

---

## 7. GIAO TIẾP & BÁO CÁO

```yaml
check_in_schedule: "Hàng tuần — Thứ Hai 9:00"
report_frequency:
  daily: [Danh sách nhận daily pulse]
  weekly: [Danh sách nhận weekly summary]
  monthly: [Danh sách nhận monthly review]
escalation_path:
  blocker: "→ Workstream Owner → Plan Owner → Người phê duyệt"
  critical: "→ CEO ngay lập tức"
```

---

## 8. ACTIVITY LOG
> AI tự động ghi lại mọi thay đổi, comment, quyết định

| Thời gian | Người | Hành động | Nội dung |
|---------|-------|---------|---------|
| [Tự động] | [AI] | Tạo Plan | Khởi tạo từ yêu cầu của [Tên] |

---

## 9. QUYẾT ĐỊNH & PHÊ DUYỆT

| Ngày | Quyết định | Người quyết định | Ghi chú |
|------|-----------|-----------------|--------|
| | | | |

---

## TRẠNG THÁI CUỐI (AI cập nhật realtime)

```
Plan Health:     ⬜ DRAFT
Tiến độ tổng:   0%
Budget used:    0%
Next milestone: [M1 — DD/MM/YY]
Days remaining: [X ngày]
Blockers:       0
Open tasks:     [X]
```
