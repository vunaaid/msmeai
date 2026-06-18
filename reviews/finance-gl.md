# Rà soát quy trình: Tài chính / Kế toán tổng hợp (GL)

> Ngày: 2026-06-08 · Người rà: AI audit · Phạm vi: gl.router, gl-service, accounting UI, BCTC

## 1. Phạm vi (3.1)
Sổ cái double-entry, hệ thống TK TT200, bút toán (draft→pending→posted→reversed), kỳ kế toán, BCTC (CĐKT/KQKD/LCTT/CĐSPS), Chi phí, dòng tiền.

## 2. SWOT (3.2)
**Điểm mạnh:** double-entry thật (cân Nợ=Có bằng integer-cents ở cả router + service + client); TK theo TT200, chỉ TK lá active mới được hạch toán; seed idempotent; vòng đời posting + reversal trong transaction; Decimal(18,2); BCTC tính dấu theo loại TK + dồn 511−632 vào 421 để CĐKT cân + cờ `balanced`.
**Điểm yếu:** **khóa kỳ trước đây không dùng được** (không có endpoint đóng kỳ → guard "closed" là code chết); cân bằng chỉ ở tầng app (không có ràng buộc DB); reverse chỉ check kỳ hiện tại, không check kỳ của bút toán gốc; số bút toán count-based dễ đụng; chưa tách maker-checker khi post.
**Cơ hội:** quy trình đóng kỳ + bút toán kết chuyển cuối năm (511/632/642→911→421); ràng buộc cân bằng ở tầng transaction/DB; auto-journal từ các phân hệ (chi phí, HĐ); số dư đầu kỳ/đầu năm chuẩn.
**Thách thức:** không khóa kỳ + bút toán posted có thể bị sửa sau đóng sổ = rủi ro tuân thủ; số count-based đụng khi nhiều người/agent post đồng thời.

## 3. Phát hiện & xử lý (3.3–3.5)
| # | Mức | Phát hiện | Trạng thái |
|---|---|---|---|
| 1 | CRITICAL | Khóa kỳ không thực thi được — không có endpoint đóng kỳ, guard "closed" là code chết | ✅ **Đã fix** (thêm `POST /gl/periods/:id/close|reopen` + `GET /gl/periods`; chặn đóng khi còn bút toán nháp/chờ) |
| 2 | HIGH | `tasks/:id/approve` đánh dấu việc completed dù có bút toán bị bỏ qua (kỳ đóng) | ✅ **Đã fix** (chỉ completed khi mọi bút toán đã ghi sổ; trả `skipped`) |
| 3 | HIGH | Số bút toán count-based → đụng sau khi xóa / đua | ✅ **Đã fix** (MAX suffix; P2002→409 toàn cục) |
| 4 | HIGH | `reverse` chỉ check kỳ hiện tại, không check kỳ của bút toán gốc | ⬜ Đề xuất (chặn khi kỳ gốc closed; chặn re-reverse) |
| 5 | CRITICAL→xác minh | LCTT số dư đầu kỳ suy ngược (fragile) — agent kết luận giá trị hiển thị đúng nhưng logic mong manh | ⬜ Đề xuất (tính open từ `date < start`) |
| 6 | LOW | `/reports/financial` thiếu `requireAuth` inline (vẫn được router-guard bảo vệ) | ⬜ Đề xuất (thêm cho phòng thủ sâu) |

## 4. Đề xuất cải tiến SME
1. **Quy trình đóng kỳ/năm** (đã thêm endpoint) + **bút toán kết chuyển cuối năm** → 421 là số dư thật, không chỉ tổng hợp lúc xuất báo cáo.
2. Ràng buộc cân bằng ở tầng transaction (re-sum lines) + job `db:check` phát hiện bút toán lệch.
3. Số bút toán an toàn (đã chuyển MAX suffix) — cân nhắc bảng counter giao dịch.
4. Maker-checker khi post (postedBy ≠ createdBy theo ngưỡng).
5. Auto-journal từ Chi phí / lịch thanh toán HĐ (GL thành hub thật).
6. Sửa & nâng LCTT: tính số dư đầu kỳ trực tiếp từ `date < start`; hướng tới LCTT phân loại HĐKD/đầu tư/tài chính.
