# 🔗 Cơ Chế Tương Tác User (theo Role) với AI và Workflow

> **Nguyên tắc:** Mỗi user được nhận diện bởi **role**, không phải tên. AI phản hồi khác nhau với cùng một yêu cầu — tùy thuộc vào người hỏi là ai trong tổ chức.

---

## 1. TỔNG QUAN KIẾN TRÚC TƯƠNG TÁC

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER (Con người)                              │
│   Gõ lệnh / Nói / Click button / Gửi email / Submit form       │
└──────────────────────────────┬──────────────────────────────────┘
                               │  Input (ngôn ngữ tự nhiên)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                  IDENTITY & AUTH LAYER                           │
│                                                                 │
│  ① Xác thực: Bạn là ai?  →  SSO / Token / Session              │
│  ② Tra cứu Role Profile:  →  role_registry.json                │
│  ③ Load Permission Set:   →  từ skill.md của role đó            │
└──────────────────────────────┬──────────────────────────────────┘
                               │  role + permissions confirmed
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│               CONTEXT BUILDER (Xây dựng ngữ cảnh)              │
│                                                                 │
│  • Skill file của role hiện tại                                 │
│  • Lịch sử hội thoại gần đây (short-term memory)               │
│  • Trạng thái workflow đang dang dở (nếu có)                   │
│  • Dữ liệu liên quan từ CRM/ERP/HRIS                           │
└──────────────────────────────┬──────────────────────────────────┘
                               │  enriched context
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AI REASONING ENGINE                          │
│                                                                 │
│  • Hiểu ý định (intent) của user                               │
│  • Đối chiếu với thẩm quyền trong skill.md                     │
│  • Chọn workflow phù hợp                                        │
│  • Sinh ra hành động / phản hồi                                 │
└──────────────────────────────┬──────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
         [Thực thi]    [Tạo Approval    [Yêu cầu thêm
          trực tiếp     Request]         thông tin]
              │                │
              ▼                ▼
         [Phản hồi       [Notification
          User +          → Người có
          Log]            thẩm quyền]
