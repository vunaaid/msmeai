// src/lib/query.ts
// Helpers để đọc query params và route params an toàn từ Express

/** Lấy string từ query param — trả về undefined nếu không phải string */
export function qs(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  return undefined;
}

/** Lấy string với default fallback */
export function qsOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/** Parse integer từ query param */
export function qi(value: unknown, fallback: number): number {
  if (typeof value !== "string") return fallback;
  const n = parseInt(value, 10);
  return isNaN(n) ? fallback : n;
}

/** Route param — luôn trả về string (Express params luôn là string, TypeScript chỉ không biết) */
export function param(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return (value[0] as string) ?? "";
  return String(value ?? "");
}
