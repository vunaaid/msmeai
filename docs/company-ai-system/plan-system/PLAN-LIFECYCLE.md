# 📋 Hệ Thống Quản Lý Kế Hoạch (Plan Management System)

> **Triết lý:** Mọi công việc phải gắn với Plan. Mọi giao tiếp giữa các thành viên phải qua Plan. AI là người tổng hợp, theo dõi và cảnh báo — con người là người quyết định và thực thi.

---

## 1. VÒNG ĐỜI KẾ HOẠCH (Plan Lifecycle)

```
                    ╔═══════════════════════════╗
                    ║   YÊU CẦU PHÁT SINH       ║
                    ║  (Request Trigger)        ║
                    ║                           ║
                    ║  Ai tạo: CT/CEO/GĐ bộ phận║
                    ║  Hình thức: Chat/Email/Form║
                    ╚══════════════╤════════════╝
                                   │
                    ╔══════════════▼════════════╗
               S1   ║   AI PHÂN TÍCH & TỔNG HỢP ║
             DRAFT  ║                           ║
                    ║  • Quét toàn bộ dữ liệu   ║
                    ║  • Phân tích hiện trạng   ║
                    ║  • Tổng hợp báo cáo nền   ║
                    ║  • Xây dựng Plan draft    ║
                    ╚══════════════╤════════════╝
                                   │
                    ╔══════════════▼════════════╗
               S2   ║     CHỜ PHÊ DUYỆT        ║
            REVIEW  ║                           ║
                    ║  • Gửi Plan lên người yêu ║
                    ║    cầu để review          ║
                    ║  • Người có thẩm quyền    ║
                    ║    comment/chỉnh sửa      ║
                    ║  • AI cập nhật theo       ║
                    ║    feedback               ║
                    ╚══════════════╤════════════╝
                                   │
                         ┌─────────┴─────────┐
                      DUYỆT              TỪ CHỐI/CHỈNH
                         │                    │
                         │              [Quay về S1]
                    ╔════▼══════════════════╗
               S3   ║     ĐÃ PHÊ DUYỆT      ║
            APPROVED║                       ║
                    ║  • Plan được lock      ║
                    ║  • AI phân rã thành   ║
                    ║    tasks cho từng đơn ║
                    ║    vị liên quan       ║
                    ║  • Gửi thông báo      ║
                    ║    đến tất cả members ║
                    ╚════╤══════════════════╝
                         │
                    ╔════▼══════════════════╗
               S4   ║    ĐANG TRIỂN KHAI    ║
         IN_PROGRESS║                       ║
                    ║  • Các đơn vị thực thi║
                    ║  • Cập nhật tiến độ   ║
                    ║  • Báo cáo định kỳ   ║
                    ║  • AI monitor 24/7   ║
                    ╚════╤══════════════════╝
                         │
              ┌──────────┼──────────┐
              │          │          │
           ON TRACK    AT RISK    BLOCKED
              │          │          │
              │     ╔════▼═════╗    │
              │     ║ CẢNH BÁO ║    │
              │     ║ Alert cấp║    │
              │     ║ có thẩm  ║    │
              │     ║ quyền    ║    │
              │     ╚══════════╝    │
              │                     │
              └──────────┬──────────┘
                         │
                    ╔════▼══════════════════╗
               S5   ║      HOÀN THÀNH       ║
           COMPLETED║                       ║
                    ║  • AI tổng hợp kết quả║
                    ║  • So sánh KPIs       ║
                    ║  • Bài học kinh nghiệm║
                    ║  • Lưu vào knowledge  ║
                    ║    base               ║
                    ╚═══════════════════════╝
```

---

## 2. CẤU TRÚC MỘT KẾ HOẠCH (Plan Anatomy)

