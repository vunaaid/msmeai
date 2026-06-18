# Kế hoạch thực hiện todo02 — vSME

> Kế hoạch hóa [todo02.md](../todo02.md): rà soát + bổ sung Kế toán/Tài chính, rà soát
> quy trình HR/lương/BH/thuế, và vòng lặp rà soát–cải tiến (3.1→3.6) trên nhiều module.
> Nguyên tắc: tách rõ **RÀ SOÁT (module đã có)** vs **XÂY MỚI (module chưa có)**. Ngày: 2026-06-08.

---

## A. Hiện trạng module (đã có vs chưa)

| Module | API | Web | Trạng thái | Ghi chú |
|---|---|---|---|---|
| Kế toán tổng hợp (gl) | ✅ | ✅ | **Đủ** | sổ cái, bút toán, seed TT200; có Dòng tiền hợp nhất |
| Hợp đồng (contracts) | ✅ | ✅ | **Đủ** | đầu vào/ra, lịch TT, mẫu, cash-flow |
| Nhân sự & Lương (hr) | ✅ | ✅ | **Đủ (GĐ1+2)** | tuyển dụng, hồ sơ, lương BHXH/TNCN, trợ lý AI |
| Công việc (work) | ✅ | ✅ | **Đủ** | việc/dự án/định kỳ, sub-tab tiến độ |
| Dự án (projects) | ✅ | ✅ | **Đủ** | trong module work |
| Tài liệu/Ghi chép/Chat | ✅ | ✅ | **Đủ** | |
| Báo cáo (reports) | một phần | ✅ | **Một phần** | cần chuẩn hóa BCTC/thuế/quản trị |
| **Công nợ phải thu (ar)** | ❌ | ❌ | **Chưa** | enabled cờ nhưng chưa có code |
| **Công nợ phải trả (ap)** | ❌ | ❌ | **Chưa** | enabled cờ nhưng chưa có code |
| **Hóa đơn (invoice)** | ❌ | ❌ | **Chưa** | |
| **Ngân quỹ (cash)** | ❌ | ❌ | **Chưa** | thu/chi tiền mặt, ngân hàng |
| **Khai báo thuế (tax)** | ❌ | ❌ | **Chưa** | GTGT, TNDN, TNCN, lịch nộp |
| **Bán hàng & CRM (sales)** | ❌ | ❌ | **Chưa** | gồm KHÁCH HÀNG + CSKH |
| **Nhà cung cấp (vendor)** | ❌ | ❌ | **Chưa** | chưa có model Vendor |
| **Hàng tồn kho (inventory)** | ❌ | ❌ | **Chưa** | |
| **Tài sản cố định (assets)** | ❌ | ❌ | **Chưa** | gồm định giá + góp vốn |

> ⚠️ Phần lớn mục 1 & mục 3 của todo02 rơi vào nhóm **"Chưa có"** → là **xây mới module**, không phải "rà soát". Đây là khối việc lớn (nhiều tuần). Kế hoạch dưới chia giai đoạn theo giá trị & phụ thuộc.

---

## B. Phân rã todo02 → hạng mục

### Mục 1 — Kế toán & Tài chính
- **1.1 Nghĩa vụ thuế** — module **Tax**: GTGT (đầu ra/đầu vào), TNDN tạm tính, TNCN (từ lương đã có), lịch nộp + cảnh báo hạn.
- **1.2 Chi phí chưa hóa đơn + cảnh báo kê khai** — model **Expense** (có cờ `hasInvoice`, `taxDeclared`, kỳ kê khai); cảnh báo: chi phí (có/chưa hóa đơn) **chưa kê khai thuế**.
- **1.3 Định giá tài sản & Góp vốn** — module **Assets** + **CapitalContribution**: góp vốn bằng tiền / tài sản / quyền sử dụng đất / SHTT / tài sản khác; đề xuất & kế hoạch định giá; ghi tăng vốn → GL.
- **1.4 Chuẩn hóa báo cáo** — **BCTC** (Bảng CĐKT, KQHĐKD, LCTT theo TT200/133), **báo cáo thuế**, **báo cáo quản trị**; định kỳ tháng/quý/năm.
- **1.5 Dòng tiền dự kiến theo tháng/quý/năm từ hợp đồng** — mở rộng cash-flow hiện có (đang theo tháng) → gộp **quý & năm**; tự cập nhật khi có HĐ mới.