```

---

## 2. NHẬN DIỆN ROLE & CẤP PHÉP

### 2.1 Role Registry — Bảng Ánh Xạ User → Role → Skill

```json
// role_registry.json
{
  "users": {
    "nguyen.van.a@company.com": {
      "name": "Nguyễn Văn A",
      "role": "giam-doc-dieu-hanh",
      "skill_file": "c-suite/giam-doc-dieu-hanh.skill.md",
      "level": "c-suite",
      "department": "ban-giam-doc",
      "can_escalate_to": null,
      "manages": ["giam-doc-tai-chinh", "giam-doc-marketing", "..."]
    },
    "tran.thi.b@company.com": {
      "name": "Trần Thị B",
      "role": "nhan-vien-kinh-doanh",
      "skill_file": "departments/kinh-doanh/nhan-vien.skill.md",
      "level": "staff",
      "department": "kinh-doanh",
      "can_escalate_to": "truong-phong-kinh-doanh",
      "manages": []
    }
  }
}
```

### 2.2 Cùng Câu Hỏi — AI Trả Lời Khác Nhau Theo Role

**Tình huống:** Tất cả đều hỏi *"Doanh thu tháng này thế nào?"*

```
┌──────────────────────┬────────────────────────────────────────────┐
│ Người hỏi            │ AI phản hồi                                │
├──────────────────────┼────────────────────────────────────────────┤
│ CEO                  │ Dashboard tổng hợp: doanh thu tất cả       │
│                      │ phòng ban, so sánh kế hoạch, top 5 deals,  │
│                      │ forecast quý + gợi ý chiến lược            │
├──────────────────────┼────────────────────────────────────────────┤
│ GĐ Kinh doanh        │ Pipeline breakdown, win rate, top deals,   │
│                      │ Sales Rep leaderboard, forecast vs. quota  │
├──────────────────────┼────────────────────────────────────────────┤
│ Trưởng phòng KD      │ Danh sách deals của phòng mình, ai cần     │
│                      │ support, deals sắp close tuần này          │
├──────────────────────┼────────────────────────────────────────────┤
│ Nhân viên Sales      │ Doanh thu cá nhân vs. quota, deals đang    │
│                      │ open, next actions cần làm                 │
├──────────────────────┼────────────────────────────────────────────┤
│ CFO                  │ Revenue recognized, cash received, AR      │
│                      │ aging, projected cash flow                 │
├──────────────────────┼────────────────────────────────────────────┤
│ Nhân viên Kế toán    │ "Bạn không có quyền xem báo cáo doanh      │
│                      │ thu. Hãy liên hệ CFO hoặc Kế toán trưởng" │
└──────────────────────┴────────────────────────────────────────────┘
```

---

## 3. CÁC KÊNH TƯƠNG TÁC (Input Channels)

```
┌─────────────────────────────────────────────────────────────┐
│                    INPUT CHANNELS                            │
├────────────┬───────────────┬────────────────┬───────────────┤
│   SLACK    │    EMAIL      │  WEB PORTAL    │   VOICE       │
│   Bot      │   (AI parse)  │  (Dashboard)   │   (Meeting)   │
├────────────┼───────────────┼────────────────┼───────────────┤
│ @ai approve│ Gửi email     │ Click button   │ Nói vào mic   │
│  deal này  │ với subject   │ "Phê duyệt"    │ sau meeting   │
│            │ [APPROVAL]    │                │               │
│ /report    │               │ Submit form    │ AI transcribe │
│  tuần      │ AI tự phân    │                │ + tạo action  │
│            │ loại và xử lý │ Drag-drop      │ items         │
│ /approve   │               │ kanban tasks   │               │
│  #deal-123 │               │                │               │
└────────────┴───────────────┴────────────────┴───────────────┘
         │              │              │              │
         └──────────────┴──────────────┴──────────────┘
                                │
                    [Unified Message Queue]
                                │
                    [AI Router — nhận diện user
                     + intent + route đúng agent]
```

---

## 4. TƯƠNG TÁC THEO TỪNG ROLE CỤ THỂ

### 4.1 CEO ↔ AI

```
Kênh ưu tiên: Slack DM, Voice (meeting summary), Dashboard

CEO nói:                          AI làm:
─────────────────────────────────────────────────────
"Tổng hợp tuần cho tôi"      →   Pull data từ 7 GĐ bộ phận
                                  Phân tích xu hướng
                                  Highlight 3 vấn đề cần chú ý
                                  Gửi PDF summary trong 2 phút

"Marketing đang kém. Xem lại" →   Pull KPIs Marketing tháng này
                                  So sánh 3 tháng trước
                                  Phân tích root cause
                                  Draft email yêu cầu action plan
                                  → Gửi CEO review trước khi send

"Có deal nào sắp mất không?"  →   Scan CRM: deals ở risk stage
                                  Rank theo value × risk score
                                  Suggest intervention action
                                  Option: [Tôi sẽ gọi KH] [Assign GĐ KD]

"Họp HĐQT thứ 6 tuần sau"    →   Tạo agenda draft
                                  Gửi reminder cho các GĐ nộp báo cáo
                                  Book phòng họp
                                  Chuẩn bị tài liệu tổng hợp
```

---

### 4.2 CFO ↔ AI

```
Kênh ưu tiên: Web Portal (Finance Dashboard), Email, Slack

CFO nói:                          AI làm:
─────────────────────────────────────────────────────
"Phê duyệt PO #1234"          →   Kiểm tra: < 100M VND?
                                  Kiểm tra: Đủ ngân sách phòng ban?
                                  Kiểm tra: Đủ chứng từ?
                                  ✅ Tự động approve + notify requester
                                  Ghi log với timestamp

"Báo cáo cash flow tháng 6"   →   Generate từ dữ liệu ngân hàng + kế toán
                                  So sánh với forecast tháng trước
                                  Highlight variance > 5%
                                  Gửi PDF trong 3 phút

