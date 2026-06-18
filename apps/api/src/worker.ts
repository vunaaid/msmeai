// src/worker.ts
// vSME Agent Worker — process riêng (pm2): scan hàng đợi WorkItem (Postgres),
// load skill nhân viên & thực thi tự động. Chạy: tsx src/worker.ts
// Có thể chạy 1 hoặc nhiều instance — claim atomic chống trùng.

import { runQueueOnce } from "./lib/agent-exec.js";

const POLL_MS = Number(process.env["AGENT_WORKER_POLL_MS"] ?? 4000);
const CONCURRENCY = Number(process.env["AGENT_WORKER_CONCURRENCY"] ?? 3);

console.log(`🤖 vSME agent worker khởi động (poll ${POLL_MS}ms, concurrency ${CONCURRENCY})`);

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

async function loop(): Promise<void> {
  while (!stopping) {
    try {
      const n = await runQueueOnce(CONCURRENCY);
      if (n > 0) console.log(`[worker] đã xử lý ${n} job`);
    } catch (e) {
      console.error("[worker] lỗi vòng lặp:", e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  console.log("[worker] dừng.");
  process.exit(0);
}

void loop();
