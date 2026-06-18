# 🧠 Kiến Trúc AI Workflow — Cách AI Tham Gia Vào Quy Trình Công Việc

> **Câu hỏi cốt lõi:** AI không phải là người dùng hệ thống — AI **LÀ** hệ thống. Mỗi skill.md là "não bộ" của một vai trò. Con người là người ra lệnh, giám sát và quyết định cuối cùng khi cần.

---

## 📐 Mô Hình Tổng Thể

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TRIGGER LAYER                               │
│  Email đến │ Slack message │ Form submit │ Cron job │ API call      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AI ROUTER / CLASSIFIER                         │
│                                                                     │
│  1. Đọc nội dung trigger                                            │
│  2. Xác định: thuộc phòng ban nào? Cấp độ nào?                     │
│  3. Load đúng skill.md tương ứng                                    │
│  4. Kiểm tra thẩm quyền                                             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AI AGENT EXECUTION                             │
│                                                                     │
│  Đọc skill.md → Hiểu nhiệm vụ → Thực thi workflow →                │
│  Ghi log → Thông báo kết quả → Escalate nếu vượt ngưỡng            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
               Tự động               Cần người duyệt
               hoàn thành            (Human Approval)
                    │                     │
                    ▼                     ▼
              [Ghi log]           [Notification → Con người
              [Báo cáo]            review → Approve/Reject]
```

---

## 🔄 Vòng Lặp Xử Lý Công Việc Chuẩn

```
                    ╔═══════════════════════════╗
                    ║       SỰ KIỆN PHÁT SINH   ║
                    ║  (trigger từ bất kỳ nguồn)║
                    ╚══════════════┬════════════╝
                                   │
                    ╔══════════════▼════════════╗
                    ║     BƯỚC 1: PHÂN LOẠI     ║
                    ║  AI đọc nội dung, tra cứu ║
                    ║  org-chart.md để biết     ║
                    ║  thuộc về ai xử lý        ║
                    ╚══════════════┬════════════╝
                                   │
                    ╔══════════════▼════════════╗
                    ║   BƯỚC 2: NẠP SKILL FILE  ║
                    ║  Load skill.md của vai trò║
                    ║  phù hợp — đây là "luật"  ║
                    ║  AI phải tuân thủ         ║
                    ╚══════════════┬════════════╝
                                   │
                    ╔══════════════▼════════════╗
                    ║  BƯỚC 3: KIỂM TRA THẨM   ║
                    ║         QUYỀN             ║
                    ║  Xem bảng ✅/❌ trong      ║
                    ║  skill.md: AI được làm gì?║
                    ╚══════════════┬════════════╝
                                   │
               ┌───────────────────┴────────────────────┐
               │                                        │
    ╔══════════▼═══════════╗             ╔══════════════▼═══════╗
    ║ TRONG THẨM QUYỀN AI  ║             ║  VƯỢT THẨM QUYỀN     ║
    ║   Tự thực thi luôn   ║             ║  Tạo approval request ║
    ╚══════════════════════╝             ║  Gửi cho người có     ║
               │                        ║  thẩm quyền           ║
               │                        ╚══════════════╤════════╝
               │                                       │
               │                        ┌──────────────┴──────┐
               │                    Approve               Reject
               │                        │                    │
               └────────────────────────┘                    │
                               │                    [AI thông báo
                    ╔══════════▼════════════╗        lý do từ chối
                    ║    BƯỚC 4: THỰC THI   ║        cho bên yêu cầu]
                    ║  Gọi tools/APIs       ║
                    ║  Ghi dữ liệu vào hệ   ║
                    ║  thống (CRM, ERP...)  ║
                    ║  Gửi thông báo        ║
                    ╚══════════┬════════════╝
                               │
                    ╔══════════▼════════════╗
                    ║  BƯỚC 5: GHI LOG &    ║
                    ║     BÁO CÁO           ║
                    ║  Lưu audit trail      ║
                    ║  Cập nhật dashboard   ║
                    ║  Gửi summary report   ║
                    ╚═══════════════════════╝
```

---

## 🎯 AI Tham Gia Vào Đâu — Phân Theo Cấp Độ

### CẤP 1: HĐQT — AI hỗ trợ, KHÔNG thực thi

```
Chủ tịch HĐQT / Thành viên HĐQT
         │
         │ AI làm gì?
         ▼
