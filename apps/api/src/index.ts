// src/index.ts
// Entry point — khởi động Express server

import { createApp } from "./app.js";

const PORT = parseInt(process.env["API_PORT"] ?? "4000");
const HOST = process.env["API_HOST"] ?? "0.0.0.0";

const app = createApp();

// License notice (honor system, WinRAR-style) — informational only, never blocks.
// Free for organizations with ≤ 4 Real Users (AI agents are NOT counted).
// See LICENSE / LICENSING.md. Commercial license: vuna.aid@gmail.com
function printLicenseNotice() {
  console.log("──────────────────────────────────────────────────────────────");
  console.log(" vSME — Source-available (vSME-SAL). NOT open source.");
  console.log(" Miễn phí cho tổ chức ≤ 4 người dùng thật (agent AI không tính).");
  console.log(" Free for organizations with ≤ 4 Real Users (AI agents excluded).");
  console.log(" Vượt ngưỡng / Beyond the limit → vuna.aid@gmail.com");
  console.log("──────────────────────────────────────────────────────────────");
}

const server = app.listen(PORT, HOST, () => {
  printLicenseNotice();
  console.log(`[vSME API] ▲ Running on http://${HOST}:${PORT}`);
  console.log(`[vSME API] Environment: ${process.env["NODE_ENV"] ?? "development"}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[vSME API] SIGTERM received — shutting down");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("[vSME API] SIGINT received — shutting down");
  server.close(() => process.exit(0));
});

export default app;