```
PLAN #[ID] — [Tên kế hoạch]
├── HEADER
│   ├── plan_id: PLN-2026-001
│   ├── title: "Kế hoạch phát triển user hệ thống Q3/2026"
│   ├── requested_by: Chủ tịch HĐQT
│   ├── owned_by: CEO
│   ├── status: IN_PROGRESS
│   ├── priority: HIGH
│   ├── created_at: 2026-05-27
│   ├── approved_at: 2026-05-28
│   └── deadline: 2026-08-31
│
├── CONTEXT (AI tổng hợp)
│   ├── analysis_report: [link to AI analysis]
│   ├── data_sources: [list of docs analyzed]
│   ├── current_state: [hiện trạng]
│   └── gap_analysis: [khoảng cách cần lấp]
│
├── OBJECTIVES (Mục tiêu)
│   ├── goal_1: "Tăng user từ 1,000 lên 5,000 trong Q3"
│   ├── goal_2: "Tỷ lệ retention ≥ 80%"
│   └── goal_3: "NPS ≥ 50"
│
├── WORKSTREAMS (Luồng công việc)
│   ├── WS-1: Marketing & Acquisition → CMO chịu trách nhiệm
│   ├── WS-2: Product & UX → CTO chịu trách nhiệm
│   ├── WS-3: Sales & Onboarding → GĐ KD chịu trách nhiệm
│   └── WS-4: Support & Retention → GĐ NS chịu trách nhiệm
│
├── MILESTONES
│   ├── M1: 2026-06-15 — Hoàn thành setup infrastructure
│   ├── M2: 2026-07-01 — Launch campaign đầu tiên
│   ├── M3: 2026-07-31 — Đạt 2,500 users
│   └── M4: 2026-08-31 — Đạt 5,000 users (final)
│
├── KPIs & METRICS
│   ├── leading: [Chỉ số dẫn đầu — đo hàng tuần]
│   └── lagging: [Chỉ số kết quả — đo hàng tháng]
│
├── RISKS
│   ├── risk_1: "Budget không đủ → Xác suất: Trung bình"
│   └── risk_2: "Đối thủ ra tính năng mới → Xác suất: Cao"
│
├── COMMUNICATIONS
│   ├── check_in: Hàng tuần — Thứ Hai 9:00
│   ├── report_to: CEO + CT HĐQT
│   └── escalation: Vấn đề P1 → CEO ngay lập tức
│
└── ACTIVITY LOG (Tất cả giao tiếp đều ghi ở đây)
    ├── [2026-05-27 10:00] CT yêu cầu tạo kế hoạch
    ├── [2026-05-27 10:45] AI hoàn thành phân tích
    ├── [2026-05-27 11:00] Gửi CEO review
    ├── [2026-05-28 09:00] CEO approve
    └── [2026-05-28 09:05] AI distribute tasks đến 4 đơn vị
```

---

## 3. TRẠNG THÁI VÀ MÀU SẮC (Status Indicators)

```
PLAN STATUS:
  ⬜ DRAFT        — AI đang xây dựng
  🟡 REVIEW       — Chờ phê duyệt
  🟢 APPROVED     — Đã duyệt, đang distribute
  🔵 IN_PROGRESS  — Đang triển khai
  🟠 AT_RISK      — Có nguy cơ trễ/thiếu
  🔴 BLOCKED      — Bị chặn, cần can thiệp
  ✅ COMPLETED    — Hoàn thành
  ❌ CANCELLED    — Hủy

TASK STATUS (trong từng Plan):
  📥 TODO         — Chưa bắt đầu
  🔄 IN_PROGRESS  — Đang làm
  👁️ IN_REVIEW    — Chờ review/duyệt
  ✅ DONE         — Hoàn thành
  🚫 BLOCKED      — Bị block, có lý do
  ⏭️ DEFERRED     — Dời lại sprint/phase sau

HEALTH INDICATORS (tự động tính):
  🟢 ON_TRACK     — Tiến độ ≥ 90% so với plan
  🟡 AT_RISK      — Tiến độ 70-90%
  🔴 CRITICAL     — Tiến độ < 70%
```

---

## 4. QUY TẮC GIAO TIẾP QUA PLAN

```
╔══════════════════════════════════════════════════════════════╗
║  NGUYÊN TẮC: Không giao tiếp công việc ngoài hệ thống Plan  ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  ✅ ĐÚNG:                                                    ║
║    • Comment vào task trong Plan                            ║
║    • Update status task trong Plan                          ║
║    • Tag người liên quan trong Plan comment                 ║
║    • Báo cáo tiến độ qua Plan update                        ║
║    • Escalate blocker qua Plan flag                         ║
║                                                              ║
║  ❌ SAI (AI sẽ nhắc nhở):                                   ║
║    • Giao việc qua Slack/email riêng lẻ                     ║
║    • Update tiến độ qua chat không gắn Plan                 ║
║    • Ra quyết định liên quan Plan mà không ghi vào Plan     ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 5. BÁO CÁO ĐỊNH KỲ TỰ ĐỘNG

| Loại báo cáo | Tần suất | Người nhận | Nội dung |
|-------------|----------|------------|---------|
| Daily Pulse | Hàng ngày 8:00 | Owner của Plan | Tasks due hôm nay, blockers mới, % tiến độ |
| Weekly Summary | Thứ Hai 7:30 | Người phê duyệt + Owner | Tổng hợp tuần, milestone tiếp theo, risks |
| Monthly Review | Ngày 1 hàng tháng | CT/CEO | So sánh KPIs vs. target, forecast, quyết định cần |
| Milestone Alert | Khi M-7 ngày | Owner + Team | Nhắc milestone sắp đến, checklist chuẩn bị |
| Blocker Alert | Ngay khi phát sinh | Người có thẩm quyền | Mô tả blocker, impact, đề xuất giải pháp |
| Completion Report | Khi Plan = DONE | Tất cả stakeholders | Kết quả so với mục tiêu, lessons learned |
