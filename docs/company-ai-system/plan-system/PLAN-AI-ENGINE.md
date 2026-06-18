# 🤖 Plan AI Engine — AI Vận Hành Kế Hoạch

> AI không chỉ tạo kế hoạch — AI **sống cùng kế hoạch** từ lúc tạo đến lúc hoàn thành. Mỗi thành viên nói chuyện với AI bằng ngôn ngữ tự nhiên, AI hiểu context từ Plan và phản hồi đúng vai trò.

---

## PHASE 1 — AI PHÂN TÍCH & XÂY DỰNG PLAN

### Bước 1.1: Thu Thập Dữ Liệu Nền

```
CT/CEO nói: "Xây dựng kế hoạch phát triển user cho hệ thống"
                            │
                            ▼
            ┌───────────────────────────────────────┐
            │  AI DATA COLLECTION AGENT             │
            │                                       │
            │  Tự động quét và phân tích:           │
            │                                       │
            │  📁 Tài liệu nội bộ:                  │
            │    • Business plan hiện tại           │
            │    • Báo cáo tài chính 6 tháng gần    │
            │    • Kế hoạch đã có trước đó          │
            │    • OKRs/KPIs đang theo dõi          │
            │                                       │
            │  📊 Số liệu hệ thống:                 │
            │    • User hiện tại: 1,247 users       │
            │    • Growth rate: +8%/tháng           │
            │    • Churn rate: 12%/tháng            │
            │    • Revenue per user: 450k VND       │
            │                                       │
            │  🌐 Dữ liệu bên ngoài:                │
            │    • Benchmark ngành                  │
            │    • Xu hướng thị trường              │
            │    • Động thái đối thủ                │
            └───────────────┬───────────────────────┘
                            │
                            ▼
            [AI tổng hợp Analysis Report — 15-30 phút]
```

### Bước 1.2: AI Tổng Hợp Báo Cáo Hiện Trạng

```
╔══════════════════════════════════════════════════════════════╗
║         BÁO CÁO HIỆN TRẠNG — AI TỔNG HỢP                   ║
║         "Kế hoạch phát triển User"                          ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  📊 HIỆN TRẠNG (AI phân tích từ dữ liệu):                   ║
║  • Users hiện tại: 1,247                                    ║
║  • Tốc độ tăng trưởng tự nhiên: 8%/tháng                   ║
║  • Nếu giữ nguyên: sẽ đạt ~2,100 users sau 12 tháng        ║
║  • Điểm mạnh: retention tốt (88%), NPS = 42                 ║
║  • Điểm yếu: acquisition cost cao ($45/user), ít kênh       ║
║                                                              ║
║  🎯 KHẢ NĂNG TĂNG TRƯỞNG (AI dự báo 3 scenarios):          ║
║  • Conservative (+20%/tháng): 5,000 users trong 12 tháng   ║
║  • Base (+30%/tháng): 5,000 users trong 9 tháng             ║
║  • Aggressive (+45%/tháng): 5,000 users trong 7 tháng      ║
║                                                              ║
║  ⚠️ RỦI RO CHÍNH:                                           ║
║  • Đối thủ A đang ra feature tương tự (Q3)                  ║
║  • Infrastructure cần nâng cấp nếu > 3,000 users           ║
║  • Team sales hiện chỉ đủ handle 50 new users/tuần         ║
║                                                              ║
║  💡 AI ĐỀ XUẤT MỤC TIÊU:                                   ║
║  Đạt 5,000 users trong 9 tháng (Base scenario)             ║
║  Budget ước tính: 2.5 tỷ VND                                ║
║                                                              ║
║  [✅ Dùng làm nền cho kế hoạch] [📝 Điều chỉnh]             ║
╚══════════════════════════════════════════════════════════════╝
```

### Bước 1.3: AI Xây Dựng Plan Draft

