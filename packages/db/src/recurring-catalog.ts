// packages/db/src/recurring-catalog.ts
// Danh mục công việc định kỳ MẶC ĐỊNH theo vai trò (dùng chung cho seed + API).
// Khớp với role của công ty theo `roleLevel` + (tuỳ chọn) từ khoá tên `roleNameLike`.

export type Cadence = "weekly" | "monthly" | "quarterly" | "yearly";
export type RoleLevelKey = "board" | "c_suite" | "manager" | "staff" | "company_admin";
export type Priority = "urgent" | "high" | "normal" | "low";

export interface RecurringDuty {
  roleLevel: RoleLevelKey;
  roleNameLike?: string; // khớp một phần tên vai trò (không phân biệt hoa thường)
  title: string;
  description?: string;
  cadence: Cadence;
  module?: string;
  priority?: Priority;
  dueOffsetDays?: number;
}

export const RECURRING_CATALOG: RecurringDuty[] = [
  // ─── HĐQT ───────────────────────────────────────────────────────────────────
  { roleLevel: "board", roleNameLike: "Chủ Tịch", title: "Chủ trì họp HĐQT định kỳ", cadence: "quarterly", module: "approvals", priority: "high", dueOffsetDays: 7 },
  { roleLevel: "board", roleNameLike: "Chủ Tịch", title: "Duyệt báo cáo tài chính quý", cadence: "quarterly", module: "reports", priority: "high", dueOffsetDays: 10 },
  { roleLevel: "board", roleNameLike: "Chủ Tịch", title: "Phê duyệt dự toán ngân sách năm", cadence: "yearly", module: "gl", priority: "high", dueOffsetDays: 14 },
  { roleLevel: "board", roleNameLike: "Chủ Tịch", title: "Đánh giá hiệu quả CEO & C-Suite", cadence: "yearly", priority: "normal", dueOffsetDays: 14 },
  { roleLevel: "board", roleNameLike: "Chủ Tịch", title: "Rà soát rủi ro & tuân thủ", cadence: "quarterly", priority: "normal", dueOffsetDays: 10 },

  { roleLevel: "board", roleNameLike: "Thành Viên", title: "Dự họp HĐQT & bỏ phiếu", cadence: "quarterly", module: "approvals", priority: "high", dueOffsetDays: 7 },
  { roleLevel: "board", roleNameLike: "Thành Viên", title: "Giám sát lĩnh vực phụ trách", cadence: "monthly", priority: "normal", dueOffsetDays: 5 },
  { roleLevel: "board", roleNameLike: "Thành Viên", title: "Rà soát KPI công ty", cadence: "quarterly", module: "reports", priority: "normal", dueOffsetDays: 7 },

  // ─── C-Suite ──────────────────────────────────────────────────────────────────
  { roleLevel: "c_suite", roleNameLike: "Tổng Giám Đốc", title: "Họp giao ban C-Suite", cadence: "weekly", priority: "high", dueOffsetDays: 1 },
  { roleLevel: "c_suite", roleNameLike: "Tổng Giám Đốc", title: "Rà soát dòng tiền", cadence: "weekly", module: "cash", priority: "high", dueOffsetDays: 1 },
  { roleLevel: "c_suite", roleNameLike: "Tổng Giám Đốc", title: "Duyệt báo cáo KPI tháng", cadence: "monthly", module: "reports", priority: "high", dueOffsetDays: 3 },
  { roleLevel: "c_suite", roleNameLike: "Tổng Giám Đốc", title: "Báo cáo HĐQT", cadence: "quarterly", module: "reports", priority: "high", dueOffsetDays: 7 },
  { roleLevel: "c_suite", roleNameLike: "Tổng Giám Đốc", title: "Lập kế hoạch kinh doanh năm", cadence: "yearly", priority: "high", dueOffsetDays: 14 },

  { roleLevel: "c_suite", roleNameLike: "Tài Chính", title: "Rà soát dòng tiền tuần", cadence: "weekly", module: "cash", priority: "high", dueOffsetDays: 1 },
  { roleLevel: "c_suite", roleNameLike: "Tài Chính", title: "Duyệt báo cáo tài chính tháng", cadence: "monthly", module: "gl", priority: "high", dueOffsetDays: 5 },
  { roleLevel: "c_suite", roleNameLike: "Tài Chính", title: "Quyết toán & khai báo thuế quý", cadence: "quarterly", module: "tax", priority: "urgent", dueOffsetDays: 20 },
  { roleLevel: "c_suite", roleNameLike: "Tài Chính", title: "Lập ngân sách năm", cadence: "yearly", module: "gl", priority: "high", dueOffsetDays: 14 },

  // ─── Quản lý (mọi trưởng phòng — khớp theo level) ─────────────────────────────
  { roleLevel: "manager", title: "Họp giao ban phòng", cadence: "weekly", priority: "normal", dueOffsetDays: 1 },
  { roleLevel: "manager", title: "Báo cáo công việc phòng", cadence: "monthly", module: "reports", priority: "normal", dueOffsetDays: 3 },
  { roleLevel: "manager", title: "Đánh giá nhân sự phòng", cadence: "quarterly", module: "hr", priority: "normal", dueOffsetDays: 7 },

  // ─── Phòng Hành chính Tổng hợp (nơi nhận việc không giao được cho ai) ─────────
  { roleLevel: "manager", roleNameLike: "Hành Chính", title: "Quản lý văn thư - lưu trữ công văn", cadence: "weekly", module: "documents", priority: "normal", dueOffsetDays: 1 },
  { roleLevel: "manager", roleNameLike: "Hành Chính", title: "Tổng hợp báo cáo hành chính tháng", cadence: "monthly", module: "reports", priority: "normal", dueOffsetDays: 3 },
  { roleLevel: "manager", roleNameLike: "Hành Chính", title: "Kiểm kê tài sản - cơ sở vật chất quý", cadence: "quarterly", module: "assets", priority: "normal", dueOffsetDays: 7 },

  // ─── Nhân viên ────────────────────────────────────────────────────────────────
  { roleLevel: "staff", title: "Báo cáo công việc tuần", cadence: "weekly", priority: "normal", dueOffsetDays: 1 },
];
