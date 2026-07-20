// packages/db/src/seed.ts
// Seed: Super Admin + Default Company + System Roles + Permissions

import { PrismaClient, AccountType, AiMode } from "../generated/client";
import bcrypt from "bcryptjs";
import {
  generateDocx, generateXlsx, uploadBuffer, buildStoragePath, MIME_BY_TYPE,
} from "@vsme/storage";
import { ensureGlobalPermissions, initializeCompanyDefaults } from "./provisioning.js";

const prisma = new PrismaClient();

// Mật khẩu cài đặt lần đầu cho các tài khoản quản trị được seed. Cả hai tài khoản
// đều đặt mustChangePassword=true nên mật khẩu này chỉ dùng được đúng một lần:
// đăng nhập xong hệ thống buộc đổi ngay. Ghi đè bằng biến môi trường
// INITIAL_ADMIN_PASSWORD khi cài đặt ở môi trường thật.
const INITIAL_ADMIN_PASSWORD = process.env["INITIAL_ADMIN_PASSWORD"] ?? "Abc@123";

// Roles / modules / việc định kỳ mặc định được định nghĩa trong ./provisioning.ts
// (dùng chung cho seed + luồng tạo công ty mới).

async function main() {
  console.log("🌱 Starting seed...");

  // 1. Tạo tất cả Permissions (toàn cục)
  console.log("  → Creating permissions...");
  const permCount = await ensureGlobalPermissions(prisma);
  console.log(`  ✓ ${permCount} permissions created`);

  // 2a. Tạo Platform Company (dành cho system admin)
  console.log("  → Creating platform company...");
  const platform = await prisma.company.upsert({
    where: { taxCode: "PLATFORM" },
    update: {},
    create: {
      name: "vSME Platform",
      taxCode: "PLATFORM",
      slug: "platform",
      isPlatform: true,
      ai_mode: AiMode.assistant,
      settings: {},
      modulesConfig: {},
    },
  });
  console.log(`  ✓ Platform: ${platform.name} (${platform.id})`);

  // 2b. Tạo Default Demo Company
  console.log("  → Creating default company...");
  const company = await prisma.company.upsert({
    where: { taxCode: "0000000000" },
    update: {},
    create: {
      name: "vSME Demo Company",
      taxCode: "0000000000",
      slug: "demo",
      address: "Hà Nội, Việt Nam",
      email: "company@vsme.local",
      ai_mode: AiMode.assistant,
      settings: {},
      modulesConfig: {},
    },
  });
  console.log(`  ✓ Company: ${company.name} (${company.id})`);

  // 3. Khởi tạo cấu hình mặc định cho công ty demo: roles + modules + việc định kỳ
  console.log("  → Initializing company defaults (roles + modules + recurring)...");
  const init = await initializeCompanyDefaults(prisma, company.id);
  console.log(`  ✓ ${init.roles} roles + module configs + ${init.recurring} recurring work created`);

  // 4. Tạo users
  const passwordHash = await bcrypt.hash(INITIAL_ADMIN_PASSWORD, 12);

  // 4a. System Admin — thuộc Platform company, bypass mọi permission check
  console.log("  → Creating system admin user...");
  const sysAdmin = await prisma.user.upsert({
    where: { companyId_email: { companyId: platform.id, email: "sysadmin@vsme.local" } },
    update: { isSuperAdmin: true, accountType: AccountType.system_admin, isActive: true },
    create: {
      companyId: platform.id,
      email: "sysadmin@vsme.local",
      name: "System Administrator",
      passwordHash,
      isSuperAdmin: true,
      accountType: AccountType.system_admin,
      isActive: true,
      mustChangePassword: true,
    },
  });
  console.log(`  ✓ System Admin: ${sysAdmin.email} | Password: ${INITIAL_ADMIN_PASSWORD} (buộc đổi khi đăng nhập)`);

  // 4b. Company Admin — thuộc Demo company, quản trị company của mình
  console.log("  → Creating company admin user...");
  const companyAdminRole = await prisma.role.findFirst({
    where: { companyId: company.id, name: "Quản Trị Viên Công Ty" },
  });
  if (!companyAdminRole) throw new Error("Company Admin role not found — run seed in order");
  // Mật khẩu cài đặt lần đầu — cố tình đơn giản và buộc đổi ngay khi đăng nhập.
  // update: KHÔNG đụng tới passwordHash/mustChangePassword để chạy lại seed trên
  // DB đang dùng không đặt lại mật khẩu người dùng đã tự đổi.
  const companyAdminHash = await bcrypt.hash(INITIAL_ADMIN_PASSWORD, 12);
  const companyAdmin = await prisma.user.upsert({
    where: { companyId_email: { companyId: company.id, email: "admin@vsme.local" } },
    update: { accountType: AccountType.company_admin, roleId: companyAdminRole.id, isActive: true },
    create: {
      companyId: company.id,
      email: "admin@vsme.local",
      name: "Company Administrator",
      passwordHash: companyAdminHash,
      roleId: companyAdminRole.id,
      accountType: AccountType.company_admin,
      isActive: true,
      mustChangePassword: true,
    },
  });
  console.log(`  ✓ Company Admin: ${companyAdmin.email} | Password: ${INITIAL_ADMIN_PASSWORD} (buộc đổi khi đăng nhập)`);

  // (Module configs đã được tạo trong initializeCompanyDefaults ở bước 3.)

  // 6. Notification Templates mặc định
  console.log("  → Creating notification templates...");
  const TEMPLATES = [
    {
      eventType: "approval.request.created",
      channel: "inapp" as const,
      title: "Yêu cầu phê duyệt mới",
      bodyTemplate: "{{requestedBy}} cần bạn phê duyệt: {{title}}",
    },
    {
      eventType: "approval.request.approved",
      channel: "inapp" as const,
      title: "Yêu cầu đã được phê duyệt",
      bodyTemplate: "{{title}} đã được phê duyệt bởi {{decidedBy}}",
    },
    {
      eventType: "approval.request.rejected",
      channel: "inapp" as const,
      title: "Yêu cầu bị từ chối",
      bodyTemplate: "{{title}} bị từ chối: {{decision}}",
    },
    {
      eventType: "ai.task.completed",
      channel: "inapp" as const,
      title: "AI Task hoàn thành",
      bodyTemplate: "Agent {{agentName}} đã hoàn thành: {{taskTitle}}",
    },
    {
      eventType: "ai.escalation.triggered",
      channel: "inapp" as const,
      title: "AI cần phê duyệt",
      bodyTemplate: "{{agentName}} cần xác nhận trước khi thực hiện: {{action}}",
    },
  ];

  for (const t of TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { eventType_channel: { eventType: t.eventType, channel: t.channel } },
      update: {},
      create: {
        eventType: t.eventType,
        channel: t.channel,
        subject: t.title,
        bodyTemplate: t.bodyTemplate,
      },
    });
  }
  console.log(`  ✓ ${TEMPLATES.length} notification templates created`);

  // 7. Template tài liệu HỆ THỐNG (companyId = null, isSystem = true → KHÔNG được xóa)
  //    File mẫu được sinh tại chỗ và upload lên MinIO. Bỏ qua nếu MinIO không sẵn sàng.
  console.log("  → Seeding system document templates...");
  try {
    const sysTemplates: Array<{
      name: string; category: string; fileType: "docx" | "xlsx" | "md";
      variables: string[]; build: () => Promise<Buffer>;
    }> = [
      {
        name: "Hợp đồng lao động", category: "Nhân sự", fileType: "docx",
        variables: ["employeeName", "position", "salary", "startDate", "companyName"],
        build: () => generateDocx({
          title: "HỢP ĐỒNG LAO ĐỘNG",
          paragraphs: [
            "Công ty: {{companyName}}",
            "Người lao động: {{employeeName}}",
            "Vị trí: {{position}}",
            "Mức lương: {{salary}} VNĐ/tháng",
            "Ngày bắt đầu: {{startDate}}",
            "",
            "Hai bên thống nhất ký kết hợp đồng lao động với các điều khoản nêu trên.",
          ],
        }),
      },
      {
        name: "Báo giá", category: "Bán hàng", fileType: "docx",
        variables: ["customerName", "quoteNo", "date", "total"],
        build: () => generateDocx({
          title: "BÁO GIÁ",
          paragraphs: [
            "Số báo giá: {{quoteNo}}",
            "Ngày: {{date}}",
            "Khách hàng: {{customerName}}",
            "Tổng cộng: {{total}} VNĐ",
          ],
        }),
      },
      {
        name: "Biên bản họp", category: "Quản trị", fileType: "md",
        variables: ["title", "date", "attendees", "content"],
        build: async () => Buffer.from(
          "# Biên bản họp: {{title}}\n\n- **Ngày:** {{date}}\n- **Thành phần:** {{attendees}}\n\n## Nội dung\n\n{{content}}\n",
          "utf8",
        ),
      },
      {
        name: "Bảng lương", category: "Nhân sự", fileType: "xlsx",
        variables: [],
        build: () => generateXlsx({
          sheets: [{ name: "Bảng lương", rows: [["Họ tên", "Chức vụ", "Lương cơ bản", "Phụ cấp", "Thực nhận"]] }],
        }),
      },
    ];

    let created = 0;
    for (const t of sysTemplates) {
      const exists = await prisma.documentTemplate.findFirst({
        where: { companyId: null, isSystem: true, name: t.name },
      });
      if (exists) continue;
      const buffer = await t.build();
      const ext = t.fileType === "md" ? ".md" : `.${t.fileType}`;
      const storagePath = buildStoragePath("_system/templates", `${t.name}${ext}`);
      const { bucket, size } = await uploadBuffer({ storagePath, buffer, mimeType: MIME_BY_TYPE[t.fileType] });
      await prisma.documentTemplate.create({
        data: {
          companyId: null,
          name: t.name,
          category: t.category,
          fileType: t.fileType,
          bucket,
          storagePath,
          originalName: `${t.name}${ext}`,
          mimeType: MIME_BY_TYPE[t.fileType],
          size,
          variables: t.variables,
          isSystem: true,
          createdBy: sysAdmin.id,
        },
      });
      created++;
    }
    console.log(`  ✓ ${created} system document templates created`);
  } catch (err) {
    console.warn(`  ⚠ Bỏ qua seed template hệ thống (MinIO chưa sẵn sàng?): ${err instanceof Error ? err.message : err}`);
  }

  console.log("\n✅ Seed completed successfully!");
  // Cổng lấy từ .env — mặc định 3000/4000 không đúng ở mọi môi trường.
  const webUrl = `http://localhost:${process.env["WEB_PORT"] ?? "3000"}`;

  console.log("\n📌 Login credentials:");
  console.log("");
  console.log(`   [System Admin]  → ${webUrl}/login`);
  console.log("   Email:    sysadmin@vsme.local");
  console.log(`   Password: ${INITIAL_ADMIN_PASSWORD}`);
  console.log("   Redirect: /doi-mat-khau (buộc đổi mật khẩu) → /sysadmin");
  console.log("");
  console.log(`   [Company Admin] → ${webUrl}/login`);
  console.log("   Email:    admin@vsme.local");
  console.log(`   Password: ${INITIAL_ADMIN_PASSWORD}`);
  console.log("   Redirect: /doi-mat-khau (buộc đổi mật khẩu) → /admin");
  console.log("");
  console.log("   [Company User]  (slug: demo)");
  console.log("   (tạo user mới và đăng nhập bằng tài khoản công ty)");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
