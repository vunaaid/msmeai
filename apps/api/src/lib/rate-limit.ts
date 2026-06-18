// src/lib/rate-limit.ts
// Rate limiter in-memory (không thêm dependency). Đủ cho 1 process API (PM2 fork).
// Dùng cho các endpoint công khai (đăng ký, gửi OTP) chống spam/brute-force.

import type { Request, Response, NextFunction } from "express";

export function clientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0]!.trim();
  return req.ip ?? "unknown";
}

interface Opts {
  windowMs: number;
  max: number;
  /** Khoá đếm (mặc định theo IP). */
  key?: (req: Request) => string;
  message?: string;
}

export function rateLimit(opts: Opts) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const k = opts.key ? opts.key(req) : clientIp(req);
    const now = Date.now();
    let h = hits.get(k);
    if (!h || now > h.reset) { h = { count: 0, reset: now + opts.windowMs }; hits.set(k, h); }
    h.count++;
    if (h.count > opts.max) {
      const retry = Math.max(1, Math.ceil((h.reset - now) / 1000));
      res.setHeader("Retry-After", String(retry));
      res.status(429).json({
        success: false,
        error: { code: "RATE_LIMITED", message: opts.message ?? `Quá nhiều yêu cầu. Thử lại sau ${retry}s.` },
      });
      return;
    }
    next();
  };
}
