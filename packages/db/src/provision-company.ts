// packages/db/src/provision-company.ts
// Khởi tạo cấu hình mặc định cho một công ty đã tồn tại (theo taxCode).
// Dùng: tsx src/provision-company.ts <taxCode>

import { PrismaClient } from "../generated/client";
import { ensureGlobalPermissions, initializeCompanyDefaults } from "./provisioning.js";

const prisma = new PrismaClient();

async function main() {
  const taxCode = process.argv[2];
  if (!taxCode) {
    console.error("Usage: tsx src/provision-company.ts <taxCode>");
    process.exit(1);
  }
  const company = await prisma.company.findFirst({ where: { taxCode } });
  if (!company) throw new Error(`Không tìm thấy công ty taxCode=${taxCode}`);

  await ensureGlobalPermissions(prisma);
  const r = await initializeCompanyDefaults(prisma, company.id);
  console.log(`✓ Provisioned ${company.name} (${taxCode}): ${r.roles} roles + module configs + ${r.recurring} việc định kỳ`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
