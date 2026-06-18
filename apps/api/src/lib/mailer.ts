// src/lib/mailer.ts
// Gửi email qua Resend REST API (tái dùng cấu hình RESEND_API_KEY từ VM).
// Gọi REST trực tiếp bằng fetch — không cần thêm dependency `resend`.
// Dev fallback: nếu chưa cấu hình key → log OTP ra console (không gửi email thật).

const RESEND_API_KEY = process.env["RESEND_API_KEY"] ?? "";
const RESEND_FROM = process.env["RESEND_FROM"] ?? "vSME <noreply@novelof.me>";
const isConfigured = !!RESEND_API_KEY && !RESEND_API_KEY.startsWith("placeholder");

function otpHtml(otp: string): string {
  return `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px;color:#0f172a">
  <h2 style="margin:0 0 8px;color:#0e7490">vSME</h2>
  <p style="color:#64748b;margin:0 0 32px">Xác nhận đăng ký tài khoản dùng thử</p>
  <div style="background:#f1f5f9;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
    <p style="margin:0 0 8px;font-size:14px;color:#64748b">Mã xác nhận của bạn</p>
    <div style="font-size:40px;font-weight:700;letter-spacing:8px;color:#0891b2">${otp}</div>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">Mã có hiệu lực trong 10 phút</p>
  </div>
  <p style="font-size:12px;color:#94a3b8">Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p>
</body></html>`;
}

/** Gửi OTP đăng ký. Throw nếu Resend trả lỗi. Trả về { sent } — sent=false nghĩa là dev-mode (log). */
export async function sendOtpEmail(to: string, otp: string): Promise<{ sent: boolean }> {
  if (!isConfigured) {
    console.log(`\n[OTP dev] ${to} → ${otp}\n`);
    return { sent: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: RESEND_FROM,
      to,
      subject: `${otp} — Mã xác nhận đăng ký vSME`,
      html: otpHtml(otp),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend lỗi ${res.status}: ${body.slice(0, 200)}`);
  }
  return { sent: true };
}