### Mục 2 — Rà soát quy trình HR/lương/BH/thuế
- Rà soát: tuyển dụng→hồ sơ→hợp đồng→lương→BHXH/YT/TN→TNCN→TNDN→chi phí nhân sự & chi phí kinh doanh. (Phần lớn đã code GĐ1+2; tập trung kiểm thử + bổ sung BHXH khai báo + đối chiếu chi phí lương sang GL.)

### Mục 3 — Vòng lặp rà soát–cải tiến (3.1→3.6)
Danh sách quy trình: **công việc, dự án, khách hàng, nhà cung cấp, bán hàng & CSKH, kho, tài sản, tài chính, hợp đồng**.
Với mỗi quy trình lặp:
1. **3.1** Xác định phạm vi cần rà.
2. **3.2** Đánh giá (SWOT: mạnh/yếu/cơ hội/thách thức) → báo cáo `reviews/<module>.md`.
3. **3.3** Đề xuất cải tiến (phù hợp SME).
4. **3.4** Code & fix từng đề xuất.
5. **3.5** Audit lại phần vừa code.
6. **3.6** Lặp đến hết danh sách.

> Phân biệt: với module **đã có** (công việc, dự án, hợp đồng, tài chính/GL, HR) → **rà soát thật** (3.2 SWOT + 3.4 cải tiến nhỏ). Với module **chưa có** (khách hàng, NCC, bán hàng, kho, tài sản) → bước 3.4 = **xây mới module** (model→API→UI→trợ lý AI→audit).

---

## C. Lộ trình theo giai đoạn (đề xuất ưu tiên)

### Giai đoạn 0 — Khung rà soát (0.5 ngày)
- Tạo thư mục `reviews/` + template `_TEMPLATE.md` (đã tạo).
- Chốt thứ tự & quy ước (mục D).

### Giai đoạn 1 — RÀ SOÁT module đã có (mục 2 + mục 3 phần đã có)
Rà soát + cải tiến nhỏ, mỗi module 1 báo cáo `reviews/`:
1. `reviews/work.md` — công việc & dự án.
2. `reviews/contracts.md` — hợp đồng (+ dòng tiền theo HĐ).
3. `reviews/hr-payroll.md` — nhân sự, lương, BHXH/TNCN (mục 2).
4. `reviews/finance-gl.md` — kế toán/tài chính hiện có.
→ Mỗi báo cáo: SWOT + danh sách cải tiến + code fix nhỏ + audit.

### Giai đoạn 2 — Kế toán/Tài chính bổ sung (mục 1, phụ thuộc GL đã có)
1. **1.5** Dòng tiền dự kiến tháng/quý/năm (mở rộng nhanh — nền đã có).
2. **1.2** Chi phí + hóa đơn + cảnh báo kê khai thuế (model Expense + cảnh báo).
3. **1.1** Module Thuế (GTGT/TNDN/TNCN + lịch nộp + cảnh báo).
4. **1.4** Chuẩn hóa BCTC/báo cáo thuế/quản trị.

### Giai đoạn 3 — Xây mới module nghiệp vụ (mục 3 phần chưa có)
Thứ tự theo phụ thuộc dòng tiền/công nợ:
1. **Khách hàng + Nhà cung cấp** (đối tác) — nền cho AR/AP, hợp đồng, bán hàng.
2. **Bán hàng & CSKH (sales/CRM)** — cơ hội→đơn→hóa đơn; chăm sóc KH.
3. **Công nợ AR/AP** — từ hóa đơn/hợp đồng.
4. **Ngân quỹ (cash)** — thu/chi thực tế → dòng tiền thật.
5. **Hàng tồn kho (inventory)**.
6. **Tài sản cố định + Góp vốn (assets)** — gồm 1.3 (định giá, góp vốn đa hình thức).
→ Mỗi module: model → API → UI → **trợ lý AI kèm** (rule) → audit + `reviews/<module>.md`.

### Giai đoạn 4 — Hợp nhất & báo cáo
- Đối chiếu xuyên module (HĐ↔AR/AP↔hóa đơn↔GL↔dòng tiền thật).
- Hoàn thiện BCTC/thuế/quản trị định kỳ + dashboard tài chính.