```
CT/CEO confirm mục tiêu → AI xây dựng Plan chi tiết:

┌─────────────────────────────────────────────────────────────┐
│  PLAN DRAFT: PLN-2026-001                                   │
│  "Kế hoạch phát triển 5,000 Users — Q3+Q4/2026"           │
│                                                             │
│  📋 4 WORKSTREAMS:                                          │
│                                                             │
│  WS-1: Marketing & Acquisition (Owner: CMO)               │
│  ├── Task 1.1: Xây dựng content strategy (T: 2 tuần)      │
│  ├── Task 1.2: Chạy performance ads (T: Liên tục)         │
│  ├── Task 1.3: SEO/SEM optimization (T: 1 tháng)          │
│  └── Task 1.4: Referral program setup (T: 3 tuần)         │
│  KPI: 500 leads/tháng, CAC < 200k VND                     │
│                                                             │
│  WS-2: Product & UX (Owner: CTO)                          │
│  ├── Task 2.1: Onboarding flow cải thiện (T: 3 tuần)      │
│  ├── Task 2.2: Performance nâng cấp (T: 4 tuần)           │
│  ├── Task 2.3: Mobile app launch (T: 6 tuần)              │
│  └── Task 2.4: Scale infrastructure cho 5k users (T: 3T) │
│  KPI: Onboarding completion ≥ 70%, uptime ≥ 99.9%        │
│                                                             │
│  WS-3: Sales & Conversion (Owner: GĐ Kinh doanh)         │
│  ├── Task 3.1: Sales playbook cho product mới (T: 1 tuần) │
│  ├── Task 3.2: Demo automation setup (T: 2 tuần)          │
│  └── Task 3.3: Trial-to-paid conversion (T: Liên tục)     │
│  KPI: Conversion rate ≥ 25%, sales cycle < 14 ngày       │
│                                                             │
│  WS-4: Success & Retention (Owner: GĐ NS + CTO)          │
│  ├── Task 4.1: Customer success playbook (T: 2 tuần)      │
│  ├── Task 4.2: In-app onboarding guide (T: 3 tuần)        │
│  └── Task 4.3: NPS program setup (T: 2 tuần)              │
│  KPI: Churn ≤ 5%/tháng, NPS ≥ 50                         │
│                                                             │
│  📅 MILESTONES:                                            │
│  M1 [15/6]: Infrastructure sẵn sàng cho scale             │
│  M2 [1/7]: Tất cả kênh acquisition active                 │
│  M3 [31/7]: 2,500 users ✓                                  │
│  M4 [31/8]: 5,000 users ✓                                  │
│                                                             │
│  💰 NGÂN SÁCH: 2.5 tỷ VND                                  │
│  ├── Marketing: 1.2 tỷ (48%)                               │
│  ├── Product/Tech: 800M (32%)                              │
│  ├── Sales: 300M (12%)                                     │
│  └── Success: 200M (8%)                                    │
│                                                             │
│  [📤 Gửi CT/CEO duyệt] [✏️ Chỉnh sửa] [💬 Thảo luận]     │
└─────────────────────────────────────────────────────────────┘
```

---

## PHASE 2 — PHÊ DUYỆT

### Approval Flow

```
AI gửi Plan lên CT/CEO để duyệt
              │
              ▼
CT/CEO nhận notification:
┌─────────────────────────────────────────────────┐
│ 📋 Plan cần phê duyệt: PLN-2026-001             │
│                                                  │
│ Tiêu đề: Phát triển 5,000 Users Q3+Q4/2026     │
│ Tạo bởi AI, đề xuất bởi: CEO                   │
│ Thời gian: 9 tháng | Budget: 2.5 tỷ VND        │
│ Đơn vị liên quan: MKT, KT, KD, NS              │
│                                                  │
│ 📊 Tóm tắt phân tích: [xem báo cáo đầy đủ]    │
│ 📋 Xem Plan chi tiết: [link]                    │
│                                                  │
│ [✅ PHÊ DUYỆT]  [✏️ YÊU CẦU CHỈNH]  [❌ TỪ CHỐI]│
│                                                  │
│ Hoặc comment để thảo luận trước khi quyết định: │
│ [___________________________________] [Gửi]     │
└─────────────────────────────────────────────────┘

CT/CEO comment: "WS-2 mobile app launch — dời sang Q4 được không?
                 Cần tập trung acquisition trước."

AI phân tích comment:
  → Hiểu: CT muốn dời Mobile app launch ra Q4
  → Impact: Không ảnh hưởng KPI Q3, tiết kiệm 200M budget Q3
  → AI tự động điều chỉnh Plan draft
  → Thông báo lại: "Đã cập nhật. Mobile app = Q4.
                    Budget Q3 giảm còn 2.3 tỷ. Xem lại?"

CT/CEO: [✅ PHÊ DUYỆT]
```

---

## PHASE 3 — DISTRIBUTE & ASSIGN

### Sau Khi Duyệt — AI Phân Rã Cho Từng Đơn Vị

