// src/modules/work/recurring-schedule.ts
// Tính ngày thực hiện cố định cho công việc định kỳ + nhóm theo quý.
//
// Quy tắc ngày mặc định (đã chốt nghiệp vụ):
//   - Lấy ngày cuối kỳ (cuối tháng/quý/năm), chọn thứ 6 gần đó:
//       offset = 5 − dow(ngày cuối kỳ)   (T2=1 … CN=7, thứ 6 = 5)
//       nếu offset > 2 thì offset −= 7   (lùi về thứ 6 cuối cùng trong kỳ)
//   - Nếu thứ 6 đó trúng ngày lễ → lùi về ngày làm việc trước đó.
// Mọi trường hợp đều nằm trong ≤2 ngày làm việc so với ngày cuối kỳ.

import type { Cadence } from "@vsme/db";
import { isoDate, previousWorkingDay } from "./vn-holidays.js";

const DAY_MS = 86_400_000;

function utc(year: number, month0: number, day: number): Date {
  return new Date(Date.UTC(year, month0, day));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Ngày cuối cùng của tháng (month0: 0–11). */
function lastDayOfMonth(year: number, month0: number): Date {
  return utc(year, month0 + 1, 0); // ngày 0 của tháng kế = ngày cuối tháng này
}

/** Tính thứ 6 đóng kỳ (đã điều chỉnh ngày lễ) từ ngày cuối kỳ. */
export function closingFriday(periodLastDay: Date): Date {
  const jsDow = periodLastDay.getUTCDay();       // 0=CN .. 6=T7
  const dow = jsDow === 0 ? 7 : jsDow;           // T2=1 .. CN=7
  let offset = 5 - dow;                          // thứ 6 = 5
  if (offset > 2) offset -= 7;
  return previousWorkingDay(addDays(periodLastDay, offset));
}

export type Quarter = 1 | 2 | 3 | 4;

export interface Occurrence {
  /** "YYYY-MM-DD" — ngày thực hiện (đã điều chỉnh / hoặc override). */
  date: string;
  /** Khoá kỳ, dùng để lưu/đối chiếu override. */
  periodKey: string;
  /** Quý của kỳ (1–4), không phải quý của ngày đã dời. */
  quarter: Quarter;
}

const QUARTER_END_MONTH: Record<Quarter, number> = { 1: 2, 2: 5, 3: 8, 4: 11 };

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Sinh các lần thực hiện trong 1 năm cho một cadence.
 * `overrides`: map periodKey → "YYYY-MM-DD" để ghi đè ngày từng kỳ.
 */
export function occurrencesForYear(
  cadence: Cadence,
  year: number,
  overrides: Record<string, string> = {}
): Occurrence[] {
  const out: Occurrence[] = [];
  const push = (key: string, quarter: Quarter, autoDate: Date) => {
    out.push({ periodKey: key, quarter, date: overrides[key] ?? isoDate(autoDate) });
  };

  switch (cadence) {
    case "yearly":
      push(`${year}`, 4, closingFriday(lastDayOfMonth(year, 11)));
      break;

    case "quarterly":
      for (const q of [1, 2, 3, 4] as Quarter[]) {
        push(`${year}-Q${q}`, q, closingFriday(lastDayOfMonth(year, QUARTER_END_MONTH[q])));
      }
      break;

    case "monthly":
      for (let m = 0; m < 12; m++) {
        const quarter = (Math.floor(m / 3) + 1) as Quarter;
        push(`${year}-${pad2(m + 1)}`, quarter, closingFriday(lastDayOfMonth(year, m)));
      }
      break;

    case "weekly": {
      // Mọi thứ 6 trong năm (điều chỉnh nếu trúng lễ).
      let cur = utc(year, 0, 1);
      while (cur.getUTCDay() !== 5) cur = addDays(cur, 1); // 5 = thứ 6
      while (cur.getUTCFullYear() === year) {
        const key = isoDate(cur); // dùng ngày thứ 6 gốc làm khoá
        const quarter = (Math.floor(cur.getUTCMonth() / 3) + 1) as Quarter;
        push(key, quarter, previousWorkingDay(cur));
        cur = addDays(cur, 7);
      }
      break;
    }
  }

  return out;
}

export interface CurrentPeriod {
  /** Ngày bắt đầu kỳ (UTC 00:00) — dùng để chống sinh trùng trong cùng kỳ. */
  periodStart: Date;
  /** Khoá kỳ — khớp với periodKey trong occurrencesForYear để áp override. */
  periodKey: string;
  /** Hạn = thứ 6 cuối kỳ (đã điều chỉnh ngày lễ). */
  dueDate: Date;
}

/**
 * Kỳ hiện tại chứa `now` cho một cadence: ngày bắt đầu kỳ (để dedup) + hạn thứ 6 cuối kỳ.
 * Dùng khi sinh việc định kỳ thật lên workboard.
 */
export function currentPeriod(cadence: Cadence, now: Date): CurrentPeriod {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  switch (cadence) {
    case "yearly":
      return { periodStart: utc(y, 0, 1), periodKey: `${y}`, dueDate: closingFriday(lastDayOfMonth(y, 11)) };

    case "quarterly": {
      const q = (Math.floor(m / 3) + 1) as Quarter;
      return {
        periodStart: utc(y, (q - 1) * 3, 1),
        periodKey: `${y}-Q${q}`,
        dueDate: closingFriday(lastDayOfMonth(y, QUARTER_END_MONTH[q])),
      };
    }

    case "monthly":
      return {
        periodStart: utc(y, m, 1),
        periodKey: `${y}-${pad2(m + 1)}`,
        dueDate: closingFriday(lastDayOfMonth(y, m)),
      };

    case "weekly": {
      // Đầu tuần (thứ 2) chứa `now`; hạn = thứ 6 của tuần đó (lùi nếu trúng lễ).
      const jsDow = now.getUTCDay();                 // 0=CN .. 6=T7
      const fromMonday = jsDow === 0 ? 6 : jsDow - 1; // số ngày kể từ thứ 2
      const monday = addDays(utc(y, m, now.getUTCDate()), -fromMonday);
      const friday = addDays(monday, 4);
      return { periodStart: monday, periodKey: isoDate(friday), dueDate: previousWorkingDay(friday) };
    }
  }
}