"Phòng Marketing chi vượt     →   Pull chi tiết từng transaction
 ngân sách rồi"                    So sánh vs. budget approved
                                  Phân loại: authorized vs. unauthorized
                                  Draft email yêu cầu giải trình gửi CMO
```

---

### 4.3 GĐ Kinh Doanh ↔ AI

```
Kênh ưu tiên: Slack, CRM embedded AI, Mobile app

GĐ KD nói:                        AI làm:
─────────────────────────────────────────────────────
"Pipeline tuần này?"           →   Pull từ CRM: tất cả open deals
                                  Tính weighted forecast
                                  Flag: deals stuck > 14 ngày
                                  Suggest: ai nên được coaching

"Assign deal ABC cho Minh"     →   Update CRM: owner = Minh
                                  Notify Minh với deal context
                                  Set follow-up reminder T+2 ngày
                                  Log change với reason

"Forecast tháng này có đạt    →   Model forecast với 3 scenarios
 quota không?"                     (Optimistic/Base/Pessimistic)
                                  Show probability based on pipeline
                                  Suggest deals cần push để đạt target

"Tổng kết team sales tuần"    →   Pull activity metrics từng NV
                                  Calls made, deals advanced, revenue
                                  Leaderboard + bottom performers
                                  Suggest 1-1 topics cho từng người
```

---

### 4.4 Trưởng Phòng ↔ AI

```
Kênh ưu tiên: Slack, Project Management Tool (Jira/Trello)

Trưởng phòng KD:                  AI làm:
─────────────────────────────────────────────────────
"Phân công task tuần mới"     →   Pull sprint backlog
                                  Check workload hiện tại từng NV
                                  Suggest phân công dựa trên skills + availability
                                  Tạo tasks trong Jira + assign
                                  Gửi brief cho từng người

"Review proposal của Minh"    →   Đọc proposal draft
                                  Check vs. checklist chuẩn
                                  Highlight: missing sections, sai số liệu
                                  Suggest edits cụ thể
                                  "Cần sửa 3 điểm trước khi gửi KH"

"Báo cáo tháng cho GĐ"       →   Pull KPIs của phòng
                                  So sánh vs. target
                                  Tổng hợp achievements + issues
                                  Draft slide/report
                                  → Trưởng phòng review + submit
```

---

### 4.5 Nhân Viên ↔ AI

```
Kênh ưu tiên: Slack, Email, Tool tích hợp (CRM/Kế toán phần mềm)

Nhân viên Sales:                  AI làm:
─────────────────────────────────────────────────────
"Chuẩn bị brief về KH ABC     →   Pull từ CRM: lịch sử tương tác
 trước khi gặp"                    Research công ty: size, ngành, news
                                  Identify pain points từ conversations cũ
                                  Suggest agenda cho cuộc gặp
                                  Tạo 1-page brief trong 2 phút

"Tạo proposal cho deal này"   →   Pull template phù hợp ngành KH
                                  Điền thông tin KH từ CRM
                                  Điền giải pháp dựa trên need đã ghi
                                  Tính giá theo price list
                                  → Output: draft proposal
                                  → Nhân viên review → Trưởng phòng approve

"Ghi chú cuộc họp vừa xong"  →   [Voice input / paste notes]
                                  Transcribe nếu là voice
                                  Extract: key decisions, action items, owners
                                  Update CRM tự động
                                  Gửi meeting summary cho participants

Nhân viên Kế toán:
─────────────────────────────────────────────────────
[Upload ảnh hóa đơn]          →   OCR: đọc thông tin hóa đơn
                                  Validate: đủ thông tin theo checklist?
                                  Suggest hạch toán account
                                  Tạo draft entry trong phần mềm KT
                                  → Nhân viên confirm → Submit

