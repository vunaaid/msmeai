// src/middleware/auth.ts
// Xác thực JWT từ NextAuth session token (cookie hoặc Bearer header).
// NextAuth v5 dùng JWE (encrypted) — giải mã bằng AUTH_SECRET, salt = tên cookie.
// Permissions KHÔNG có trong JWT (để cookie nhỏ) → load từ DB theo roleId.

import type { Request, Response, NextFunction } from "express";
import { decode } from "@auth/core/jwt";
import { prisma } from "@vsme/db/client";
import type { SessionUser } from "../lib/rbac.js";

const AUTH_SECRET = process.env["AUTH_SECRET"] ?? "";

// Web có thể set cookie ở chế độ secure (prod) hoặc thường (dev).
// Chấp nhận cả 2 — salt khi decode JWE phải đúng bằng tên cookie đã dùng để encode.
const COOKIE_NAMES = [
  "__Secure-authjs.session-token", // prod (secure)
  "authjs.session-token",          // dev
] as const;

// Mở rộng Express Request để gắn user vào
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

// Cache permissions theo roleId (TTL ngắn) — tránh query DB mỗi request.
const PERM_TTL_MS = 60_000;
const permCache = new Map<string, { perms: SessionUser["permissions"]; exp: number }>();

// Cache trạng thái user theo userId (TTL ngắn) — extraRoleIds + isActive không nằm
// trong JWT (giữ cookie nhỏ), load từ DB giống permissions → đổi có hiệu lực ngay,
// và chặn ngay user đã bị vô hiệu hóa dù JWT còn hạn.
const EXTRA_TTL_MS = 60_000;
const userStateCache = new Map<string, { roles: string[]; isActive: boolean; exists: boolean; exp: number }>();

/** Xoá cache trạng thái 1 user (gọi khi admin cập nhật vai trò / vô hiệu hóa) → hiệu lực ngay. */
export function invalidateExtraRoles(userId: string): void {
  userStateCache.delete(userId);
}

async function loadUserState(userId: string): Promise<{ roles: string[]; isActive: boolean; exists: boolean }> {
  const cached = userStateCache.get(userId);
  if (cached && cached.exp > Date.now()) return cached;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { extraRoleIds: true, isActive: true } });
  const state = { roles: u?.extraRoleIds ?? [], isActive: u?.isActive ?? false, exists: !!u };
  userStateCache.set(userId, { ...state, exp: Date.now() + EXTRA_TTL_MS });
  return state;
}

async function loadPermissions(roleId: string | null): Promise<SessionUser["permissions"]> {
  if (!roleId) return [];
  const cached = permCache.get(roleId);
  if (cached && cached.exp > Date.now()) return cached.perms;

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { permissions: { include: { permission: true } } },
  });
  const perms = (role?.permissions ?? []).map((rp) => ({
    moduleKey: rp.permission.moduleKey,
    action: rp.permission.action,
    scope: rp.permission.scope,
  }));
  permCache.set(roleId, { perms, exp: Date.now() + PERM_TTL_MS });
  return perms;
}

/** Middleware: đọc JWT từ cookie hoặc Authorization header, gắn vào req.user */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Lấy raw token + salt tương ứng (tên cookie).
    //    NextAuth chia cookie lớn thành <name>.0, <name>.1, ... → ghép lại.
    //    (salt khi decode luôn = tên gốc, không kèm hậu tố .0/.1)
    let token: string | undefined;
    let salt: string | undefined;
    const cookies = (req.cookies ?? {}) as Record<string, string>;
    for (const name of COOKIE_NAMES) {
      if (cookies[name]) {
        token = cookies[name];
        salt = name;
        break;
      }
      if (cookies[`${name}.0`] !== undefined) {
        const parts: string[] = [];
        for (let i = 0; cookies[`${name}.${i}`] !== undefined; i++) {
          parts.push(cookies[`${name}.${i}`] as string);
        }
        token = parts.join("");
        salt = name;
        break;
      }
    }

    // 2. Fallback: Bearer token (API client không có cookie) — dùng salt prod
    if (!token) {
      const authHeader = req.headers["authorization"];
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.slice(7);
        salt = COOKIE_NAMES[0];
      }
    }

    if (!token || !salt) {
      next();
      return;
    }

    // 3. Giải mã JWT (JWE) bằng AUTH_SECRET
    const payload = await decode({ token, secret: AUTH_SECRET, salt });

    if (!payload) {
      next();
      return;
    }

    // 4. Map payload → SessionUser (permissions load từ DB theo roleId)
    const roleId = (payload["roleId"] as string | null) ?? null;
    const uid = payload["id"] as string;

    // Chặn ngay user đã bị vô hiệu hóa / xóa (dù JWT còn hạn).
    const state = await loadUserState(uid);
    if (!state.exists || !state.isActive) {
      next();
      return;
    }

    req.user = {
      id:          uid,
      email:       payload["email"] as string ?? "",
      name:        payload["name"] as string ?? "",
      accountType: payload["accountType"] as SessionUser["accountType"],
      companyId:   payload["companyId"] as string,
      companyName: payload["companyName"] as string ?? "",
      companySlug: payload["companySlug"] as string | null ?? null,
      roleId,
      roleName:    payload["roleName"] as string | null ?? null,
      roleLevel:   payload["roleLevel"] as string | null ?? null,
      extraRoleIds: state.roles,
      isSuperAdmin: payload["isSuperAdmin"] as boolean ?? false,
      avatarUrl:   payload["avatarUrl"] as string | null ?? null,
      aiMode:      (payload["aiMode"] as string ?? "assistant") as "full" | "assistant",
      permissions: await loadPermissions(roleId),
    };
  } catch (err) {
    // Lỗi decode → bỏ qua, req.user = undefined → route sẽ trả 401
    if (process.env["NODE_ENV"] !== "production") {
      console.warn("[auth] decode error:", err);
    }
  }

  next();
}

/** Guard: require auth — dùng như middleware trên route cụ thể */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Chưa đăng nhập" },
    });
    return;
  }
  next();
}
