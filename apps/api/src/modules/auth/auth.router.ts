// src/modules/auth/auth.router.ts
// Public auth endpoints — không cần requireAuth

import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "@vsme/db/client";
import { z } from "zod";
import { ok, badRequest, unauthorized } from "../../lib/response.js";

const router = Router();

const loginSchema = z.object({
  email:       z.string().email(),
  password:    z.string().min(1),
  companySlug: z.string().optional().nullable(),
});

// POST /api/auth/login
// Được gọi bởi NextAuth authorize() — xác thực credentials và trả về user data
router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return badRequest(res, "Dữ liệu không hợp lệ");
    }

    const { email, password, companySlug } = parsed.data;

    // Tìm user theo email + company scope
    const user = await prisma.user.findFirst({
      where: {
        email,
        isActive: true,
        ...(companySlug ? { company: { slug: companySlug } } : {}),
      },
      include: {
        company: true,
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user) {
      return unauthorized(res);
    }

    // Nhân sự ảo (AI Agent) không phải tài khoản đăng nhập
    if (user.accountType === "agent") {
      return unauthorized(res);
    }

    // system_admin không login qua subdomain
    if (companySlug && user.accountType === "system_admin") {
      return unauthorized(res);
    }

    // Kiểm tra password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return unauthorized(res);
    }

    // Cập nhật lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }).catch(() => {}); // ignore error

    // Trả về user data cho NextAuth tạo session
    return ok(res, {
      id:          user.id,
      email:       user.email,
      name:        user.name,
      mustChangePassword: user.mustChangePassword,
      accountType: user.accountType as "system_admin" | "company_admin" | "user",
      companyId:   user.companyId,
      companyName: user.company.name,
      companySlug: user.company.slug ?? null,
      roleId:      user.roleId,
      roleName:    user.role?.name ?? null,
      roleLevel:   user.role?.level ?? null,
      isSuperAdmin: user.isSuperAdmin,
      avatarUrl:   user.avatarUrl,
      aiMode:      user.company.ai_mode as "full" | "assistant",
      permissions: user.role?.permissions.map(rp => ({
        moduleKey: rp.permission.moduleKey,
        action:    rp.permission.action,
        scope:     rp.permission.scope,
      })) ?? [],
    });
  } catch (err) {
    next(err);
  }
});

export default router;