"Đối chiếu sao kê ngân hàng   →   Import file CSV từ ngân hàng
 tháng 6"                          Match với giao dịch trong sổ KT
                                  Highlight: unmatched transactions
                                  Report: đối chiếu hoàn thành 96%
                                  List: 4 giao dịch cần kiểm tra thủ công

Nhân viên HR:
─────────────────────────────────────────────────────
[Upload batch CV]              →   Parse từng CV: skills, experience, edu
                                  Score vs. JD requirements
                                  Rank: Top 10 ứng viên phù hợp nhất
                                  Draft email mời phỏng vấn top candidates
                                  → Nhân viên HR review list → Approve → Send

"Tính lương tháng 6"          →   Pull chấm công từ HRIS
                                  Tính: gross salary + OT + allowance
                                  Tính: BHXH, TNCN deductions
                                  Generate: payroll sheet
                                  → Trưởng phòng verify → CFO approve → Pay
```

---

## 5. LUỒNG APPROVAL — CƠ CHẾ NGƯỜI DUYỆT

### 5.1 Approval Request Flow

```
              NV yêu cầu (qua Slack/Portal)
                         │
                         ▼
              ┌──────────────────────┐
              │  AI kiểm tra thẩm   │
              │  quyền của NV này   │
              └──────────┬───────────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
    Trong thẩm quyền            Vượt thẩm quyền
          │                             │
          ▼                             ▼
    AI tự thực thi          AI tạo Approval Card:
    + notify NV             ┌─────────────────────┐
                            │ 📋 APPROVAL REQUEST  │
                            │ From: NV Minh        │
                            │ Action: Giảm giá 12% │
                            │ Deal: ABC Corp        │
                            │ Value: 450M VND       │
                            │ Reason: KH compare   │
                            │  với đối thủ         │
                            │                      │
                            │ AI Assessment:        │
                            │ ⚠️ Trên 10% → cần    │
                            │ GĐ KD approve        │
                            │                      │
                            │ [✅ APPROVE]          │
                            │ [❌ REJECT]           │
                            │ [💬 DISCUSS]          │
                            └─────────────────────┘
                                    │
                            Gửi đến GĐ KD
                            qua Slack/Email
                                    │
                    ┌───────────────┼───────────────┐
                 Approve         Reject           Discuss
                    │               │               │
                    ▼               ▼               ▼
            AI thực thi    AI notify NV     AI tạo thread
            + log lý do    lý do từ chối   thảo luận
            approve        + suggest alt    giữa NV + GĐ
```

### 5.2 Approval theo Cấp (Multi-level)

```
Ví dụ: Nhân viên xin phê duyệt chi phí 800M VND

NV submit request
       │
       ▼
AI check: 800M > 500M (ngưỡng CEO)
       │
       ▼
AI tự routing:
  Step 1 → Trưởng phòng review (context check)
       │  ← Approve trong 4h
       ▼
  Step 2 → GĐ Tài chính review (financial check)
       │  ← Approve trong 8h
       ▼
  Step 3 → CEO final approval
       │  ← Approve/Reject
       ▼
  AI thực thi + notify toàn chain

Timeout rules:
  Trưởng phòng không duyệt trong 4h → Escalate tự động
  GĐ TC không duyệt trong 8h → Alert CEO
  Urgent flag → SLA giảm còn 1h mỗi cấp
```

---

## 6. INTERACTION PATTERNS THEO TÌNH HUỐNG

### 6.1 Pattern: "Yêu cầu thông tin" (Query)

```
User: "Doanh thu phòng Marketing tháng trước?"

AI xử lý:
  1. Xác định role user: CFO
  2. Check permission: CFO có quyền xem?  ✅
  3. Pull data từ ERP
  4. Format phù hợp với CFO (financial view)
  5. Trả lời ngay + offer: "Bạn muốn xem breakdown chi tiết không?"

Nếu user là NV Marketing:
  2. Check permission: NV có quyền xem?  ❌ (chỉ xem của mình)
  4. "Bạn có thể xem KPIs cá nhân của mình tại đây: [link]
      Để xem doanh thu phòng, hãy liên hệ Trưởng phòng."
