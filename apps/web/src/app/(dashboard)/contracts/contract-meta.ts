// src/app/(dashboard)/contracts/contract-meta.ts
// Nhãn tiếng Việt + màu cho các enum hợp đồng. Dùng chung giữa list, modal, detail.

export type Direction = "inbound" | "outbound" | "internal";
export type ContractType = "sales" | "service" | "lease" | "labor" | "nda" | "principle" | "construction" | "other";
export type ContractStatus =
  | "draft" | "review" | "pending_approval" | "pending_signature"
  | "active" | "completed" | "expired" | "terminated" | "cancelled";
export type PaymentMethod = "cash" | "bank_transfer" | "offset" | "installment" | "letter_of_credit" | "e_wallet" | "other";
export type PaymentTerm = "prepaid" | "on_delivery" | "net_days" | "milestone" | "recurring" | "retention";
export type PartyType = "customer" | "vendor" | "employee" | "other";
export type ScheduleStatus = "pending" | "invoiced" | "partially_paid" | "paid" | "overdue";
export type SignatoryStatus = "pending" | "signed" | "declined";

export const DIRECTION_LABEL: Record<Direction, string> = {
  outbound: "Đầu ra",
  inbound: "Đầu vào",
  internal: "Nội bộ",
};

export const TYPE_LABEL: Record<ContractType, string> = {
  sales: "Mua bán hàng hóa",
  service: "Dịch vụ",
  lease: "Thuê / cho thuê",
  labor: "Lao động",
  nda: "Bảo mật (NDA)",
  principle: "Nguyên tắc / khung",
  construction: "Thi công / xây lắp",
  other: "Khác",
};

export const STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "Nháp",
  review: "Đang review",
  pending_approval: "Chờ duyệt",
  pending_signature: "Chờ ký",
  active: "Hiệu lực",
  completed: "Hoàn thành",
  expired: "Hết hạn",
  terminated: "Đã chấm dứt",
  cancelled: "Đã hủy",
};

export const STATUS_COLOR: Record<ContractStatus, string> = {
  draft: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  review: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  pending_approval: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  pending_signature: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  completed: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  expired: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  terminated: "bg-red-500/15 text-red-300 border-red-500/30",
  cancelled: "bg-slate-600/15 text-slate-400 border-slate-600/30",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  offset: "Cấn trừ công nợ",
  installment: "Trả góp",
  letter_of_credit: "L/C (tín dụng thư)",
  e_wallet: "Ví điện tử",
  other: "Khác",
};

export const PAYMENT_TERM_LABEL: Record<PaymentTerm, string> = {
  prepaid: "Trả trước 100%",
  on_delivery: "Trả khi giao/nghiệm thu",
  net_days: "Công nợ N ngày",
  milestone: "Theo cột mốc",
  recurring: "Định kỳ",
  retention: "Giữ lại bảo hành",
};

export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = {
  pending: "Chưa tới hạn",
  invoiced: "Đã lập hóa đơn",
  partially_paid: "Trả một phần",
  paid: "Đã thanh toán",
  overdue: "Quá hạn",
};

// Dữ liệu AI bóc tách từ bản thảo → điền sẵn form Tạo hợp đồng.
export interface ContractPrefill {
  title: string;
  direction: Direction;
  type: ContractType;
  partyType: PartyType;
  partyName: string;
  partyTaxCode: string;
  valueBeforeTax: number;
  taxRate: number;
  paymentMethod: PaymentMethod | null;
  paymentTerm: PaymentTerm | null;
  netDays: number | null;
  startDate: string | null;
  endDate: string | null;
  description: string;
}

export function formatVnd(value: number | string | null | undefined, currency = "VND"): string {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  if (!Number.isFinite(n)) return "—";
  return `${(n as number).toLocaleString("vi-VN")} ${currency}`;
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("vi-VN");
}
