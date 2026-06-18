# ⚙️ Implementation Guide — Triển Khai Thực Tế

> Hướng dẫn kỹ thuật để tích hợp User ↔ AI ↔ Workflow vào hệ thống thật.

---

## 1. SESSION LIFECYCLE — Vòng Đời Một Phiên Làm Việc

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  [User đăng nhập]                                          │
│       │                                                     │
│       ▼                                                     │
│  system_prompt = build_system_prompt(user_email)           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ # Bạn là AI trợ lý của [Tên công ty]               │   │
│  │ ## Vai trò hiện tại                                 │   │
│  │ Bạn đang hỗ trợ: Nguyễn Văn A                      │   │
│  │ Chức vụ: Giám đốc Kinh doanh                        │   │
│  │ Level: c-suite                                      │   │
│  │ Phòng ban: Kinh doanh                               │   │
│  │ Báo cáo cho: CEO                                    │   │
│  │ Quản lý: Trưởng phòng KD, NV Sales                 │   │
│  │                                                     │   │
│  │ ## Skill file đã nạp                               │   │
│  │ [Toàn bộ nội dung giam-doc-kinh-doanh.skill.md]    │   │
│  │                                                     │   │
│  │ ## Dữ liệu ngữ cảnh hiện tại                       │   │
│  │ - Pipeline: 47 deals, tổng 12.4 tỷ VND             │   │
│  │ - Quota tháng: 3.2 tỷ, đã đạt: 2.1 tỷ (66%)      │   │
│  │ - Deals sắp close tuần này: 3 deals                │   │
│  │                                                     │   │
│  │ ## Quy tắc bắt buộc                               │   │
│  │ - Chỉ thực thi trong thẩm quyền của role này      │   │
│  │ - Mọi hành động phải ghi log                       │   │
│  │ - Vượt thẩm quyền → tạo approval request          │   │
│  └─────────────────────────────────────────────────────┘   │
│       │                                                     │
│       ▼                                                     │
│  [User chat / ra lệnh]                                     │
│       │                                                     │
│       ▼                                                     │
│  AI phản hồi trong context của GĐ Kinh doanh              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. ROUTING ENGINE — Phân LOẠI & ĐIỀU PHỐI

```python
# routing_engine.py

class RoleAwareRouter:

    def route(self, message: str, user_session: UserSession):

        # 1. Xác định intent
        intent = self.classify_intent(message)
        # → "budget_request" | "report_query" | "approval" | "task_create" | ...

        # 2. Xác định scope
        scope = self.determine_scope(message, user_session.role)
        # → "self" | "team" | "department" | "company"

        # 3. Load skill constraint
        skill = load_skill(user_session.skill_file)
        authority = skill.get_authority_for(intent)

        # 4. Routing decision
        if authority == "SELF_EXECUTE":
            return ExecuteDirectly(intent, scope)

        elif authority == "NEEDS_APPROVAL":
            approver = skill.get_approver_for(intent)
            return CreateApprovalRequest(intent, approver)

        elif authority == "NOT_ALLOWED":
            return DenyWithExplanation(intent, user_session.role)

        elif authority == "ESCALATE":
            return EscalateToHuman(intent, user_session.reports_to)
```

---

## 3. APPROVAL ENGINE — Cơ Chế Duyệt

```python
# approval_engine.py

class ApprovalEngine:

    def create_approval_request(self, request: ApprovalRequest):

        # Build approval card
        card = ApprovalCard(
            id=generate_uuid(),
            from_user=request.requester,
            from_role=request.requester_role,
            action=request.action,
            context=request.context,
            ai_assessment=self.assess(request),   # AI phân tích
            ai_recommendation=self.recommend(request),  # AI gợi ý
            approver=request.approver,
            sla_hours=self.get_sla(request.approver_role),
            created_at=now()
        )

        # Gửi đến approver
        self.notify(card, channel=self.get_preferred_channel(card.approver))

        # Set timeout
        self.schedule_escalation(card, after_hours=card.sla_hours)

        return card

    def process_decision(self, card_id: str, decision: str, decider: User):

        card = self.get_card(card_id)

        if decision == "APPROVE":
            # Thực thi action
            result = self.execute_action(card.action)
            # Notify requester
            self.notify_requester(card, "approved", result)
            # Log
            self.audit_log(card, "approved", decider)

        elif decision == "REJECT":
            self.notify_requester(card, "rejected", reason=card.reject_reason)
            self.audit_log(card, "rejected", decider)

        elif decision == "ESCALATE":
            next_approver = self.get_next_level(card.approver_role)
            new_card = self.escalate(card, next_approver)
            self.notify(new_card)
```

---

## 4. NOTIFICATION MATRIX — Ai Được Thông Báo Gì

