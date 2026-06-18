// src/scripts/check-recurring-schedule.ts
// Kiểm tra nhanh logic tính ngày của công việc định kỳ (chạy: tsx src/scripts/check-recurring-schedule.ts).
// Không cần DB. Trả exit code 1 nếu có case sai.

import { closingFriday, occurrencesForYear } from "../modules/work/recurring-schedule.js";

let failed = 0;
function expect(label: string, got: string, want: string) {
  const okk = got === want;
  if (!okk) failed++;
  console.log(`${okk ? "✓" : "✗"} ${label}: got ${got}${okk ? "" : ` — want ${want}`}`);
}

// closingFriday cho ngày cuối tháng (UTC)
const last = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)); // m1 = số tháng (1–12) → ngày 0 tháng kế
const cf = (y: number, m1: number) => closingFriday(last(y, m1)).toISOString().slice(0, 10);

expect("Tháng 5/2026 (CN 31/5 → T6 cùng tuần)", cf(2026, 5), "2026-05-29");
expect("Tháng 6/2026 (T3 30/6 → T6 cuối trong tháng)", cf(2026, 6), "2026-06-26");
expect("Tháng 4/2026 (T5 30/4, trúng lễ 30/4 & 1/5 → lùi)", cf(2026, 4), "2026-04-29");
expect("Tháng 12/2026 (T5 31/12, 1/1 là lễ → lùi 31/12)", cf(2026, 12), "2026-12-31");
expect("Tháng 9/2026 (T4 30/9 → T6 đầu kỳ sau 2/10)", cf(2026, 9), "2026-10-02");

// occurrences
const q = occurrencesForYear("quarterly", 2026);
expect("Quarterly có 4 kỳ", String(q.length), "4");
expect("Quarterly Q2 (30/6 → 26/6)", q[1]!.date, "2026-06-26");
expect("Quarterly Q2 quarter=2", String(q[1]!.quarter), "2");

const mo = occurrencesForYear("monthly", 2026);
expect("Monthly có 12 kỳ", String(mo.length), "12");
expect("Monthly tháng 9 quarter=3 (theo kỳ, dù ngày sang Q4)", String(mo[8]!.quarter), "3");

const yr = occurrencesForYear("yearly", 2026);
expect("Yearly có 1 kỳ, quarter=4", `${yr.length}/${yr[0]!.quarter}`, "1/4");

const wk = occurrencesForYear("weekly", 2026);
expect("Weekly ~52-53 kỳ", String(wk.length >= 52 && wk.length <= 53), "true");

// override
const ov = occurrencesForYear("quarterly", 2026, { "2026-Q2": "2026-06-15" });
expect("Override Q2 áp dụng", ov[1]!.date, "2026-06-15");

console.log(failed === 0 ? "\n✅ Tất cả case đúng" : `\n❌ ${failed} case sai`);
process.exit(failed === 0 ? 0 : 1);
