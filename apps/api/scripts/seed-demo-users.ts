// Demo: tạo role + user mẫu cho một công ty demo. Idempotent (upsert).
// Dữ liệu dưới đây là HƯ CẤU, chỉ để minh họa cấu trúc seed — hãy thay bằng dữ liệu
// thật của bạn trong môi trường riêng.
import { prisma } from "@vsme/db/client";
import { AccountType, RoleLevel } from "@vsme/db";
import bcrypt from "bcryptjs";

const COMPANY = "Demo Company";
const PASSWORD = process.env["SEED_USER_PASSWORD"] ?? "ChangeMe@123";

const NEW_ROLES: { name: string; level: RoleLevel; description: string }[] = [
  { name: "Phó Chủ Tịch HĐQT", level: RoleLevel.board, description: "Phó Chủ tịch Hội đồng quản trị" },
  { name: "Giám Đốc IT (CTO)", level: RoleLevel.c_suite, description: "Giám đốc Công nghệ thông tin" },
  { name: "Lập Trình Viên", level: RoleLevel.staff, description: "Lập trình viên / Developer" },
];

const USERS: { name: string; email: string; roleName: string }[] = [
  { name: "Nguyễn Văn A", email: "chairman@example.com", roleName: "Chủ tịch HĐQT" },
  { name: "Trần Văn B",   email: "vice@example.com",     roleName: "Phó Chủ Tịch HĐQT" },
  { name: "Lê Văn C",     email: "cto@example.com",      roleName: "Giám Đốc IT (CTO)" },
  { name: "Phạm Văn D",   email: "dev@example.com",      roleName: "Lập Trình Viên" },
];

// Quan hệ cấp trên trực tiếp (subordinate email → manager email). null = đỉnh.
const MANAGERS: Record<string, string | null> = {
  "chairman@example.com": null,                   // Chủ tịch HĐQT — đỉnh
  "vice@example.com":     "chairman@example.com", // Phó CT → Chủ tịch
  "ceo@example.com":      "chairman@example.com", // TGĐ → Chủ tịch
  "cto@example.com":      "ceo@example.com",       // CTO → TGĐ
  "dev@example.com":      "cto@example.com",       // Developer → CTO
};

async function main() {
  const company = await prisma.company.findFirst({ where: { name: COMPANY }, select: { id: true } });
  if (!company) throw new Error(`Không tìm thấy công ty ${COMPANY}`);
  const companyId = company.id;

  // 1) Roles
  for (const r of NEW_ROLES) {
    const role = await prisma.role.upsert({
      where: { companyId_name: { companyId, name: r.name } },
      update: { level: r.level, description: r.description },
      create: { companyId, name: r.name, level: r.level, description: r.description },
      select: { id: true, name: true, level: true },
    });
    console.log(`ROLE  ok  [${role.level}] ${role.name}`);
  }

  // 2) Users
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  for (const u of USERS) {
    const role = await prisma.role.findFirst({
      where: { companyId, name: u.roleName }, select: { id: true, level: true },
    });
    if (!role) throw new Error(`Thiếu role "${u.roleName}" cho ${u.name}`);

    const existing = await prisma.user.findUnique({
      where: { companyId_email: { companyId, email: u.email } }, select: { id: true },
    });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { name: u.name, roleId: role.id, isActive: true },
      });
      console.log(`USER  upd [${role.level}] ${u.name} <${u.email}> → ${u.roleName} (đã có, cập nhật role; KHÔNG đổi mật khẩu)`);
    } else {
      await prisma.user.create({
        data: {
          companyId, email: u.email, name: u.name, passwordHash,
          roleId: role.id, accountType: AccountType.user, isActive: true,
        },
      });
      console.log(`USER  new [${role.level}] ${u.name} <${u.email}> → ${u.roleName} (mật khẩu: ${PASSWORD})`);
    }
  }

  // 3) Quan hệ cấp trên trực tiếp (managerId)
  for (const [subEmail, mgrEmail] of Object.entries(MANAGERS)) {
    const sub = await prisma.user.findUnique({
      where: { companyId_email: { companyId, email: subEmail } }, select: { id: true, name: true },
    });
    if (!sub) { console.log(`SKIP  manager: chưa có user ${subEmail}`); continue; }
    let managerId: string | null = null;
    if (mgrEmail) {
      const mgr = await prisma.user.findUnique({
        where: { companyId_email: { companyId, email: mgrEmail } }, select: { id: true },
      });
      if (!mgr) { console.log(`SKIP  manager: chưa có cấp trên ${mgrEmail}`); continue; }
      managerId = mgr.id;
    }
    await prisma.user.update({ where: { id: sub.id }, data: { managerId } });
    console.log(`MGR   ok  ${sub.name} → ${mgrEmail ?? "(đỉnh, không cấp trên)"}`);
  }
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error("LỖI:", e.message); await prisma.$disconnect(); process.exit(1);
});
