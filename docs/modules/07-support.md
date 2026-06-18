# Group 7: Hỗ Trợ — Support Module

> **1 module** — Quản lý dịch vụ khách hàng sau bán hàng.  
> Hoàn toàn độc lập, có thể bật riêng lẻ.  
> Tích hợp Sales để có Customer 360 xuyên suốt từ lead → deal → support.

---

## Module 23: Dịch Vụ Khách Hàng (Customer Support)

### Mô Tả
Quản lý toàn bộ yêu cầu hỗ trợ sau bán hàng: tiếp nhận, phân loại, xử lý, đo lường hài lòng. Gồm ticketing system, knowledge base, và SLA management.

### Chức Năng

**Tiếp nhận đa kênh:**
- Email: tự động tạo ticket từ email gửi đến support@
- Chat widget: embed vào website/app
- Form hỗ trợ trên portal
- Tạo thủ công bởi nhân viên (VD: từ cuộc gọi)
- (Tuỳ chọn) Zalo, Facebook Messenger qua webhook

**Quản lý ticket:**
- Thông tin ticket: chủ đề, mô tả, loại (lỗi, hỏi đáp, yêu cầu tính năng, khiếu nại), độ ưu tiên
- Gắn với khách hàng (Customer từ Sales module nếu bật)
- Gắn với đơn hàng, hợp đồng (nếu module tương ứng bật)
- Stages: Open → In Progress → Pending Customer → Resolved → Closed
- Assign cho nhân viên hỗ trợ hoặc team
- Internal notes (chỉ nhân viên thấy) vs public replies
- Email thread sync: trả lời trong hệ thống → gửi email cho KH, KH reply → cập nhật ticket
- Merge tickets trùng lặp
- Escalate lên senior / manager

**SLA Management:**
- Định nghĩa SLA theo tier khách hàng hoặc loại ticket:
  - First response time: VD Tier A ≤ 2h, Tier B ≤ 8h
  - Resolution time: VD Critical ≤ 4h, Normal ≤ 24h
- Đồng hồ đếm ngược SLA trên mỗi ticket
- Alert khi SLA sắp vi phạm (30 phút trước)
- Tự động escalate khi vi phạm SLA
- SLA pause khi chờ phản hồi từ KH
- Báo cáo SLA compliance %

**Knowledge Base:**
- Viết và quản lý bài viết FAQ, hướng dẫn sử dụng
- Phân loại theo danh mục
- AI gợi ý bài viết liên quan khi nhân viên đang xử lý ticket
- Self-service portal: KH tự tìm câu trả lời trước khi tạo ticket
- Tracking: bài viết nào được xem nhiều, hữu ích không (thumbs up/down)

**AI trong Support:**
- Phân loại ticket tự động (loại, độ ưu tiên) khi tạo mới
- Gợi ý câu trả lời từ knowledge base
- ASSISTANT mode: AI draft reply → nhân viên review và gửi
- FULL mode: AI trả lời tự động các câu hỏi tier 1 (FAQ), escalate tier 2+ lên người

**Đo lường hài lòng:**
- CSAT (Customer Satisfaction): gửi survey sau khi ticket resolved
- Thang điểm 1-5 hoặc thumbs up/down
- NPS (Net Promoter Score): khảo sát định kỳ (tháng/quý)
- Comment từ KH

**Báo cáo:**
- Ticket volume theo thời gian, kênh, loại
- Agent performance: ticket count, avg resolution time, CSAT score
- SLA compliance theo tier/loại
- Xu hướng vấn đề (top issues → feedback cho product/sales)
- Customer health score từ support data

### Entities

```
SupportCategory { id, company_id, name, parent_id, sla_policy_id }
SLAPolicy {
  id, company_id, name,
  first_response_hours, resolution_hours,
  applies_to: {tier?: string[], priority?: string[]}
}
Ticket {
  id, company_id, number, subject, description,
  type: bug|question|feature_request|complaint|other,
  priority: low|medium|high|urgent,
  channel: email|chat|form|phone|manual,
  customer_id, contact_email, contact_name,
  order_id, contract_id,
  category_id, sla_policy_id,
  assignee_id, team_id,
  status: open|in_progress|pending_customer|resolved|closed,
  sla_first_response_deadline, sla_resolution_deadline,
  sla_first_response_breached: boolean, sla_resolution_breached: boolean,
  csat_score, csat_comment, csat_sent_at
}
TicketMessage {
  id, ticket_id, sender_type: agent|customer|system,
  sender_id, content, is_internal: boolean,
  attachments: file_id[], created_at
}
KBCategory { id, company_id, name, parent_id, order }
KBArticle {
  id, company_id, category_id, title, content,
  tags: string[], status: draft|published|archived,
  views, helpful_votes, unhelpful_votes,
  author_id, published_at, updated_at
}
CSATSurvey { id, ticket_id, customer_email, score: 1-5, comment, submitted_at }
```

### Events Phát Ra

```
support.ticket.created         → Notify assignee, start SLA clock
support.ticket.sla_warning     → Alert agent + supervisor (30min trước deadline)
support.ticket.sla_breached    → Alert manager, escalate
support.ticket.resolved        → Gửi CSAT survey
support.csat.submitted         → Cập nhật customer health score
support.ticket.escalated       → Notify senior/manager
```

### Events Tiêu Thụ

```
← sales.deal.won    → Tạo customer account trong Support (nếu chưa có)
← contract.signed   → Gắn tier KH theo hợp đồng (ảnh hưởng SLA)
```

### Phụ Thuộc Vào
- Foundation
- **Sales** (tuỳ chọn): Customer 360 — xem history deal khi xử lý ticket
- **Contracts** (tuỳ chọn): tier KH theo hợp đồng → SLA policy

### Cung Cấp Cho
- **Sales**: customer health signal (nhiều ticket = KH không happy)
- **Reports**: support metrics, CSAT trends
- **Visibility**: KPI "open tickets", "SLA compliance", "avg resolution time"
- **AI Support Agent**: context để AI tự xử lý tier 1 tickets

### Standalone: ✅ Hoàn toàn độc lập. Dùng như helpdesk software riêng lẻ.
