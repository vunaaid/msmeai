// src/lib/payroll.ts
// Tính lương theo quy định VN: BHXH/BHYT/BHTN (NV 10.5% / DN 21.5%, có trần) +
// thuế TNCN lũy tiến từng phần + giảm trừ gia cảnh.
// Tham số có thể cập nhật khi luật thay đổi.

// Giảm trừ gia cảnh (Nghị quyết 954/2020)
export const PERSONAL_DEDUCTION = 11_000_000; // bản thân / tháng
export const DEPENDENT_DEDUCTION = 4_400_000; // mỗi người phụ thuộc / tháng

// Trần lương đóng BH
const CAP_SI_HI = 46_800_000; // 20 × lương cơ sở 2.34tr — trần BHXH + BHYT
const CAP_UI = 99_200_000; // 20 × LTT vùng I 4.96tr — trần BHTN

// Tỷ lệ trích (NV đóng)
const EMP_BHXH = 0.08;
const EMP_BHYT = 0.015;
const EMP_BHTN = 0.01;
// Tỷ lệ trích (DN đóng)
const ER_BHXH = 0.175;
const ER_BHYT = 0.03;
const ER_BHTN = 0.01;

// Biểu thuế TNCN lũy tiến từng phần (theo tháng)
const PIT_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 5_000_000, rate: 0.05 },
  { upTo: 10_000_000, rate: 0.10 },
  { upTo: 18_000_000, rate: 0.15 },
  { upTo: 32_000_000, rate: 0.20 },
  { upTo: 52_000_000, rate: 0.25 },
  { upTo: 80_000_000, rate: 0.30 },
  { upTo: Infinity, rate: 0.35 },
];

/** Thuế TNCN lũy tiến từng phần trên thu nhập tính thuế (đã trừ BH + giảm trừ). */
export function calcPIT(taxable: number): number {
  if (taxable <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const b of PIT_BRACKETS) {
    if (taxable <= lower) break;
    const slice = Math.min(taxable, b.upTo) - lower;
    if (slice > 0) tax += slice * b.rate;
    lower = b.upTo;
  }
  return Math.round(tax);
}

export interface PayrollInput {
  baseSalary: number; // lương cơ bản (gross)
  allowance?: number; // phụ cấp (tính vào thu nhập chịu thuế cho đơn giản)
  otherDeduction?: number; // khấu trừ khác (tạm ứng, phạt...)
  dependents?: number;
  insuranceSalary?: number | null; // lương đóng BH (mặc định = baseSalary)
}

export interface PayrollResult {
  grossSalary: number;
  insuranceBase: number;
  insuranceEmployee: number; // NV đóng (10.5% có trần)
  insuranceEmployer: number; // DN đóng (21.5% có trần)
  taxableIncome: number;
  pit: number;
  netSalary: number; // thực nhận
  companyCost: number; // chi phí DN = gross + BH DN
}

/** Tính 1 dòng lương. */
export function computePayroll(inp: PayrollInput): PayrollResult {
  const base = Math.max(0, inp.baseSalary || 0);
  const allowance = Math.max(0, inp.allowance || 0);
  const other = Math.max(0, inp.otherDeduction || 0);
  const dependents = Math.max(0, inp.dependents || 0);
  const gross = base + allowance;
  const insBase = Math.max(0, inp.insuranceSalary ?? base);

  const baseSiHi = Math.min(insBase, CAP_SI_HI);
  const baseUi = Math.min(insBase, CAP_UI);
  const insuranceEmployee = Math.round(baseSiHi * (EMP_BHXH + EMP_BHYT) + baseUi * EMP_BHTN);
  const insuranceEmployer = Math.round(baseSiHi * (ER_BHXH + ER_BHYT) + baseUi * ER_BHTN);

  const deduction = PERSONAL_DEDUCTION + dependents * DEPENDENT_DEDUCTION;
  const taxableIncome = Math.max(0, gross - insuranceEmployee - deduction);
  const pit = calcPIT(taxableIncome);

  const netSalary = Math.max(0, gross - insuranceEmployee - pit - other);
  const companyCost = gross + insuranceEmployer;

  return { grossSalary: gross, insuranceBase: insBase, insuranceEmployee, insuranceEmployer, taxableIncome, pit, netSalary, companyCost };
}