┌────────────────────────────────────────────┐
│ ✅ Tổng hợp báo cáo từ tất cả GĐ bộ phận  │
│ ✅ Phát hiện KPI lệch ngưỡng → Alert       │
│ ✅ Chuẩn bị tài liệu họp HĐQT tự động      │
│ ✅ Gửi nhắc lịch họp + agenda tự động      │
│ ✅ Tổng hợp nghị quyết sau họp             │
│ ❌ KHÔNG ra quyết định chiến lược          │
│ ❌ KHÔNG phê duyệt thay con người          │
└────────────────────────────────────────────┘
Con người quyết định: Mọi nghị quyết HĐQT
```

---

### CẤP 2: C-SUITE — AI thực thi tự động tối đa 60-70%

```
CEO / CFO / CMO / CTO / CHRO / GĐ KD / GĐ PR
         │
         │ AI làm gì?
         ▼
┌────────────────────────────────────────────────────────────┐
│                                                            │
│ CEO AI Agent:                                             │
│  ✅ Thu thập & tổng hợp báo cáo từ 7 GĐ bộ phận          │
│  ✅ Phát hiện KPI red/yellow → Draft action request        │
│  ✅ Lên lịch 1-1 tự động với GĐ bộ phận                   │
│  ✅ Soạn thảo email/thông báo nội bộ                       │
│  ✅ Theo dõi tiến độ OKRs hàng tuần                        │
│  ❌ Không ký hợp đồng                                      │
│  ❌ Không phê duyệt ngân sách lớn                          │
│                                                            │
│ CFO AI Agent:                                             │
│  ✅ Theo dõi cash flow hàng ngày, alert nếu dưới ngưỡng   │
│  ✅ Phê duyệt chi phí < 100M VND theo quy tắc              │
│  ✅ Tự động reconcile giao dịch ngân hàng                  │
│  ✅ Tạo báo cáo tài chính tháng từ số liệu kế toán         │
│  ✅ Dự báo dòng tiền 30/60/90 ngày                         │
│  ❌ Không phê duyệt chi tiêu lớn (cần CEO)                 │
│                                                            │
│ GĐ Kinh doanh AI Agent:                                  │
│  ✅ Nhận lead từ Marketing, tự qualify BANT                │
│  ✅ Assign lead cho Sales Rep phù hợp nhất                 │
│  ✅ Cảnh báo deal stuck > 2 tuần                           │
│  ✅ Tự tính forecast doanh thu hàng tuần                   │
│  ✅ Nhắc Sales Rep cập nhật CRM                            │
│  ❌ Không ký hợp đồng                                      │
└────────────────────────────────────────────────────────────┘
```

---

### CẤP 3: TRƯỞNG PHÒNG — AI thực thi tự động 50-70%

```
Trưởng phòng các bộ phận
         │
         │ AI làm gì?
         ▼
┌────────────────────────────────────────────────────────────┐
│ ✅ Phân công task tự động dựa trên workload hiện tại       │
│ ✅ Theo dõi tiến độ task hàng ngày                         │
│ ✅ Nhắc deadline cho nhân viên (T-2 ngày, T-1 ngày)        │
│ ✅ Tổng hợp báo cáo tuần từ nhân viên                      │
│ ✅ Review content/document theo checklist chuẩn            │
│ ✅ Lên lịch họp team tự động                               │
│ ✅ Alert khi KPI phòng ban dưới ngưỡng                     │
│ ❌ Không tự quyết định nhân sự                             │
│ ❌ Không phê duyệt ngân sách ngoài hạn mức                 │
└────────────────────────────────────────────────────────────┘
```

---

### CẤP 4: NHÂN VIÊN — AI là "đồng nghiệp ảo" hỗ trợ 80%

```
Nhân viên các phòng ban
         │
         │ AI làm gì?
         ▼