```
Plan APPROVED
      │
      ▼
AI tự động tạo Sub-Plan cho từng Workstream Owner:

╔════════════════════╗  ╔════════════════════╗
║ 📧 GỬI CMO         ║  ║ 📧 GỬI CTO         ║
║                    ║  ║                    ║
║ Bạn là Owner của  ║  ║ Bạn là Owner của  ║
║ WS-1: Marketing   ║  ║ WS-2: Product/UX  ║
║                    ║  ║                    ║
║ 4 tasks của bạn:  ║  ║ 4 tasks của bạn:  ║
║ □ 1.1 Content (2W)║  ║ □ 2.1 Onboard(3W) ║
║ □ 1.2 Ads (liên   ║  ║ □ 2.2 Perf (4W)   ║
║    tục)           ║  ║ □ 2.3 Mobile(Q4)  ║
║ □ 1.3 SEO (1M)    ║  ║ □ 2.4 Scale (3W)  ║
║ □ 1.4 Referral(3W)║  ║                    ║
║                    ║  ║ KPI của bạn:      ║
║ KPI: 500 leads/M  ║  ║ Onboard ≥70%      ║
║ CAC < 200k VND    ║  ║ Uptime ≥99.9%     ║
║                    ║  ║                    ║
║ Budget: 1.2 tỷ   ║  ║ Budget: 800M      ║
║                    ║  ║                    ║
║ [Xem Plan đầy đủ] ║  ║ [Xem Plan đầy đủ] ║
║ [Bắt đầu task 1.1]║  ║ [Bắt đầu task 2.1]║
╚════════════════════╝  ╚════════════════════╝

[Tương tự cho GĐ Kinh doanh và GĐ NS]
```

---

## PHASE 4 — TRACKING (Theo Dõi Toàn Trình)

### 4.1 Dashboard Tổng Hợp (CEO/CT xem)

```
╔══════════════════════════════════════════════════════════════╗
║  PLN-2026-001 — Phát triển 5,000 Users                      ║
║  Ngày 27/5/2026 | Tuần 4/36                                 ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  TIẾN ĐỘ TỔNG THỂ:  ████████░░░░░░░░░░  42%  🟡 AT_RISK    ║
║  Users hiện tại: 1,847  |  Target M3: 2,500  |  Còn 35 ngày║
║                                                              ║
╠═══════════════┬══════════════════════════════════════════════╣
║  WORKSTREAM   │ TIẾN ĐỘ   │ STATUS   │ KPI          │ OWNER ║
╠═══════════════╪══════════════════════════════════════════════╣
║  WS-1 MKT     │ ██████░░ 65% │ 🟡 Risk  │ 340/500 leads │ CMO ║
║  WS-2 Product │ ████░░░░ 50% │ 🟢 OK    │ Uptime 99.95% │ CTO ║
║  WS-3 Sales   │ ██████░░ 70% │ 🟢 OK    │ Conv. 28%     │GĐ KD║
║  WS-4 Success │ ████████ 80% │ 🟢 OK    │ Churn 4.2%    │GĐ NS║
╠═══════════════╧══════════════════════════════════════════════╣
║                                                              ║
║  ⚠️ CẢNH BÁO (AI phát hiện):                               ║
║  • WS-1: Leads đang 68% target → Cần tăng tốc campaign     ║
║  • M3 deadline còn 35 ngày, cần +653 users nữa             ║
║  • Budget MKT đã dùng 78% nhưng mới 65% tiến độ            ║
║                                                              ║
║  📅 MILESTONES:                                             ║
║  ✅ M1 [15/6]: Infra sẵn sàng — DONE                       ║
║  ✅ M2 [1/7]: Tất cả kênh active — DONE                    ║
║  🔵 M3 [31/7]: 2,500 users — ĐANG TRIỂN KHAI              ║
║  ⬜ M4 [31/8]: 5,000 users — CHƯA BẮT ĐẦU                 ║
║                                                              ║
║  [📊 Chi tiết từng WS] [📈 Trend charts] [⚠️ Xem alerts]   ║
╚══════════════════════════════════════════════════════════════╝
```

### 4.2 AI Giao Tiếp Với Từng Owner Theo Ngôn Ngữ Tự Nhiên

