1. Kiểm tra lại kế toán, tài hính đã có đầy đủ thông tin chưa, nếu thiếu thì bổ sung. 
- Chú ý đến nghĩa vụ thuế, quản lý thêm các chi phí chưa có hóa đơn, cảnh báo các khoản chi phí có hoặc chưa có hóa đơn nhưng chưa được kê khai thuế.
- Chức năng đề xuất và kế hoạch định giá tài sản, góp vôn băng tài sản, góp vốn bằng tiền, góp vốn bằng quyền sử dụng đất, góp vốn bằng quyền sở hữu trí tuệ, góp vốn bằng các tài sản khác. và đưa báo cáo định kỳ về tình hình tài chính cần chuẩn hóa lại các báo cáo tài chính, báo cáo thuế, báo cáo quản trị để có thể theo dõi tình hình tài chính của công ty một cách hiệu quả hơn.
-Khi có hợp đồng là bắt đầu phải tính dòng tiền dự kiến theo tháng, quý, năm căn cứ vào hợp đông.
2. Kiểm tra lại các quy trình, thủ tục liên quan đến nhân sự, tiền lương, bảo hiểm xã hội, bảo hiểm y tế, bảo hiểm thất nghiệp, thuế thu nhập cá nhân, thuế thu nhập doanh nghiệp, các khoản chi phí liên quan đến nhân sự, các khoản chi phí liên quan đến hoạt động kinh doanh của công ty.
3. Kiểm tra lại các quy trình, thủ tục liên quan đến 
quản lý công việc, 
quản lý dự án, 
quản lý khách hàng, 
quản lý nhà cung cấp, quản lý bán hàng và  chăm sóc khách hàng.
quản lý kho, 
quản lý tài sản, 
quản lý tài chính, 
quản lý hợp đồng,
Thực hiện các bước sau:
3.1. Xác định các quy trình, thủ tục cần kiểm tra lại theo danh sách ở mục 3.
3.2. Đánh giá lại các quy trình, thủ tục cần được kiểm tra lại, xác định các điểm mạnh, điểm yếu, cơ hội và thách thức của các quy trình, thủ tục, lập báo cáo lưu file md thư mục reviews
3.3. Đưa ra các đề xuất cải tiến các quy trình, thủ tục để nâng cao hiệu quả và chất lượng của các quy trình, thủ tục phù hợp với mô hình doanh nghiệm SME.
3.4. Thực hiện code và fix từng đề xuất cải tiến các quy trình, thủ tục đã được đưa ra.
3.5. Audit lại nội dung vừa code và fix để đảm bảo các quy trình, thủ tục đã được cải tiến hoạt động hiệu quả và đáp ứng được yêu cầu đã đề ra.
3.6 Lặp cho đến hết các quy trình, thủ tục cần kiểm tra lại theo danh sách ở mục 3.

---

## TRẠNG THÁI THỰC HIỆN (cập nhật 2026-06-08) — branch `feat/sme-modules`

> ✅ xong · 🟡 một phần · ⬜ chưa làm. Chi tiết & lộ trình: [reviews/00-ke-hoach-tong-the.md](reviews/00-ke-hoach-tong-the.md).

> `[x]` đã làm · `[ ]` chưa làm · (🟡) đang dở.

### Mục 1 — Kế toán & Tài chính
- [x] **1. Kiểm tra kế toán/tài chính đủ thông tin** (🟡 GL/sổ cái/bút toán/TT200 đã có; thiếu thuế/hóa đơn/tài sản)
- [x] **1.1 Nghĩa vụ thuế** — module Thuế GTGT/TNDN/TNCN + lịch nộp
- [x] **1.2 Chi phí chưa hóa đơn + cảnh báo kê khai thuế**
- [x] **1.3 Định giá tài sản & Góp vốn** (tiền/tài sản/QSDĐ/SHTT/khác)
- [x] **1.4 Chuẩn hóa BCTC / báo cáo thuế / báo cáo quản trị**
- [x] **1.5 Dòng tiền dự kiến từ hợp đồng** (tháng/quý/năm)

### Mục 2 — Quy trình HR / lương / BH / thuế
- [x] Tuyển dụng → hồ sơ → HĐ lao động (link) → tính lương BHXH/BHYT/BHTN 10.5% + thuế TNCN lũy tiến
- [x] Báo cáo rà soát HR (reviews/hr-payroll.md) · [ ] BHXH khai báo/TNDN (đề xuất)

### Mục 3 — Vòng lặp rà soát–cải tiến (theo từng quy trình)
- [x] Quản lý công việc (review: reviews/work.md)
- [x] Quản lý dự án (review: reviews/work.md)
- [x] Quản lý khách hàng (đã xây mới /sales)
- [x] Quản lý nhà cung cấp (đã xây mới)
- [x] Bán hàng & CSKH (đơn hàng + CSKH)
- [x] Quản lý kho
- [x] Quản lý tài sản
- [x] Quản lý tài chính (GL + dòng tiền + công nợ AR/AP + ngân quỹ)
- [x] Quản lý hợp đồng (review: reviews/contracts.md)

Các bước 3.1–3.6: [x] 3.1 xác định · [ ] 3.2 báo cáo SWOT (reviews/) · [ ] 3.3 đề xuất · [ ] 3.4 code (xong KH/NCC + AR/AP) · [x] 3.5 audit (phần đã code) · [ ] 3.6 lặp đến hết.

### Module đã XÂY MỚI đợt này
- [x] HR — Nhân sự & Lương (tuyển dụng, hồ sơ, lương BHXH/TNCN, trợ lý AI)
- [x] Đối tác — Khách hàng & Nhà cung cấp (/sales) + trợ lý AI
- [x] Công nợ — Phải thu/Phải trả (/ar, /ap) + trợ lý AI
- [x] Dòng tiền hợp nhất (HĐ + lương, dự kiến + thật)

### Còn lại (ưu tiên kế tiếp)
- [x] Ngân quỹ (cash)
- [x] Bán hàng / đơn hàng + CSKH
- [x] Kho
- [x] Tài sản + Góp vốn
- [x] Thuế
- [ ] Chi phí + hóa đơn + cảnh báo kê khai
- [x] Chuẩn hóa BCTC
- [ ] Dòng tiền quý/năm
- [x] Viết các báo cáo review (reviews/)