┌────────────────────────────────────────────────────────────┐
│ Nhân viên Kế toán AI:                                     │
│  ✅ Tự động nhập liệu hóa đơn từ email/scan               │
│  ✅ Hạch toán theo quy tắc kế toán chuẩn                   │
│  ✅ Phát hiện và báo cáo chứng từ thiếu thông tin          │
│  ✅ Tự động đối chiếu sao kê ngân hàng                     │
│  ✅ Nhắc deadline khai thuế                                │
│                                                            │
│ Nhân viên Marketing AI:                                   │
│  ✅ Tạo draft content theo brief                           │
│  ✅ Lên lịch đăng bài social media tự động                 │
│  ✅ Theo dõi metrics ads, alert khi underperform           │
│  ✅ Tổng hợp báo cáo campaign hàng tuần                    │
│  ✅ Nghiên cứu từ khóa, xu hướng ngành                     │
│                                                            │
│ Nhân viên Sales AI:                                       │
│  ✅ Cập nhật CRM sau mỗi cuộc gọi (voice-to-text)         │
│  ✅ Tự động gửi follow-up email theo template              │
│  ✅ Nhắc follow-up khi lead im lặng > 3 ngày               │
│  ✅ Chuẩn bị brief về khách hàng trước cuộc gặp            │
│  ✅ Tạo draft proposal từ template + thông tin KH          │
│                                                            │
│ Nhân viên HR AI:                                          │
│  ✅ Sàng lọc CV theo tiêu chí tự động                      │
│  ✅ Lên lịch phỏng vấn, gửi reminder                       │
│  ✅ Tính lương theo dữ liệu chấm công                       │
│  ✅ Onboarding checklist tự động                           │
│  ✅ Nhắc nhân viên và HR khi hợp đồng sắp hết hạn          │
└────────────────────────────────────────────────────────────┘
```

---

## 🔀 Ví Dụ Thực Tế: Lead Vào → Hợp Đồng Ký

```
TRIGGER: Khách hàng điền form trên website
                    │
                    ▼
    ┌───────────────────────────────┐
    │  AI ROUTER đọc form data      │
    │  → Xác định: đây là lead mới  │
    │  → Load: nhan-vien.skill.md   │
    │    (Nhân viên Kinh doanh)     │
    └───────────────┬───────────────┘
                    │ Tự động (Level 4)
                    ▼
    ┌───────────────────────────────┐
    │ NV Sales AI Agent:            │
    │  1. Tạo contact trong CRM     │
    │  2. Chạy BANT scoring         │
    │  3. Kết quả: Score = 72/100   │
    └───────────────┬───────────────┘
                    │
          ┌─────────┴─────────┐
       Score ≥ 60          Score < 60
          │                   │
          ▼                   ▼
    Assign cho           Chuyển vào
    Sales Rep + Notify   nurture sequence
    (trong 15 phút)      (Email tự động
          │               30 ngày)
          │
          ▼
    ┌───────────────────────────────┐
    │ Trưởng phòng KD AI Agent:     │
    │  → Nhận notification          │
    │  → Kiểm tra workload của      │
    │    từng Sales Rep             │
    │  → Assign cho người ít việc   │
    │    nhất + phù hợp ngành KH    │
    └───────────────┬───────────────┘
                    │
                    ▼
          [Sales Rep được thông báo]
          [AI chuẩn bị brief về KH]
          [AI suggest best time to call]
                    │
                    ▼
          [Sales Rep gọi điện]
          [AI ghi chú cuộc gọi realtime]
          [AI cập nhật CRM tự động]
                    │
                    ▼
    ┌───────────────────────────────┐
    │ Sau cuộc gọi:                 │
    │  AI phân tích: "KH quan tâm,  │
    │  muốn demo, ngân sách ~500M"  │
    │  → Tự động move stage CRM     │
    │  → Tạo draft proposal         │
    │  → Lên lịch demo              │
    └───────────────┬───────────────┘
                    │
                    ▼
          [Sales Rep review + gửi proposal]
          [KH xem xét]
          [AI theo dõi: KH đã mở email chưa?]
          [AI nhắc follow-up sau 2 ngày]
                    │
                    ▼
    ┌───────────────────────────────┐
    │  Deal Value = 800M VND        │
    │  → Vượt thẩm quyền NV Sales   │
    │  → AI tạo approval request    │
    │  → Gửi cho Trưởng phòng KD    │
    └───────────────┬───────────────┘
                    │
                    ▼
          [Trưởng phòng review]
          [Approve → AI escalate GĐ KD]
                    │
                    ▼
    ┌───────────────────────────────┐
    │  GĐ KD review deal 800M:      │
    │  → Check: trong thẩm quyền?   │
    │  → 800M: cần CEO + CFO ký     │
    │  → AI tạo deal brief đầy đủ   │
    │  → Submit cho CEO approval    │
    └───────────────┬───────────────┘
                    │
                    ▼
          [CEO + CFO review]
          [Approve]
          [AI tạo draft hợp đồng]
          [Gửi pháp lý review]
          [eSign → Ký kết]
                    │
                    ▼
          [AI update CRM: Won]
          [AI thông báo phòng KT chuẩn bị invoice]
          [AI trigger onboarding workflow cho KH mới]
```

---

## ⚡ Ma Trận: Ai Làm Gì?

```
                        CON NGƯỜI        AI TỰ ĐỘNG      AI + NGƯỜI
