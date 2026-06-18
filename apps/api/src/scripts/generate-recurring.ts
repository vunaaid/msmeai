// src/scripts/generate-recurring.ts
// Sinh công việc định kỳ đến hạn cho TẤT CẢ công ty. Đặt chạy cron hằng ngày, vd:
//   node --env-file=/path/to/vSME/.env --import tsx apps/api/src/scripts/generate-recurring.ts

import { generateAllCompanies } from "../modules/work/recurring.service.js";

async function main() {
  const started = Date.now();
  const results = await generateAllCompanies();
  const total = results.reduce((s, r) => s + r.created, 0);
  console.log(
    `[recurring] Đã sinh ${total} công việc định kỳ cho ${results.length} công ty (${Date.now() - started}ms)`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[recurring] Lỗi:", err);
  process.exit(1);
});
