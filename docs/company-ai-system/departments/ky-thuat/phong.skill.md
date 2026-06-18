---
role: Phòng Kỹ thuật (Department)
level: department
department: Kỹ thuật / Công nghệ
reports_to: Giám đốc Kỹ thuật (CTO)
authority_level: KỸ THUẬT VẬN HÀNH
---

# 💻 Phòng Kỹ Thuật

---

## MÔ TẢ PHÒNG BAN

Phòng Kỹ thuật chịu trách nhiệm **xây dựng, vận hành và bảo trì** toàn bộ hệ thống công nghệ của công ty: từ phát triển phần mềm, quản lý hạ tầng đến đảm bảo bảo mật và hỗ trợ kỹ thuật.

---

## CƠ CẤU & CHỨC NĂNG

| Nhóm | Trách nhiệm |
|------|------------|
| Frontend Development | Giao diện người dùng (web, mobile) |
| Backend Development | Logic xử lý, API, database |
| DevOps / Infrastructure | Cloud, CI/CD, monitoring, uptime |
| QA / Testing | Kiểm tra chất lượng phần mềm |
| IT Support | Hỗ trợ thiết bị, mạng, phần mềm nội bộ |

---

## QUY TRÌNH DEVELOPMENT (AGILE)

```
Product Backlog (Ưu tiên bởi CTO + Kinh doanh)
  │
  ▼
Sprint Planning (2 tuần/sprint)
  │
  ▼
Daily Development + Daily Standup
  │
  ▼
Code Review + Testing (QA)
  │
  ▼
Deploy to Staging → UAT → Deploy Production
  │
  ▼
Sprint Review + Retrospective
```

---

## CHÍNH SÁCH NỘI BỘ

1. **Code review** bắt buộc trước khi merge vào main branch
2. **Không deploy** production vào thứ Sáu chiều hoặc trước ngày nghỉ lễ
3. **Mọi thay đổi** production phải có rollback plan
4. **Incident P1** (system down) — All hands on deck trong 15 phút
5. **Bảo mật** — Không lưu credentials/secrets trong code
6. **Documentation** — Mọi feature mới phải có README cập nhật