─────────────────────────────────────────────────────────────────────
Chiến lược 3-5 năm      ████████████     ░░░░░░░░░░░     ░░░░░░░░░░░
Phê duyệt ngân sách lớn ████████████     ░░░░░░░░░░░     ░░░░░░░░░░░
Tuyển dụng lãnh đạo     ████████████     ░░░░░░░░░░░     ░░░░░░░░░░░
Ký hợp đồng lớn         ████████████     ░░░░░░░░░░░     ░░░░░░░░░░░
Ra quyết định khủng hoảng████████████    ░░░░░░░░░░░     ░░░░░░░░░░░
─────────────────────────────────────────────────────────────────────
Approve ngân sách nhỏ   ░░░░░░░░░░░      ░░░░░░░░░░░     ████████████
Tuyển dụng staff        ░░░░░░░░░░░      ░░░░░░░░░░░     ████████████
Xử lý khiếu nại KH     ░░░░░░░░░░░      ░░░░░░░░░░░     ████████████
Campaign review         ░░░░░░░░░░░      ░░░░░░░░░░░     ████████████
Phê duyệt content       ░░░░░░░░░░░      ░░░░░░░░░░░     ████████████
─────────────────────────────────────────────────────────────────────
Tổng hợp báo cáo        ░░░░░░░░░░░      ████████████    ░░░░░░░░░░░
Theo dõi KPIs hàng ngày ░░░░░░░░░░░      ████████████    ░░░░░░░░░░░
Nhập liệu kế toán       ░░░░░░░░░░░      ████████████    ░░░░░░░░░░░
Sàng lọc CV vòng 1      ░░░░░░░░░░░      ████████████    ░░░░░░░░░░░
Gửi follow-up email     ░░░░░░░░░░░      ████████████    ░░░░░░░░░░░
Cập nhật CRM            ░░░░░░░░░░░      ████████████    ░░░░░░░░░░░
Tính lương              ░░░░░░░░░░░      ████████████    ░░░░░░░░░░░
Alert & Notification    ░░░░░░░░░░░      ████████████    ░░░░░░░░░░░
Lên lịch họp            ░░░░░░░░░░░      ████████████    ░░░░░░░░░░░
Media monitoring        ░░░░░░░░░░░      ████████████    ░░░░░░░░░░░
```

---

## 🔧 Cách Skill.md Được AI Đọc & Thực Thi

```python
# Pseudocode — Cách AI Agent hoạt động

def process_task(trigger_event):

    # Bước 1: Phân loại
    role = classify_event(trigger_event)
    # → "giam-doc-kinh-doanh" hoặc "nhan-vien-sales" v.v.

    # Bước 2: Nạp skill file
    skill = load_skill_file(f"{role}.skill.md")
    authority_level = skill.frontmatter["authority_level"]
    workflows = skill.section("QUY TRÌNH THỰC THI")
    rules = skill.section("NGUYÊN TẮC HÀNH ĐỘNG")  # các dòng NẾU...→

    # Bước 3: Đối chiếu thẩm quyền
    action = determine_action(trigger_event, workflows)
    authority_check = check_authority_table(action, skill)

    if authority_check == "APPROVED":
        # Bước 4: Thực thi
        result = execute_action(action)
        log_action(result)
        notify_relevant_parties(result)

    elif authority_check == "NEEDS_APPROVAL":
        # Tạo approval request
        approver = skill.frontmatter["reports_to"]
        create_approval_request(action, approver)
        wait_for_approval()  # async

    elif authority_check == "ESCALATE":
        # Leo thang ngay lập tức
        escalation_path = build_escalation_path(skill)
        escalate(trigger_event, escalation_path)

    # Bước 5: Kiểm tra rules NẾU...→
    for rule in rules:
        if rule.condition_matches(trigger_event):
            execute_rule_action(rule.action)
```

---

## 🔔 Luồng Thông Báo & Escalation

```
                    NHÂN VIÊN (AI Agent)
                           │
                    Vượt thẩm quyền
                           │
                           ▼
                  TRƯỞNG PHÒNG (AI Agent)
                           │
                    Vượt thẩm quyền
                           │
                           ▼
                  GIÁM ĐỐC BỘ PHẬN (AI Agent)
                           │
                    Vượt thẩm quyền
                           │
                           ▼
                       CEO (Con người)
                           │
                    Vượt thẩm quyền
                           │
                           ▼
                   HĐQT (Con người)