```

---

### 6.2 Pattern: "Ra lệnh thực thi" (Command)

```
User (Trưởng phòng KD): "Gửi email follow-up cho tất cả deals
                          chưa có phản hồi trong 5 ngày"

AI xử lý:
  1. Xác định role: Trưởng phòng KD  ✅
  2. Check thẩm quyền: Có quyền gửi email CRM?  ✅
  3. AI không thực thi NGAY — tạo preview:

  ┌─────────────────────────────────────────────────┐
  │ 📧 Preview: 7 email sẽ được gửi                 │
  │                                                  │
  │ 1. ABC Corp (Minh phụ trách) - stuck 6 ngày     │
  │    Template: "Follow-up sau 5 ngày"              │
  │                                                  │
  │ 2. XYZ Ltd (Hoa phụ trách) - stuck 8 ngày       │
  │    Template: "Follow-up khẩn"                   │
  │                                                  │
  │ ... +5 deals khác                                │
  │                                                  │
  │ [✅ Gửi tất cả]  [👁️ Review từng cái]  [❌ Hủy] │
  └─────────────────────────────────────────────────┘

  4. User click "Gửi tất cả" → AI execute + log
```

---

### 6.3 Pattern: "Xử lý sự kiện" (Event Handling)

```
Sự kiện xảy ra: KH gửi email phàn nàn về dịch vụ

AI tự động (không cần user ra lệnh):
  1. Parse email → Phân loại: Complaint, Tier 2
  2. Check: KH này ai phụ trách? → AM Hoa
  3. Check skill.md Nhân viên KD:
     "NẾU KH phàn nàn → Báo Trưởng phòng + xử lý trong 24h"
  4. AI gửi notification cho AM Hoa:
     ┌────────────────────────────────────┐
     │ 🚨 KH phàn nàn cần xử lý          │
     │ KH: ABC Corp                       │
     │ Nội dung: [tóm tắt AI]            │
     │ SLA: Phản hồi trong 24h           │
     │                                    │
     │ AI đề xuất:                        │
     │ • Gọi điện xin lỗi trực tiếp      │
     │ • Offer discount 10% lần sau      │
     │ • Escalate GĐ KD nếu nghiêm trọng │
     │                                    │
     │ [📞 Gọi ngay] [📧 Gửi email]       │
     │ [⬆️ Escalate Trưởng phòng]         │
     └────────────────────────────────────┘
  5. Set reminder: Nếu 4h không có action → Alert Trưởng phòng
```

---

### 6.4 Pattern: "Khủng hoảng" (Crisis)

```
Sự kiện: Báo chí đăng bài tiêu cực về công ty

AI phát hiện qua media monitoring:
  │
  ▼
Mức độ: CRITICAL (> 500 interactions trong 30 phút)
  │
  ▼
AI bypass normal chain → Alert ĐỒNG THỜI:
  • CEO (Slack + SMS)
  • GĐ PR (Slack + call)
  • Pháp lý (Email + Slack)
  │
  ▼
AI tạo Crisis Brief tự động:
  ┌──────────────────────────────────────┐
  │ 🚨 CRISIS ALERT — 14:32             │
  │                                      │
  │ Bài viết: [link]                     │
  │ Tòa soạn: VnExpress                  │
  │ Reach: 12,400 views (30 phút)        │
  │ Sentiment: Tiêu cực 87%              │
  │ Trend: Đang leo thang ↑              │
  │                                      │
  │ Nội dung chính: [tóm tắt AI]        │
  │                                      │
  │ Comments đáng chú ý:                 │
  │ • [quote 1]                          │
  │ • [quote 2]                          │
  │                                      │
  │ AI tạm dừng: Tất cả scheduled posts  │
  │ Đang chờ lệnh từ GĐ PR / CEO        │
  │                                      │
  │ [📝 Tạo draft statement]             │
  │ [🔇 Mute tất cả channels]            │
  │ [📞 Gọi họp khẩn ngay]              │
  └──────────────────────────────────────┘
  │
  ▼