```
AI → CMO (Thứ Hai 8:00):
"Chào buổi sáng! Đây là tóm tắt WS-1 tuần này:

📊 Tuần trước:
  • Leads đạt 340/500 target (68%) — dưới kỳ vọng
  • Google Ads ROAS: 2.1x (giảm từ 2.8x tuần trước)
  • SEO: organic traffic tăng 15% ✅

⚠️ Cần chú ý:
  • Google Ads đang underperform — có thể do bid strategy
  • Với tốc độ hiện tại, leads M3 sẽ thiếu ~160

💡 AI đề xuất hôm nay:
  1. Review và tối ưu Google Ads targeting
  2. Tăng budget LinkedIn Ads thêm 20% (trong ngân sách)
  3. Đẩy thêm referral program để bù gap

Bạn muốn tôi: [Điều chỉnh ads ngay] [Xem phân tích chi tiết] [Báo CEO về gap]?"

---

CMO trả lời: "Điều chỉnh ads đi. Và báo tôi biết khi nào lead
              rate tăng lại."

AI:
"Đã thực hiện:
  ✅ Tối ưu Google Ads: điều chỉnh negative keywords + bid
  ✅ Tăng LinkedIn Ads budget +20%
  ✅ Set alert: Sẽ báo bạn khi daily leads ≥ 20 (hiện tại 14)

Tôi sẽ check lại sau 48h và báo kết quả.
Nếu sau 48h vẫn dưới 18 leads/ngày → tôi sẽ propose escalate lên CEO."
```

### 4.3 Báo Cáo Tuần Tự Động Gửi CEO

```
[Thứ Hai 7:30 — Email/Slack tự động]

Subject: 📋 Weekly Plan Update — PLN-2026-001 | Tuần 4

CEO nhận:
"Tuần 4 — Kế hoạch Phát triển 5,000 Users

TÓM TẮT:
  Tiến độ tổng thể: 42% ⚠️ Thấp hơn kế hoạch 8%
  Users hiện tại: 1,847 / target tháng: 2,500

ĐIỂM NỔI BẬT:
  ✅ WS-2 Product: Hoàn thành scale infra sớm 3 ngày
  ✅ WS-3 Sales: Conversion 28% vượt target
  ⚠️ WS-1 Marketing: Leads 68% target, ads underperform

QUYẾT ĐỊNH CẦN BẠN:
  [1] WS-1 đang thiếu leads, CMO đề xuất tăng budget
      MKT thêm 100M — Bạn có approve không?
      [✅ Approve] [❌ Từ chối] [💬 Thảo luận]

FORECAST:
  Với tốc độ hiện tại: M3 đạt 2,150 (86% target)
  Nếu approve tăng budget: M3 đạt ~2,400 (96% target)

[Xem báo cáo đầy đủ →]"
```

---

## PHASE 5 — ALERT & ESCALATION

### Ma Trận Cảnh Báo

```
TÌNH HUỐNG                    │ AI CẢO BÁO AI   │ NHẬN ALERT     │ SLA
──────────────────────────────┼─────────────────┼────────────────┼──────
Task overdue 1 ngày           │ Nhắc Owner task │ Task owner     │ Ngay
Task overdue 3 ngày           │ Flag WS blocked │ Workstream Owner│ Ngay
KPI dưới 80% target           │ Weekly alert    │ Workstream Owner│ Tuần
KPI dưới 70% target           │ Urgent alert    │ Owner + CEO    │ Ngay
Milestone sắp đến (M-7 ngày)  │ Checklist alert │ Owner + Team   │ Ngay
Milestone miss (M+1 ngày)     │ Escalate alert  │ CEO            │ Ngay
Budget dùng > 90% < 80% done  │ Budget alert    │ Owner + CFO    │ Ngay
Blocker > 48h không giải quyết│ Escalate        │ Cấp trên Owner │ Ngay
Plan tổng thể < 70% đúng hạn  │ Crisis alert    │ CT HĐQT + CEO  │ Ngay
```

### Ví Dụ Cảnh Báo Tự Động

