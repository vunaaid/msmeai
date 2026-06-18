// src/lib/hierarchy.ts
// Quan hệ cấp trên–cấp dưới TRỰC TIẾP (User.managerId) + suy ra cấp dưới để giao việc.
// Ưu tiên cây báo cáo tường minh (managerId); nếu user chưa có cấp dưới nào được
// cấu hình thì fallback về cấp bậc vai trò (role.level) cho tương thích ngược.

import { prisma } from "@vsme/db/client";
import type { SessionUser } from "./rbac.js";

// Thứ tự cấp bậc (cao → thấp). Ai không nằm trong danh sách (admin/system)
// được xem là có thể giao cho mọi nhân sự.
export const HIER = ["board", "c_suite", "manager", "staff"] as const;

export interface AssignableUser {
  id: string;
  name: string;
  role: { name: string; level: string } | null;
}

/** User được phép giao cho bất kỳ ai trong công ty (admin/HĐQT) hay phải giới hạn cấp dưới? */
export function canAssignAnyone(user: SessionUser): boolean {
  return (
    user.isSuperAdmin ||
    user.accountType === "system_admin" ||
    user.accountType === "company_admin" ||
    user.roleLevel === "company_admin"
  );
}

/** Cấp dưới TRỰC TIẾP của một user (managerId trỏ tới user này). */
export async function getDirectReports(companyId: string, managerId: string): Promise<AssignableUser[]> {
  const users = await prisma.user.findMany({
    where: { companyId, managerId, isActive: true },
    select: { id: true, name: true, role: { select: { name: true, level: true } } },
    orderBy: { name: "asc" },
  });
  return users;
}

/**
 * Toàn bộ cấp dưới (đệ quy) của một user theo cây managerId — không gồm chính user.
 * An toàn với vòng lặp dữ liệu nhờ tập `seen`.
 */
export async function getAllReports(companyId: string, userId: string): Promise<AssignableUser[]> {
  const all = await prisma.user.findMany({
    where: { companyId, isActive: true, managerId: { not: null } },
    select: { id: true, name: true, managerId: true, role: { select: { name: true, level: true } } },
  });
  const childrenOf = new Map<string, typeof all>();
  for (const u of all) {
    const arr = childrenOf.get(u.managerId!) ?? [];
    arr.push(u);
    childrenOf.set(u.managerId!, arr);
  }
  const result: AssignableUser[] = [];
  const seen = new Set<string>([userId]);
  const stack = [userId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of childrenOf.get(cur) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      result.push({ id: child.id, name: child.name, role: child.role });
      stack.push(child.id);
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Chuỗi cấp trên của một user: [cấp trên trực tiếp, … , đỉnh].
 * Dùng cho luồng trình ký/báo cáo lên trên. Dừng khi hết manager hoặc gặp vòng lặp.
 */
export async function getManagerChain(companyId: string, userId: string): Promise<AssignableUser[]> {
  const all = await prisma.user.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, managerId: true, role: { select: { name: true, level: true } } },
  });
  const byId = new Map(all.map((u) => [u.id, u]));
  const chain: AssignableUser[] = [];
  const seen = new Set<string>([userId]);
  let cur = byId.get(userId)?.managerId ?? null;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const m = byId.get(cur);
    if (!m) break;
    chain.push({ id: m.id, name: m.name, role: m.role });
    cur = m.managerId ?? null;
  }
  return chain;
}

/** Cấp trên trực tiếp (1 cấp) — tiện cho định tuyến trình ký 1 bước. */
export async function getDirectManager(companyId: string, userId: string): Promise<AssignableUser | null> {
  const chain = await getManagerChain(companyId, userId);
  return chain[0] ?? null;
}

/**
 * Đặt `newManagerId` làm cấp trên của `userId` có tạo ra vòng lặp không?
 * (newManagerId == userId, hoặc newManagerId nằm trong cây cấp dưới của userId.)
 */
export async function wouldCreateCycle(companyId: string, userId: string, newManagerId: string): Promise<boolean> {
  if (userId === newManagerId) return true;
  // Đi LÊN từ newManagerId; nếu chạm userId nghĩa là userId vốn là cấp trên của nó → tạo vòng.
  const all = await prisma.user.findMany({
    where: { companyId },
    select: { id: true, managerId: true },
  });
  const byId = new Map(all.map((u) => [u.id, u.managerId ?? null]));
  const seen = new Set<string>();
  let cur: string | null = newManagerId;
  while (cur && !seen.has(cur)) {
    if (cur === userId) return true;
    seen.add(cur);
    cur = byId.get(cur) ?? null;
  }
  return false;
}

/**
 * Danh sách nhân sự mà `user` được phép giao việc.
 * - Admin/HĐQT-không-xác-định-cấp → toàn bộ nhân sự công ty.
 * - User có cây báo cáo (≥1 cấp dưới) → chính mình + toàn bộ cấp dưới (đệ quy theo managerId).
 * - User chưa được cấu hình cấp dưới → fallback theo cấp bậc vai trò (role.level).
 */
export async function getAssignableUsers(user: SessionUser): Promise<AssignableUser[]> {
  // 1) Cây báo cáo tường minh được ưu tiên.
  const reports = await getAllReports(user.companyId, user.id);
  if (reports.length > 0) {
    const me = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, role: { select: { name: true, level: true } } },
    });
    return me ? [me, ...reports] : reports;
  }

  // 2) Fallback: theo cấp bậc vai trò (hành vi cũ) khi chưa dựng cây báo cáo.
  const users = await prisma.user.findMany({
    where: {
      companyId: user.companyId,
      isActive: true,
      accountType: { not: "system_admin" },
    },
    select: { id: true, name: true, role: { select: { name: true, level: true } } },
    orderBy: { name: "asc" },
  });

  const myIdx = HIER.indexOf((user.roleLevel ?? "") as (typeof HIER)[number]);
  const anyone = canAssignAnyone(user) || myIdx === -1;

  return users.filter((u) => {
    if (u.id === user.id) return true;
    if (anyone) return true;
    const idx = HIER.indexOf((u.role?.level ?? "") as (typeof HIER)[number]);
    return idx > -1 && idx > myIdx;
  });
}