AI KHÔNG tự phát ngôn — chờ CEO/GĐ PR chỉ đạo
```

---

## 7. GIAO TIẾP GIỮA CÁC AI AGENTS (Agent-to-Agent)

```
Tình huống: Lead mới được tạo trong CRM
             → Trigger nhiều agents cùng lúc

[Lead created: ABC Corp, Budget: 2 tỷ, Need: Phần mềm ERP]
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   Marketing          Sales           Finance
   Agent              Agent           Agent
      │                  │               │
  "Lead này             "Tôi sẽ        "Deal 2 tỷ →
   khớp với            assign cho      cần CFO
   campaign X"         Minh vì        approve khi
      │                  anh ấy        ký HĐ"
      │               expertise         │
      │               ERP"              │
      └──────────────────┴───────────────┘
                         │
              [Orchestrator Agent tổng hợp]
                         │
                         ▼
              Tạo unified action plan:
              1. Sales (Minh) nhận deal + brief
              2. Marketing gắn tag campaign X vào lead
              3. Finance đặt flag: "Cần CFO khi > 1 tỷ"
              4. Notify GĐ KD: deal chiến lược mới
```

---

## 8. MEMORY & CONTEXT — AI NHỚ GÌ?

```
┌────────────────────────────────────────────────────────┐
│                   3 TẦNG MEMORY                        │
├────────────────────────────────────────────────────────┤
│                                                        │
│  SHORT-TERM (Session Memory)           TTL: 1 phiên    │
│  ├── Cuộc hội thoại đang diễn ra                      │
│  ├── Context của task đang xử lý                      │
│  └── Decisions vừa được approved/rejected              │
│                                                        │
│  MEDIUM-TERM (Working Memory)          TTL: 30 ngày    │
│  ├── Lịch sử request của user này                     │
│  ├── Workflow đang dang dở                            │
│  ├── Preferences của role này                         │
│  └── Recent KPIs và alerts                            │
│                                                        │
│  LONG-TERM (Organizational Memory)    Permanent        │
│  ├── Skill files (rules, workflows)                   │
│  ├── Org chart, reporting lines                       │
│  ├── Historical KPIs & reports                        │
│  ├── Customer profiles (CRM)                          │
│  └── Audit logs (all AI actions)                      │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## 9. GIAO DIỆN TƯƠNG TÁC THEO ROLE

### CEO — Command Center Dashboard

```
┌──────────────────────────────────────────────────────────┐
│  🏢 CEO COMMAND CENTER                    [Thứ 4, 27/5]  │
├────────────┬────────────────┬────────────────────────────┤
│ 🔴 ALERTS  │ 📊 KPIs        │ 🤖 AI ASSISTANT            │
│            │                │                            │
│ ⚠️ Marketing│ Revenue: 87%  │ "Hôm nay bạn cần làm gì?" │
│  under KPI │  of target     │                            │
│            │                │ 📌 Pending của bạn (3):   │
│ ⚠️ Deal ABC│ Leads: 112    │  • Approve deal ABC (800M) │
│  sắp mất   │  (+12% MoM)   │  • Review báo cáo CFO     │
│            │                │  • Họp HĐQT chuẩn bị      │
│ ✅ HR target│ Headcount: OK │                            │
│  on track  │                │ [Gõ lệnh cho AI...]        │
└────────────┴────────────────┴────────────────────────────┘
```

### Nhân Viên Sales — Daily Assistant

