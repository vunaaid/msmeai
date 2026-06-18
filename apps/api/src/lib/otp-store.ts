// src/lib/otp-store.ts
// Lưu OTP đăng ký trong bộ nhớ (TTL 10 phút). API chạy 1 process (PM2 fork) nên
// in-memory là đủ; tránh tạo bảng DB/migration. Mất khi restart → user gửi lại mã.

interface Entry { code: string; expires: number; verified: boolean; attempts: number }

const store = new Map<string, Entry>();
const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function key(email: string): string { return email.trim().toLowerCase(); }
function gen(): string { return Math.floor(100000 + Math.random() * 900000).toString(); }

/** Tạo OTP mới (huỷ mã cũ). */
export function createOtp(email: string): string {
  const code = gen();
  store.set(key(email), { code, expires: Date.now() + TTL_MS, verified: false, attempts: 0 });
  return code;
}

/** Đối chiếu OTP; đúng → đánh dấu email đã xác minh. Sai/hết hạn/quá số lần → false. */
export function verifyOtp(email: string, code: string): boolean {
  const e = store.get(key(email));
  if (!e || Date.now() > e.expires || e.attempts >= MAX_ATTEMPTS) return false;
  e.attempts++;
  if (e.code !== code.trim()) return false;
  e.verified = true;
  return true;
}

/** Email đã xác minh OTP và còn hiệu lực? */
export function isEmailVerified(email: string): boolean {
  const e = store.get(key(email));
  return !!e && e.verified && Date.now() <= e.expires;
}

/** Xoá sau khi đăng ký thành công. */
export function consumeOtp(email: string): void { store.delete(key(email)); }
