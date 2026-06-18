// src/modules/work/vn-holidays.ts
// Lịch nghỉ lễ Việt Nam dùng cho việc tính ngày làm việc của công việc định kỳ.
//
// CẬP NHẬT HÀNG NĂM: các ngày lễ ÂM LỊCH (Tết Nguyên đán, Giỗ Tổ Hùng Vương) và
// những ngày nghỉ điều chỉnh do Chính phủ công bố KHÔNG cố định theo dương lịch —
// phải bổ sung thủ công vào LUNAR_BY_YEAR cho mỗi năm mới.
// (Nâng cấp tương lai: chuyển sang bảng DB `Holiday` + trang quản trị.)

// Mọi thao tác dùng UTC để tránh lệch ngày theo múi giờ máy chủ.

/** Ngày lễ cố định theo dương lịch (lặp mỗi năm) — định dạng "MM-DD". */
const FIXED_MMDD = [
  "01-01", // Tết Dương lịch
  "04-30", // Giải phóng miền Nam
  "05-01", // Quốc tế Lao động
  "09-01", // Quốc khánh (ngày nghỉ liền kề)
  "09-02", // Quốc khánh
];

/** Ngày lễ âm lịch + ngày nghỉ điều chỉnh — bổ sung theo công bố mỗi năm. */
const LUNAR_BY_YEAR: Record<number, string[]> = {
  2026: [
    // Tết Nguyên đán Bính Ngọ (mùng 1 = 17/02/2026)
    "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20",
    // Giỗ Tổ Hùng Vương (10/3 âm lịch)
    "2026-04-26",
  ],
  2027: [
    // Tết Nguyên đán Đinh Mùi (mùng 1 = 06/02/2027)
    "2027-02-05", "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09",
    // Giỗ Tổ Hùng Vương (10/3 âm lịch)
    "2027-04-16",
  ],
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "YYYY-MM-DD" theo UTC. */
export function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

const _holidayCache = new Map<number, Set<string>>();

function holidaySet(year: number): Set<string> {
  let s = _holidayCache.get(year);
  if (!s) {
    s = new Set<string>();
    for (const mmdd of FIXED_MMDD) s.add(`${year}-${mmdd}`);
    for (const d of LUNAR_BY_YEAR[year] ?? []) s.add(d);
    _holidayCache.set(year, s);
  }
  return s;
}

export function isHoliday(d: Date): boolean {
  return holidaySet(d.getUTCFullYear()).has(isoDate(d));
}

/** Ngày làm việc = không phải T7/CN và không phải ngày lễ. */
export function isWorkingDay(d: Date): boolean {
  const dow = d.getUTCDay(); // 0=CN .. 6=T7
  if (dow === 0 || dow === 6) return false;
  return !isHoliday(d);
}

const DAY_MS = 86_400_000;

/** Trả về `d` nếu là ngày làm việc, nếu không thì lùi dần tới ngày làm việc gần nhất trước đó. */
export function previousWorkingDay(d: Date): Date {
  let cur = d;
  while (!isWorkingDay(cur)) cur = new Date(cur.getTime() - DAY_MS);
  return cur;
}
