# Rà soát quy trình: Công việc & Dự án (work)

> Ngày: 2026-06-08 · Người rà: AI audit · Phạm vi: work.router, recurring, agent-exec, projects, UI work/

## 1. Phạm vi (3.1)
Quản lý công việc vận hành/dự án, việc định kỳ, hàng đợi agent tự thực thi, Kanban dự án, breakdown AI → việc con.

## 2. SWOT (3.2)
**Điểm mạnh:** multi-tenant chặt (mọi query lọc `companyId`); claim job atomic chống trùng (agent-exec); việc định kỳ chống trùng theo kỳ + lịch thứ-6-cuối-kỳ; trạng thái gom 4 + "Quá hạn" suy ra; đếm sub-tab ở server (không lệ thuộc trang); Kanban kéo-thả zero-dep optimistic.
**Điểm yếu:** không phân quyền đọc theo người (mọi user trong công ty xem được mọi việc — chấp nhận với SME phẳng); gán việc chỉ kiểm tra cùng công ty, không ép theo cây quản lý; agent job tạo từ batch không có `agentContext`; chưa có trang xóa dự án/việc.
**Cơ hội:** nhắc quá hạn/đến hạn (tái dùng cron định kỳ); hiện `watchers` lên UI; burndown từ `storyPoints`+Sprint; duyệt/leo thang qua `getManagerChain`.
**Thách thức:** hàng đợi agent in-process chỉ chạy trong 1 tiến trình (cần single-instance); agent job chạy Claude CLI đồng bộ trong drain loop (không timeout rõ).

## 3. Phát hiện & xử lý (3.3–3.5)
| # | Mức | Phát hiện | Trạng thái |
|---|---|---|---|
| 1 | HIGH | Việc con (approve/batch) không kế thừa `epicId`/`sprintId` → lạc khỏi epic/sprint trên board | ✅ **Đã fix** (batch kế thừa epic/sprint) |
| 2 | MEDIUM | `completedAt` không xóa khi mở lại việc đã hoàn thành → mốc lỗi thời | ✅ **Đã fix** (reset khi rời completed) |
| 3 | HIGH | batch/approve gửi notification trực tiếp, bỏ qua `notifyUsers` (mất realtime/push) | ⬜ Đề xuất |
| 4 | MEDIUM | Agent job tạo không set `agentContext` → agent chạy mất ngữ cảnh | ⬜ Đề xuất |
| 5 | MEDIUM | `requireApproval` tạo việc `pending_approval` nhưng không sinh breakdown → kẹt, không duyệt được | ⬜ Đề xuất |
| 6 | LOW | Kéo-thả không re-sequence cột nguồn; `boardOrder` trôi (vô hại) | ⬜ Đề xuất |
| 7 | LOW | Project không có endpoint xóa / cascade | ⬜ Đề xuất |

## 4. Đề xuất cải tiến SME
1. Gom mọi notification qua `notifyUsers` (realtime + push nhất quán).
2. Cron nhắc việc quá hạn/đến hạn (dữ liệu đã có).
3. Ép phạm vi giao việc theo `getAssignableUsers` ở API (không chỉ cùng công ty).
4. Hiện & sửa `watchers` trên UI.
5. Guard chuyển trạng thái + reset mốc (đã làm phần `completedAt`).
6. Burndown/velocity từ storyPoints + Sprint.
