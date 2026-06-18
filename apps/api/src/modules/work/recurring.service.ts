// src/modules/work/recurring.service.ts
// Sinh công việc định kỳ lên workboard + nạp danh mục mặc định.

import { prisma } from "@vsme/db/client";
import { importRecurringDefaults } from "@vsme/db";
import { currentPeriod } from "./recurring-schedule.js";

/** Đọc map override { periodKey → "YYYY-MM-DD" } từ JSON cột dueDateOverrides. */
function parseOverrides(v: unknown): Record<string, string> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, string>;
  return {};
}

/**
 * Sinh các việc định kỳ cho kỳ hiện tại của 1 công ty. Trả về số work_item đã tạo.
 *
 * Nghiệp vụ (đã chốt):
 *   - Mỗi kỳ (tuần/tháng/quý/năm) sinh 1 lần, tạo ngay khi bước vào kỳ (cron chạy hằng ngày).
 *   - Hạn = thứ 6 cuối kỳ (closingFriday, đã điều chỉnh ngày lễ); có thể override theo kỳ.
 *   - Chống trùng: bỏ qua nếu lastGeneratedAt đã nằm trong kỳ hiện tại.
 */
export async function generateDueForCompany(companyId: string, now = new Date()): Promise<number> {
  const entries = await prisma.recurringWork.findMany({ where: { companyId, active: true } });
  let created = 0;

  for (const e of entries) {
    const { periodStart, periodKey, dueDate: autoDue } = currentPeriod(e.cadence, now);
    // Đã sinh cho kỳ hiện tại rồi → bỏ qua
    if (e.lastGeneratedAt && e.lastGeneratedAt.getTime() >= periodStart.getTime()) continue;

    // Người giữ vai trò chính HOẶC có vai trò bổ sung khớp (vd thành viên HĐQT).
    const users = await prisma.user.findMany({
      where: {
        companyId, isActive: true,
        OR: [{ roleId: e.roleId }, { extraRoleIds: { has: e.roleId } }],
      },
      select: { id: true },
    });
    // Không có ai giữ vai trò → bỏ qua (không đánh dấu, để khi có người sẽ sinh)
    if (users.length === 0) continue;

    // Hạn = thứ 6 cuối kỳ; ưu tiên override theo kỳ nếu admin đã đặt.
    const override = parseOverrides(e.dueDateOverrides)[periodKey];
    const dueDate = override ? new Date(`${override}T00:00:00.000Z`) : autoDue;

    await prisma.$transaction([
      ...users.map((u) =>
        prisma.workItem.create({
          data: {
            companyId,
            workType: "operational",
            title: e.title,
            description: e.description ?? undefined,
            status: "active",
            priority: e.priority,
            createdBy: u.id,
            assignedTo: u.id,
            dueDate,
          },
        })
      ),
      prisma.recurringWork.update({ where: { id: e.id }, data: { lastGeneratedAt: now } }),
    ]);

    created += users.length;
  }

  return created;
}

/** Chạy cho tất cả công ty đang hoạt động (dùng cho cron). */
export async function generateAllCompanies(now = new Date()): Promise<{ companyId: string; created: number }[]> {
  const companies = await prisma.company.findMany({ where: { isActive: true }, select: { id: true } });
  const result: { companyId: string; created: number }[] = [];
  for (const c of companies) {
    result.push({ companyId: c.id, created: await generateDueForCompany(c.id, now) });
  }
  return result;
}

/** Nạp danh mục việc định kỳ mặc định vào công ty (dùng logic dùng chung ở @vsme/db). */
export async function importDefaults(companyId: string): Promise<number> {
  return importRecurringDefaults(prisma, companyId);
}
