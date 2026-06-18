# 🏢 Hệ Thống Quản Lý Công Ty AI-Powered

> Mỗi file `.skill.md` là một **bản mô tả chức năng nhiệm vụ** mà AI có thể đọc, hiểu và thực thi đúng vai trò tương ứng.

---

## 📁 Cấu Trúc Thư Mục

```
company-ai-system/
│
├── README.md                        ← File này
├── org-chart.md                     ← Sơ đồ tổ chức tổng thể
│
├── board/                           ← Hội đồng quản trị
│   ├── chu-tich-hdqt.skill.md
│   └── thanh-vien-hdqt.skill.md
│
├── c-suite/                         ← Ban Giám Đốc
│   ├── giam-doc-dieu-hanh.skill.md
│   ├── giam-doc-tai-chinh.skill.md
│   ├── ke-toan-truong.skill.md
│   ├── giam-doc-marketing.skill.md
│   ├── giam-doc-kinh-doanh.skill.md
│   ├── giam-doc-pr.skill.md
│   ├── giam-doc-ky-thuat.skill.md
│   └── giam-doc-nhan-su.skill.md
│
└── departments/
    ├── tai-chinh-ke-toan/
    │   ├── phong.skill.md
    │   ├── truong-phong.skill.md
    │   └── nhan-vien.skill.md
    ├── marketing/
    │   ├── phong.skill.md
    │   ├── truong-phong.skill.md
    │   └── nhan-vien.skill.md
    ├── kinh-doanh/
    │   ├── phong.skill.md
    │   ├── truong-phong.skill.md
    │   └── nhan-vien.skill.md
    ├── quan-he-cong-chung/
    │   ├── phong.skill.md
    │   ├── truong-phong.skill.md
    │   └── nhan-vien.skill.md
    ├── ky-thuat/
    │   ├── phong.skill.md
    │   ├── truong-phong.skill.md
    │   └── nhan-vien.skill.md
    └── nhan-su/
        ├── phong.skill.md
        ├── truong-phong.skill.md
        └── nhan-vien.skill.md
```

---

## 🤖 Cách AI Sử Dụng Skill Files

1. **Nạp đúng skill** tương ứng với vai trò được yêu cầu
2. **Đọc phần `## NHIỆM VỤ CỐT LÕI`** để biết AI phải làm gì
3. **Kiểm tra `## THẨM QUYỀN QUYẾT ĐỊNH`** trước khi thực thi
4. **Escalate** theo sơ đồ `reports_to` nếu vượt ngưỡng
5. **Ghi log** mọi hành động theo `## AUDIT & REPORTING`

---

## 📐 Cấu Trúc Chuẩn Mỗi Skill File

```markdown
---
role: [tên vai trò]
level: [board | c-suite | manager | staff]
department: [phòng ban]
reports_to: [cấp trên]
manages: [cấp dưới]
---

## MÔ TẢ VAI TRÒ
## NHIỆM VỤ CỐT LÕI
## THẨM QUYỀN QUYẾT ĐỊNH
## QUY TRÌNH THỰC THI (AI WORKFLOW)
## KPIs & METRICS
## TƯƠNG TÁC VỚI VAI TRÒ KHÁC
## AUDIT & REPORTING
```

---

*Hệ thống được thiết kế để AI đọc và thực thi — không phải chỉ để tham khảo.*
