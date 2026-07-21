// src/modules/account/account.router.ts
// Thao tác trên tài khoản của chính người dùng.
//
// Vì sao không nằm trong auth.router.ts: ở phía web, /api/auth/* do NextAuth
// chiếm (route cụ thể hơn catch-all proxy), nên browser không gọi tới Express
// qua đường đó được. /api/account/* thì đi qua proxy bình thường.

import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "@vsme/db/client";
import { z } from "zod";
import { ok, badRequest, unauthorized } from "../../lib/response.js";

const router = Router();

const changePasswordSchema = z.object({
  email:       z.string().email(),
  password:    z.string().min(1),
  newPassword: z.string()
    .min(8, "Mật khẩu mới tối thiểu 8 ký tự")
    .regex(/[a-z]/, "Mật khẩu mới phải có chữ thường")
    .regex(/[A-Z]/, "Mật khẩu mới phải có chữ hoa")
    .regex(/[0-9]/, "Mật khẩu mới phải có chữ số"),
  companySlug: z.string().optional().nullable(),
});

// POST /api/account/change-password
// Đổi mật khẩu bằng mật khẩu hiện tại. Dùng cho luồng bắt buộc đổi mật khẩu ở
// lần đăng nhập đầu (mustChangePassword=true) nên KHÔNG yêu cầu session sẵn có:
// biết mật khẩu hiện tại đã đủ chứng minh danh tính.
router.post("/change-password", async (req, res, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return badRequest(res, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    }

    const { email, password, newPassword, companySlug } = parsed.data;

    const user = await prisma.user.findFirst({
      where: {
        email,
        isActive: true,
        ...(companySlug ? { company: { slug: companySlug } } : {}),
      },
    });

    // Sai email và sai mật khẩu trả cùng một lỗi — không lộ email nào tồn tại.
    if (!user || user.accountType === "agent") {
      return unauthorized(res);
    }

    if (!await bcrypt.compare(password, user.passwordHash)) {
      return unauthorized(res);
    }

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return badRequest(res, "Mật khẩu mới phải khác mật khẩu hiện tại");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash:       await bcrypt.hash(newPassword, 12),
        mustChangePassword: false,
      },
    });

    return ok(res, { changed: true });
  } catch (err) {
    next(err);
  }
});

export default router;
