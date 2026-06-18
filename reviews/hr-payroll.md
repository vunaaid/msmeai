# Rà soát quy trình: Nhân sự & Tiền lương (HR)

> Ngày: 2026-06-08 · Người rà: AI audit · Phạm vi: hr.router, lib/payroll, middleware/auth, UI hr/

## 1. Phạm vi (3.1)
Tuyển dụng → hồ sơ → HĐLĐ → tính lương (BHXH/TNCN) → cấp/thu hồi tài khoản; mục 2 todo02.

## 2. SWOT (3.2)
**Điểm mạnh:** multi-tenant + verify ownership trước khi sửa/xóa; RBAC tách read/write/delete/approve; Employee tách khỏi User (đúng HR↔IAM); provision-user transactional, bcrypt cost 12, không lưu mật khẩu thô; thuế TNCN lũy tiến đúng từng bậc, BHXH tách trần SI/HI vs BHTN; chặn sửa/sinh lại bảng lương không phải nháp, chặn xóa bảng đã chi.
**Điểm yếu:** rate/cap luật cứng trong code (sai khi luật đổi giữa năm); PIT chỉ tính tháng (chưa quyết toán năm; chưa xử lý 10% thử việc/HĐ<3 tháng); phụ cấp mặc định chịu thuế toàn bộ + miễn BH toàn bộ (sai một số khoản); chưa có chấm công/nghỉ phép → không prorate; cap BHTN cứng vùng I.
**Cơ hội:** module chấm công/nghỉ phép → prorate lương; xuất tờ khai BHXH (D02) + TNCN (05/KK); payslip PDF qua `Employee.user`; bảng tham số thuế theo công ty/năm.
**Thách thức:** hằng số luật cứng → rủi ro khai sai khi luật đổi; `companyCost` dùng làm dự báo dòng tiền nhưng bỏ KPCĐ 2% + timing nộp thuế.

## 3. Phát hiện & xử lý (3.3–3.5)
| # | Mức | Phát hiện | Trạng thái |
|---|---|---|---|
| 1 | **CRITICAL** | `employeeSchema` bỏ sót lương (baseSalary/allowance/dependents/insuranceSalary) → mọi NV lưu lương 0 → payroll = 0 | ✅ **Đã fix** (thêm field + ghi create/patch) |
| 2 | HIGH/bảo mật | Auth không check `isActive` → user nghỉ vẫn truy cập đến khi JWT hết hạn | ✅ **Đã fix** (middleware chặn user inactive/đã xóa ngay) |
| 3 | HIGH/bảo mật | provision-user không chặn NV đã nghỉ + không validate `roleId` thuộc công ty (leo quyền chéo tenant) | ✅ **Đã fix** (chặn nghỉ + validate role) |
| 4 | HIGH | FK chéo tenant khác (departmentId/positionId/managerId, position.defaultRoleId) chưa validate | ⬜ Đề xuất (validate company-scope) |
| 5 | LOW | `nextEmployeeCode` count-based → đụng sau khi xóa | ⬜ Đề xuất (max suffix; 409 đã có) |
| 6 | LOW | `on_leave` trả full lương, không prorate | ⬜ Đề xuất |

## 4. Đề xuất cải tiến SME
1. **Bảng tham số thuế/BH theo công ty + ngày hiệu lực** (`PayrollPolicy`) — bỏ hằng số cứng, an toàn khi luật đổi.
2. **Chấm công & nghỉ phép → prorate lương** (gap lớn nhất về độ chính xác).
3. Chế độ PIT thử việc 10% + quyết toán năm.
4. Xuất tờ khai BHXH (D02) + TNCN (05/KK) + payslip PDF từ snapshot bảng lương.
5. Validate company-scope cho mọi FK còn lại; audit trail + snapshot bất biến khi duyệt.
6. Phân loại phụ cấp (miễn/chịu thuế, vào/ngoài nền BH).
