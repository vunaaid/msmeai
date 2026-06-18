// src/scripts/check-recurring-plan.ts
// Kiểm tra luồng dữ liệu của GET /recurring (occurrences + assignees) trên DB thật.
// Chạy: tsx src/scripts/check-recurring-plan.ts   (chỉ đọc, không ghi)

import { prisma } from "@vsme/db/client";
import { occurrencesForYear } from "../modules/work/recurring-schedule.js";

async function main() {
  const company = await prisma.company.findFirst({ where: { taxCode: "0000000000" } });
  if (!company) throw new Error("Không tìm thấy công ty demo");

  const items = await prisma.recurringWork.findMany({
    where: { companyId: company.id },
    include: { role: { select: { id: true, name: true, level: true } } },
    orderBy: [{ active: "desc" }, { cadence: "asc" }, { title: "asc" }],
  });

  console.log(`Công ty: ${company.name} — ${items.length} việc định kỳ`);
  if (items.length === 0) {
    console.log("⚠️  Chưa có việc định kỳ nào — vào /admin/recurring bấm 'Nạp mặc định' để có dữ liệu.");
    await prisma.$disconnect();
    return;
  }

  const year = new Date().getUTCFullYear();
  const roleIds = [...new Set(items.map((i) => i.roleId))];
  const users = await prisma.user.findMany({
    where: { companyId: company.id, roleId: { in: roleIds }, isActive: true },
    select: { name: true, roleId: true },
  });
  const byRole = new Map<string, string[]>();
  for (const u of users) {
    const a = byRole.get(u.roleId!) ?? [];
    a.push(u.name);
    byRole.set(u.roleId!, a);
  }

  console.log(`Năm ${year}:\n`);
  for (const it of items.slice(0, 10)) {
    const overrides = (it.dueDateOverrides as Record<string, string> | null) ?? {};
    const occ = occurrencesForYear(it.cadence, year, overrides);
    const perQ = [1, 2, 3, 4].map((q) => occ.filter((o) => o.quarter === q).length);
    const people = byRole.get(it.roleId) ?? [];
    console.log(`• [${it.cadence}] ${it.title}`);
    console.log(`    vai trò: ${it.role?.name} | nhân sự (${people.length}): ${people.join(", ") || "(chưa có)"}`);
    console.log(`    occ=${occ.length}  Q1/Q2/Q3/Q4=${perQ.join("/")}  ngày đầu=${occ[0]?.date}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