---

## D. Quy ước thực hiện (bắt buộc)

1. **Mỗi module/chức năng mới PHẢI có panel trợ lý AI** đi kèm (theo pattern `hr-assistant`/`contracts-assistant`, khác skill/agent tương ứng) — rule người dùng 2026-06-08.
2. Sửa `schema.prisma` → **`pnpm db push`** (KHÔNG `migrate dev`/`reset` trên DB local — là bản clone). Export enum mới ở `packages/db/src/index.ts`.
3. Mỗi hạng mục: **type-check → build → restart pm2 → verify (curl 401/200) → commit**.
4. Báo cáo rà soát lưu `reviews/<module>.md` theo template; mỗi đề xuất có trạng thái (đề xuất/đang làm/đã code/đã audit).
5. **Audit (3.5)** sau mỗi lần code: tự rà đúng nghiệp vụ + chạy thử + ghi kết quả vào báo cáo.
6. Tiền tệ mặc định VND; tái dùng model dùng chung (FileRecord, ApprovalRequest, AuditLog, Notification, Document/Template).
7. Active module cho công ty: bật `module_configs` + gán quyền role + thêm vào `IMPLEMENTED_MODULES`.

---

## E. Ước lượng & khuyến nghị thứ tự

| Giai đoạn | Khối lượng | Giá trị | Khuyến nghị |
|---|---|---|---|
| GĐ1 — Rà soát module đã có | Nhỏ–vừa | Cao (khả thi ngay) | **Làm trước** |
| GĐ2 — Kế toán/tài chính bổ sung | Vừa–lớn | Cao | Làm sau GĐ1 |
| GĐ3 — Xây mới (KH/NCC/bán hàng/kho/tài sản) | **Rất lớn** | Cao nhưng dài | Theo từng module, ưu tiên KH+NCC trước |
| GĐ4 — Hợp nhất & báo cáo | Vừa | Cao | Cuối |

**Khuyến nghị bắt đầu:** GĐ1 (rà soát 4 module đã có → báo cáo + cải tiến nhỏ) song song **1.5 dòng tiền theo quý/năm** (nhanh, nền sẵn). Sau đó quyết định đi sâu GĐ2 hay GĐ3 theo ưu tiên kinh doanh.

---

## F. Theo dõi tiến độ

> `[x]` đã làm · `[ ]` chưa làm · (🟡) đang dở.

**Module đã xây mới (ngoài danh sách gốc):**
- [x] HR — Nhân sự & Lương (tuyển dụng / hồ sơ / lương BHXH+TNCN / trợ lý AI)
- [x] Đối tác — Khách hàng & Nhà cung cấp (/sales + trợ lý AI) — *mục 9*
- [x] Công nợ AR/AP (/ar, /ap + trợ lý AI) — *mục 11*
- [x] Dòng tiền hợp nhất (HĐ + lương, dự kiến + thật, theo tháng)

**GĐ1 — Rà soát module đã có (viết báo cáo reviews/):**
- [x] Rà soát Công việc/Dự án → `reviews/work.md`
- [x] Rà soát Hợp đồng → `reviews/contracts.md`
- [x] Rà soát HR/Lương/BH/Thuế → `reviews/hr-payroll.md`
- [x] Rà soát Tài chính/GL → `reviews/finance-gl.md`

**GĐ2 — Kế toán/Tài chính bổ sung:**
- [x] Dòng tiền theo quý/năm
- [x] Chi phí + hóa đơn + cảnh báo kê khai thuế (1.2)
- [x] Module Thuế GTGT/TNDN/TNCN (1.1)
- [ ] Chuẩn hóa BCTC / báo cáo thuế / quản trị (1.4)

**GĐ3 — Xây mới module nghiệp vụ:**
- [x] Khách hàng + Nhà cung cấp
- [x] Công nợ AR/AP
- [x] Bán hàng & CSKH (đơn hàng + chăm sóc KH)
- [x] Ngân quỹ (cash)
- [x] Hàng tồn kho
- [x] Tài sản cố định + Góp vốn (1.3)

**GĐ4:**
- [x] Hợp nhất xuyên module & báo cáo tài chính định kỳ
