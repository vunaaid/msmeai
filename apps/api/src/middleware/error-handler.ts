// src/middleware/error-handler.ts
// Global error handler — bắt mọi lỗi từ async handlers

import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { PermissionError, ModuleDisabledError } from "../lib/response.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: "BAD_REQUEST",
        message: "Dữ liệu không hợp lệ",
        details: err.flatten(),
      },
    });
    return;
  }

  if (err instanceof PermissionError) {
    res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: err.message },
    });
    return;
  }

  if (err instanceof ModuleDisabledError) {
    res.status(403).json({
      success: false,
      error: {
        code: "MODULE_DISABLED",
        message: `Module '${err.moduleKey}' chưa được kích hoạt`,
      },
    });
    return;
  }

  // Prisma lỗi trùng khóa duy nhất (P2002) → 409 thay vì 500 chung.
  if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
    res.status(409).json({
      success: false,
      error: { code: "CONFLICT", message: "Dữ liệu đã tồn tại (trùng giá trị duy nhất)." },
    });
    return;
  }

  // Unknown error
  if (process.env["NODE_ENV"] !== "production") {
    console.error("[error]", err);
  }

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Lỗi hệ thống. Vui lòng thử lại sau.",
    },
  });
}