```
┌──────────────────────────────────────────────────────────┐
│  💼 MY SALES DASHBOARD — Minh              [27/5/2026]   │
├────────────────────────────────────────────────────────  │
│ Quota tháng: ████████░░ 78% (còn 3 ngày)                │
│                                                          │
│ 🎯 CẦN LÀM HÔM NAY:                                    │
│  1. [📞] Gọi ABC Corp — stuck 6 ngày (2 tỷ deal!)      │
│  2. [📧] Gửi proposal cho XYZ Ltd — họ đang chờ         │
│  3. [📝] Cập nhật CRM cho 3 deals chưa update           │
│                                                          │
│ AI đã làm cho bạn:                                       │
│  ✅ Gửi follow-up email cho 2 leads                      │
│  ✅ Chuẩn bị brief trước cuộc gặp 2pm                   │
│  ✅ Nhắc nhở lịch demo ngày mai                         │
│                                                          │
│ 💬 Hỏi AI: [___________________________]  [Gửi]         │
└──────────────────────────────────────────────────────────┘
```

---

## 10. THIẾT KẾ LUỒNG HOÀN CHỈNH: TỪ INPUT ĐẾN OUTPUT

```
USER INPUT (bất kỳ kênh nào)
"Tôi muốn tạo đề xuất tăng ngân sách marketing 20%"
                         │
                         ▼
            ┌────────────────────────┐
            │  Bước 1: AUTH CHECK    │
            │  User: CMO (Trần B)   │
            │  Role: giam-doc-mkt   │
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  Bước 2: INTENT PARSE  │
            │  Intent: Budget Request│
            │  Amount: +20%          │
            │  Target: Marketing dept│
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  Bước 3: SKILL CHECK   │
            │  Load: giam-doc-mkt    │
            │         .skill.md      │
            │  Check: "Thay đổi     │
            │  ngân sách → CEO phê   │
            │  duyệt"                │
            │  Result: NEEDS APPROVAL│
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  Bước 4: AI PREPARES   │
            │  Tự động thu thập:     │
            │  • KPIs Marketing hiện │
            │  • ROI campaigns gần đây│
            │  • So sánh vs. đối thủ │
            │  • Tác động dự kiến    │
            │  Draft business case   │
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────────────────────┐
            │  Bước 5: PRESENT TO CMO                │
            │                                        │
            │  "Tôi đã chuẩn bị business case:      │
            │   ROI hiện tại: 2.8x                   │
            │   Nếu tăng 20%: dự kiến ROI 3.4x      │
            │   Benchmark ngành: +15-25% là hợp lý  │
            │                                        │
            │   Bạn muốn:                            │
            │   [📄 Xem full business case]          │
            │   [✏️ Chỉnh sửa trước khi gửi CEO]    │
            │   [🚀 Gửi CEO approval ngay]           │
            └────────────────────┬───────────────────┘
                                 │
                    CMO click [Gửi CEO approval]
                                 │
                                 ▼
            ┌────────────────────────────────────────┐
            │  Bước 6: CEO NOTIFICATION              │
            │                                        │
            │  Slack DM → CEO:                       │
            │  "📋 Budget Request cần phê duyệt      │
            │   From: CMO Trần B                     │
            │   Request: Tăng MKT budget +20%        │
            │   Amount: +500M VND                    │
            │   Business case: [link]                │
            │   AI Assessment: ✅ Recommended        │
            │   Reason: ROI forecast 3.4x            │
            │                                        │
            │   [✅ Approve] [❌ Reject] [💬 Discuss]"│
            └────────────────────┬───────────────────┘
                                 │
                      CEO click [✅ Approve]
                                 │
                                 ▼
            ┌────────────────────────────────────────┐
            │  Bước 7: EXECUTION + NOTIFICATION      │
            │                                        │
            │  AI tự động:                           │
            │  ✅ Update budget trong ERP            │
            │  ✅ Notify CMO: "Đã được phê duyệt"   │
            │  ✅ Notify CFO: "Budget MKT tăng 500M" │
            │  ✅ Ghi audit log đầy đủ               │
            │  ✅ Update dashboard CFO               │
            └────────────────────────────────────────┘
```

---

*File này là tài liệu tham chiếu cho developers khi implement hệ thống AI tương tác với user theo role. Đọc cùng với [org-chart.md](../org-chart.md) và [AI-WORKFLOW-ARCHITECTURE.md](../AI-WORKFLOW-ARCHITECTURE.md).*