```
Event                    │ NV liên quan │ Trưởng phòng │ GĐ bộ phận │ CEO
─────────────────────────┼──────────────┼──────────────┼────────────┼─────
Task assigned            │ ✅ Ngay      │ ✅ Summary   │ ─          │ ─
Task completed           │ ✅ Confirm   │ ✅ Daily sum │ ─          │ ─
Task overdue 1 ngày      │ ✅ Reminder  │ ✅ Alert     │ ─          │ ─
Task overdue 3 ngày      │ ✅ Warning   │ ✅ Alert     │ ✅ Alert   │ ─
KPI dưới 80%             │ ─            │ ✅ Alert     │ ✅ Alert   │ ─
KPI dưới 60%             │ ─            │ ✅ Alert     │ ✅ Alert   │ ✅ Alert
Deal won lớn (>1 tỷ)     │ ✅ 🎉        │ ✅ 🎉        │ ✅ 🎉      │ ✅ Brief
Deal lost lớn (>1 tỷ)    │ ✅ Note      │ ✅ Alert     │ ✅ Alert   │ ✅ Alert
Approval pending > SLA   │ ─            │ Escalate ↑   │ Escalate ↑ │ Escalate ↑
System incident P1       │ ─            │ ─            │ ✅ Ngay    │ ✅ Ngay
Crisis (PR)              │ ─            │ ─            │ ✅ Ngay    │ ✅ Ngay
```

---

## 5. CONVERSATIONAL PATTERNS — Mẫu Hội Thoại

### Pattern A: Đơn giản — Hỏi & Trả lời

```
User (GĐ KD): "Deal với Vinamilk đang ở đâu rồi?"

AI Response:
  Deal: Vinamilk ERP Project
  Stage: Negotiation (Stage 4/5)
  Value: 1.2 tỷ VND
  Owner: Sales Rep Minh
  Last activity: 3 ngày trước (email follow-up)
  Next action: Chờ feedback từ procurement
  Risk: ⚠️ Stuck 3 ngày, cần push

  Bạn muốn: [📞 Gọi KH ngay] [📧 Gửi follow-up] [📋 Xem full history]
```

### Pattern B: Phức tạp — Multi-step với confirmation

```
User (Trưởng phòng NS): "Lên kế hoạch tuyển 3 Sales Rep
                          trong tháng tới"

AI Response (Step 1 — Thu thập thông tin):
  Để lên kế hoạch tuyển dụng, tôi cần xác nhận:

  1. JD: Dùng template Sales Rep có sẵn, hay điều chỉnh?
     [Dùng template] [Điều chỉnh] [Tôi sẽ upload JD mới]

  2. Kênh đăng tuyển: LinkedIn + JobsDB + Referral (recommended)
     hay bạn muốn thêm/bớt kênh?

  3. Timeline: Start date dự kiến?  [Nhập ngày...]

User: "Dùng template, LinkedIn + Referral thôi, start 1/7"

AI Response (Step 2 — Xây kế hoạch):
  ✅ Kế hoạch tuyển dụng 3 Sales Rep:

  Tuần 1 (27/5 - 2/6): Đăng JD, active sourcing
  Tuần 2-3 (3/6 - 16/6): CV screening, phone screen
  Tuần 4-5 (17/6 - 27/6): Interview vòng 1+2
  Tuần 6 (27/6 - 30/6): Offer, negotiation
  1/7: Start date

  Tôi sẽ tự động:
  • Đăng JD trên LinkedIn hôm nay
  • Setup sourcing campaign LinkedIn Recruiter
  • Tạo pipeline trong ATS
  • Lên lịch review CV mỗi sáng thứ 2+5

  Cần headcount approval từ GĐ NS trước.
  [🚀 Gửi approval request] [✏️ Chỉnh kế hoạch] [❌ Hủy]
```

### Pattern C: Khẩn cấp — Alert & Action

```
AI (chủ động, không đợi user hỏi):

🚨 Alert cho GĐ Tài chính — 9:47 sáng:

"Số dư tài khoản chính xuống dưới ngưỡng an toàn:

Số dư hiện tại:  2.3 tỷ VND
Ngưỡng cảnh báo: 3.0 tỷ VND
Chi phí dự kiến tuần này: 1.8 tỷ VND
→ Nguy cơ thiếu tiền trong 4-5 ngày

Phân tích:
• 3 khoản phải thu chưa thu: 2.1 tỷ (quá hạn 5-10 ngày)
• ABC Corp: 800M (liên hệ để thúc đẩy)
• XYZ Ltd: 900M (hóa đơn gửi 12 ngày chưa thanh toán)

Đề xuất hành động:
[📞 Gọi thu hồi công nợ ngay]
[💳 Kích hoạt hạn mức tín dụng ngân hàng]
[⚠️ Báo CEO về tình hình]"
```

---

## 6. LUỒNG DỮ LIỆU — Data Flow

```
USER ACTION
    │
    ▼
┌──────────────────────────────────────────────────────┐
│                MESSAGE PROCESSOR                      │
│  Parse → Enrich → Route → Execute → Store → Notify   │
└──────────────────────────────────────────────────────┘
    │                   │                    │
    ▼                   ▼                    ▼
AUDIT LOG          DATA STORES         NOTIFICATION
(bất biến)         ┌──────────┐        SERVICE
                   │   CRM    │
                   │   ERP    │        Slack / Email /
                   │  HRIS    │        SMS / Dashboard
                   │  Drive   │
                   └──────────┘
```

---

*Đọc thêm: [USER-AI-INTERACTION.md](USER-AI-INTERACTION.md) và [AI-WORKFLOW-ARCHITECTURE.md](AI-WORKFLOW-ARCHITECTURE.md)*
