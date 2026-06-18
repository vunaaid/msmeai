// src/lib/response.ts
// Chuẩn hoá API responses — tương đương Next.js version

import type { Response } from "express";
import { ZodError } from "zod";

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    // Số lượng việc theo nhóm tiến độ (sub-tab) — tính trên toàn bộ phạm vi view,
    // độc lập với bucket đang chọn & phân trang.
    counts?: { in_progress: number; overdue: number; completed: number };
  };
}

export interface ApiError {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export function ok<T>(res: Response, data: T, meta?: ApiSuccess<T>["meta"]): Response {
  return res.status(200).json({ success: true, data, meta });
}

export function created<T>(res: Response, data: T): Response {
  return res.status(201).json({ success: true, data });
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

export function unauthorized(res: Response, message = "Chưa đăng nhập"): Response {
  return res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message } });
}

export function forbidden(res: Response, message = "Không có quyền truy cập"): Response {
  return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message } });
}

export function notFound(res: Response, resource = "Resource"): Response {
  return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: `${resource} không tồn tại` } });
}

export function badRequest(res: Response, message: string, details?: unknown): Response {
  return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message, details } });
}

export function conflict(res: Response, message: string): Response {
  return res.status(409).json({ success: false, error: { code: "CONFLICT", message } });
}

export function serverError(res: Response, err?: unknown): Response {
  if (process.env["NODE_ENV"] !== "production") console.error(err);
  return res.status(500).json({
    success: false,
    error: { code: "INTERNAL_SERVER_ERROR", message: "Lỗi hệ thống. Vui lòng thử lại sau." },
  });
}

// ─── Error class ─────────────────────────────────────────────────────────────

export class PermissionError extends Error {
  constructor(message = "Không có quyền truy cập") {
    super(message);
    this.name = "PermissionError";
  }
}

export class ModuleDisabledError extends Error {
  constructor(public readonly moduleKey: string) {
    super(`Module '${moduleKey}' chưa được kích hoạt`);
    this.name = "ModuleDisabledError";
  }
}

// ─── Catch wrapper ────────────────────────────────────────────────────────────

import type { Request, NextFunction, RequestHandler } from "express";

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Bọc async handler — tự động forward lỗi sang error middleware */
export function wrap(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch(next);
}