```

**Quy tắc escalation:**
- AI chỉ escalate **1 cấp** mỗi lần, không nhảy cóc
- Mỗi lần escalate phải kèm: context đầy đủ + recommendation của AI
- Timeout: Nếu cấp trên không phản hồi trong N giờ → tự escalate tiếp
- Khủng hoảng (Crisis): Được phép nhảy thẳng lên CEO

---

## 📊 Tỷ Lệ Tự Động Hóa Theo Phòng Ban

```
Phòng TC-KT:    ████████████████████░░ 85%  (nhập liệu, đối chiếu, báo cáo)
Phòng Marketing:████████████████░░░░░░ 70%  (lịch đăng, metrics, draft content)
Phòng KD:       ████████████░░░░░░░░░░ 60%  (CRM, follow-up, forecast)
Phòng NS:       ████████████████░░░░░░ 75%  (sàng lọc CV, lịch PV, lương)
Phòng KT:       ████████████░░░░░░░░░░ 60%  (CI/CD, monitoring, ticket routing)
Phòng PR:       ████████░░░░░░░░░░░░░░ 45%  (monitoring, lịch đăng, draft)

C-Suite:        ████████░░░░░░░░░░░░░░ 40%  (reporting, alerts, scheduling)
HĐQT:           █████░░░░░░░░░░░░░░░░░ 20%  (tổng hợp, chuẩn bị tài liệu)
```

---

## ⚠️ Giới Hạn Tuyệt Đối Của AI

```
╔══════════════════════════════════════════════════════════════╗
║          AI TUYỆT ĐỐI KHÔNG TỰ LÀM (dù có thể)             ║
╠══════════════════════════════════════════════════════════════╣
║ ❌ Ký bất kỳ hợp đồng, văn bản pháp lý                     ║
║ ❌ Chuyển tiền / thanh toán (chỉ chuẩn bị, người duyệt)     ║
║ ❌ Sa thải, kỷ luật nhân viên                               ║
║ ❌ Phát ngôn công khai về khủng hoảng                       ║
║ ❌ Ra quyết định M&A, đầu tư lớn                            ║
║ ❌ Thay đổi chính sách công ty                              ║
║ ❌ Truy cập dữ liệu cá nhân không trong phạm vi vai trò     ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 🛠️ Stack Kỹ Thuật Để Triển Khai

```
┌─────────────────────────────────────────────────────┐
│                  INTERFACE LAYER                     │
│    Slack Bot │ Email │ Web Dashboard │ API           │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│               ORCHESTRATION LAYER                    │
│    n8n / Make.com (no-code workflows)                │
│    LangGraph / CrewAI (multi-agent)                  │
│    Claude API / GPT-4 (LLM reasoning)                │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│               SKILL / MEMORY LAYER                   │
│    Skill files (.skill.md) ← Đây là files bạn có    │
│    Vector DB (Pinecone) — Semantic search            │
│    Redis — Short-term memory, task queue             │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│                   TOOL LAYER                         │
│    CRM (HubSpot) │ ERP (Odoo) │ HRIS (BambooHR)     │
│    Google Workspace │ Slack API │ Banking API        │
│    Email (Gmail/Outlook) │ Calendar                  │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 Lộ Trình Triển Khai Theo Mức Độ

### Giai Đoạn 1 — "Thư Ký AI" (Tháng 1-2)
```
AI chỉ QUAN SÁT và BÁO CÁO:
  → Tổng hợp email hàng ngày
  → Nhắc lịch họp
  → Tạo draft báo cáo tuần
  → Không tự hành động
  
Mức tự động: 10%
Rủi ro: Cực thấp
```

### Giai Đoạn 2 — "Trợ Lý AI" (Tháng 3-4)
```
AI THỰC THI các task có rủi ro thấp:
  → Cập nhật CRM
  → Gửi follow-up email theo template
  → Sàng lọc CV vòng 1
  → Nhập liệu hóa đơn
  
Mức tự động: 30%
Rủi ro: Thấp
```

### Giai Đoạn 3 — "Đồng Nghiệp AI" (Tháng 5-8)
```
AI XỬ LÝ END-TO-END workflow phức tạp:
  → Lead management đến demo
  → Payroll processing
  → Campaign monitoring + tối ưu
  → Incident detection + routing
  
Mức tự động: 60%
Rủi ro: Trung bình — cần monitoring chặt
```

### Giai Đoạn 4 — "Quản Lý AI" (Tháng 9+)
```
AI ĐIỀU PHỐI giữa các agent:
  → Multi-agent collaboration
  → Tự phát hiện bottleneck và đề xuất tái cơ cấu
  → Học từ feedback và cải thiện
  
Mức tự động: 70-80%
Con người: Chiến lược + quyết định trọng yếu
```

---

*Mục tiêu cuối cùng: Con người làm việc **cùng** AI, không phải **thay** AI hay bị AI **thay thế**.*