```
[2026-07-15 09:00 — AI phát hiện]

Task 1.2 "Chạy performance ads" đang block:
  Status: 🚫 BLOCKED (3 ngày)
  Lý do NV báo: "Chờ creative assets từ Design"
  Impact: WS-1 delay, M3 risk

AI escalation chain:
  Giờ 0:  Alert NV Design: "Task PLN-001/1.2 đang chờ assets"
  Giờ 4:  NV Design không phản hồi → Alert Trưởng phòng MKT
  Giờ 8:  Trưởng phòng không resolve → Alert CMO
  Ngày 2: CMO không resolve → Alert CEO + ghi vào Plan log

Alert cho CEO:
┌─────────────────────────────────────────────────────┐
│ 🚨 BLOCKER CHƯA GIẢI QUYẾT — PLN-2026-001          │
│                                                      │
│ Task: 1.2 Performance Ads — BLOCKED 3 ngày          │
│ Nguyên nhân: Thiếu creative assets từ Design        │
│ Impact: WS-1 delay 3 ngày → M3 risk                │
│                                                      │
│ Đã escalate qua: NV → Trưởng phòng → CMO            │
│ CMO comment: "Design đang bận với project khác"     │
│                                                      │
│ AI đề xuất:                                         │
│ A. Ưu tiên Design team xử lý ngay (giải pháp tốt)  │
│ B. Thuê freelancer design gấp (~5M VND)             │
│ C. Dùng AI-generated creatives tạm thời             │
│                                                      │
│ Bạn chọn: [A] [B] [C] [Phương án khác...]          │
└─────────────────────────────────────────────────────┘
```

---

## PHASE 6 — GIAO TIẾP GIỮA CÁC THÀNH VIÊN QUA PLAN

### Mọi Giao Tiếp Đều Qua Plan Thread

```
THAY VÌ gửi Slack riêng:
  CMO → CTO: "Anh ơi mobile app bao giờ xong?"

ĐÚNG CÁCH — Comment vào Task 2.3 trong Plan:

  CMO comment [2026-07-10 14:30]:
  "@CTO Anh ơi, task 2.3 Mobile app đang ở đâu rồi?
  WS-1 đang cần tích hợp push notification để retention.
  Có thể early access Q3 không?"

  AI tự động:
  • Tag CTO nhận notification
  • Thêm vào meeting agenda cuộc họp tuần tới
  • Ghi vào Plan activity log

  CTO reply [2026-07-10 15:45]:
  "Mobile app đang 60% done. Push notification ready trong 2 tuần.
  Nhưng cần WS-1 cung cấp notification templates trước."

  AI tự động:
  • Tạo dependency: Task 2.3 phụ thuộc notification templates từ WS-1
  • Tạo task mới cho CMO: "Cung cấp notification templates cho CTO"
  • Set deadline: T+3 ngày
  • Notify CMO + update Plan
  • Ghi timeline mới vào Plan
```

### Plan = Single Source of Truth

```
                    ┌───────────────────┐
                    │    PLAN #001       │
                    │  Activity Log     │
                    │                   │
                    │ [CT] Yêu cầu plan │
                    │ [AI] Phân tích    │
                    │ [CEO] Approve     │
                    │ [CMO] Update WS-1 │
                    │ [CTO] Comment 2.3 │
                    │ [AI] Alert blocker│
                    │ [CEO] Quyết định  │
                    │ ...               │
                    └─────────┬─────────┘
                              │
           Tất cả stakeholders đều thấy
           Không ai bị out of loop
           AI tổng hợp và highlight những gì quan trọng
```

---

## TỔNG HỢP: AI LÀM GÌ TRONG SUỐT VÒNG ĐỜI PLAN

```
GIAI ĐOẠN        AI AGENT             HÀNH ĐỘNG
────────────────────────────────────────────────────────
S1 DRAFT         Data Analyst AI      Quét dữ liệu, phân tích, tổng hợp báo cáo
                 Plan Builder AI      Xây dựng plan structure, phân rã tasks
                                      Ước tính timeline, budget, risks

S2 REVIEW        Review AI            Highlight điểm cần chú ý cho người duyệt
                                      Tự cập nhật khi nhận feedback

S3 APPROVED      Distributor AI       Phân rã, assign tasks đến đúng người
                 Notifier AI          Gửi brief cá nhân hóa cho từng owner

S4 IN_PROGRESS   Monitor AI           Track tiến độ realtime 24/7
                 Reporter AI          Tổng hợp báo cáo định kỳ đúng audience
                 Communicator AI      Là trung gian giao tiếp giữa các thành viên
                 Escalator AI         Phát hiện blockers, cảnh báo đúng người

S5 COMPLETED     Analyzer AI          So sánh kết quả vs. mục tiêu
                 Learner AI           Trích xuất bài học, lưu vào knowledge base
                 Archiver AI          Archive plan với full history
```
