// src/lib/dashboard/widgets.ts
// Quyết định danh sách widget hiển thị trên /dashboard theo vai trò (role level)
// và năng lực (capability flags). Capability-first: phân biệt CEO/CFO/KTT/kế toán viên
// bằng quyền (canFinance / canFinanceApprove) thay vì đoán theo tên role.

export type WidgetKey =
  | "financeSnapshot"
  | "balanceSheet"
  | "cashPosition"
  | "profitTrend"
  | "expensePie"
  | "pendingGl"
  | "glHealth"
  | "aiApprovals"
  | "myTasks"
  | "mySubmitted"
  | "delegated"
  | "projects"
  | "recurring"
  | "notifications";

export interface DashboardFlags {
  isAdmin: boolean;
  level: string | null; // board | c_suite | manager | staff | null
  canFinance: boolean; // đọc được module gl / reports
  canFinanceApprove: boolean; // duyệt (post) bút toán gl
}

export type DashboardScope = "company" | "team" | "self";

export function scopeForLevel(level: string | null, isAdmin: boolean): DashboardScope {
  if (isAdmin) return "company";
  if (level === "board" || level === "c_suite") return "company";
  if (level === "manager") return "team";
  return "self";
}

/** Danh sách widget (đã sắp thứ tự, loại trùng) cho user theo flags. */
export function resolveWidgets(flags: DashboardFlags): WidgetKey[] {
  const { isAdmin, level, canFinance, canFinanceApprove } = flags;
  const scope = scopeForLevel(level, isAdmin);
  const isManagerUp =
    isAdmin || level === "board" || level === "c_suite" || level === "manager";

  const out: WidgetKey[] = [];

  // 1. Phê duyệt — chỉ người có vai trò duyệt
  if (isManagerUp) out.push("aiApprovals");

  // 2. Cụm Tài Chính — gate theo quyền đọc GL (KTT/CFO/CEO/HĐQT/kế toán viên)
  if (canFinance) {
    out.push("financeSnapshot");
    if (scope === "company") out.push("balanceSheet", "profitTrend", "expensePie");
    out.push("cashPosition");
    if (canFinanceApprove) out.push("pendingGl");
    out.push("glHealth");
  }

  // 3. Công việc
  if (isManagerUp) out.push("delegated");
  if (level !== "board") out.push("myTasks");
  if (!isManagerUp) out.push("mySubmitted");

  // 4. Dự án + việc định kỳ
  if (isManagerUp) out.push("projects");
  if (level === "staff" || level === "manager") out.push("recurring");

  // 5. Thông báo — mọi role
  out.push("notifications");

  return [...new Set(out)];
}
