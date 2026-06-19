// src/modules/auth/signup.router.ts
// Đăng ký dùng thử theo luồng Phase 2 — PUBLIC (không requireAuth).
// Tạo công ty + tài khoản quản trị + khởi tạo cấu hình theo mô hình tổ chức đã chọn
// (roles + modules work/documents + module chọn thêm + việc định kỳ tương ứng).
// Đặt ngoài /auth vì /api/auth/* trên web bị NextAuth chiếm (không qua proxy được).

import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import { AccountType, ensureGlobalPermissions, initializeCompanyDefaults } from "@vsme/db";
import { created, badRequest } from "../../lib/response.js";
import { rateLimit } from "../../lib/rate-limit.js";

const router = Router();

// ─── Rate limiter (in-memory) ────────────────────────────────────────────────
const signupLimiter = rateLimit({ windowMs: 60 * 60_000, max: 10, message: "Quá nhiều lượt đăng ký từ IP này. Thử lại sau." });

// Phòng ban tuỳ chọn → các role tương ứng (Phòng Hành Chính là bắt buộc, luôn tạo).
const DEPARTMENT_ROLES: Record<string, string[]> = {
  accounting: ["Kế Toán Trưởng", "Kế Toán Viên"],
  sales:      ["Trưởng Phòng Kinh Doanh", "Nhân Viên Kinh Doanh"],
  hr:         ["Trưởng Phòng Nhân Sự"],
};

const registerSchema = z.object({
  // Bước 1: tài khoản quản trị
  fullName:     z.string().min(2).max(100),
  email:        z.string().email(),
  password:     z.string().min(6).max(100),
  // Bước 2: công ty + subdomain + loại hình
  companyName:  z.string().min(2).max(200),
  slug:         z.string().regex(/^[a-z0-9-]+$/, "Subdomain chỉ gồm chữ thường, số và dấu -").min(2).max(40).optional(),
  businessType: z.string().max(50).optional(),
  // Bước 3: mô hình tổ chức
  org: z.object({
    hasBoard:     z.boolean().default(false),
    boardMembers: z.boolean().default(false),
    ceo:          z.boolean().default(true),
    cfo:          z.boolean().default(false),
    cto:          z.boolean().default(false),
    departments:  z.array(z.enum(["accounting", "sales", "hr"])).default([]),
  }).default({}),
  // Bước 4: module bật thêm (work + documents luôn bật)
  modules: z.array(z.string()).default([]),
});

/** Bỏ dấu tiếng Việt + chuẩn hoá thành slug an toàn cho subdomain. */
function slugify(input: string): string {
  const s = input
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "cty";
}

/** Mô hình tổ chức → danh sách tên role cần tạo (Company Admin + Phòng HC tự thêm ở provisioning). */
function rolesFromOrg(org: z.infer<typeof registerSchema>["org"]): string[] {
  const names = new Set<string>(["Người Xem"]);
  if (org.hasBoard) {
    names.add("Chủ tịch HĐQT");
    if (org.boardMembers) names.add("Thành Viên HĐQT");
  }
  // Không có HĐQT thì bắt buộc có Tổng Giám Đốc (CEO)
  if (org.ceo || !org.hasBoard) names.add("Tổng Giám Đốc");
  if (org.cfo) names.add("Giám Đốc Tài Chính");
  if (org.cto) names.add("Giám Đốc Công Nghệ");
  for (const d of org.departments) {
    for (const r of DEPARTMENT_ROLES[d] ?? []) names.add(r);
  }
  return [...names];
}

// POST /api/signup
router.post("/", signupLimiter, async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return badRequest(res, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    }
    const { fullName, email, password, companyName, businessType, org, modules } = parsed.data;

    // Email duy nhất toàn hệ thống (để đăng nhập ở main domain không nhập nhằng).
    const emailTaken = await prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (emailTaken) return badRequest(res, "Email đã được sử dụng");

    // Slug subdomain duy nhất.
    const base = parsed.data.slug ?? slugify(companyName);
    let slug = base;
    for (let i = 1; await prisma.company.findUnique({ where: { slug }, select: { id: true } }); i++) {
      slug = `${base}-${i}`;
    }

    // taxCode tạm cho bản dùng thử (bắt buộc & unique) — công ty cập nhật sau.
    let taxCode = `TRIAL-${Date.now().toString(36).toUpperCase()}`;
    for (let i = 1; await prisma.company.findUnique({ where: { taxCode }, select: { id: true } }); i++) {
      taxCode = `TRIAL-${Date.now().toString(36).toUpperCase()}-${i}`;
    }

    // 1) Tạo công ty (lưu loại hình DN + đánh dấu trial trong settings)
    const company = await prisma.company.create({
      data: {
        name: companyName, slug, taxCode,
        settings: { businessType: businessType ?? null, plan: "trial" },
      },
    });

    // 2) Khởi tạo theo mô hình tổ chức đã chọn (roles + modules + việc định kỳ)
    await ensureGlobalPermissions(prisma);
    const init = await initializeCompanyDefaults(prisma, company.id, {
      roleNames: rolesFromOrg(org),
      extraEnabledModules: modules,
    });

    // 3) Tạo tài khoản quản trị, gán role "Quản Trị Viên Công Ty"
    const adminRole = await prisma.role.findFirst({
      where: { companyId: company.id, name: "Quản Trị Viên Công Ty" },
      select: { id: true },
    });
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        companyId:   company.id,
        email,
        name:        fullName,
        passwordHash,
        roleId:      adminRole?.id ?? null,
        accountType: AccountType.company_admin,
        isActive:    true,
      },
    });

    return created(res, { companySlug: slug, email, roles: init.roles, recurring: init.recurring });
  } catch (err) {
    next(err);
  }
});

export default router;
