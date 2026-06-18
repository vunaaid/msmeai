// PM2 — DEV mode cho vSME (HMR web + tsx watch api/worker), truy cập qua IP/sslip.io.
// Start:  pm2 start ecosystem.dev.config.js
// Infra (minio/mailpit) vẫn dùng từ ecosystem.config.js (prod) đang chạy.
const ROOT = process.env.VSME_ROOT || __dirname;
const ENV_FILE = `${ROOT}/.env`;

const common = {
  instances: 1,
  exec_mode: "fork",
  interpreter: "node",
  watch: false,
  max_restarts: 10,
  restart_delay: 3000,
  min_uptime: "5s",
  time: true,
};

module.exports = {
  apps: [
    {
      ...common,
      name: "vsme-web-dev",
      cwd: `${ROOT}/apps/web`,
      script: "node_modules/next/dist/bin/next",
      // -H 0.0.0.0 → lắng nghe mọi interface để vào được qua IP LAN.
      args: "dev --port 3000 -H 0.0.0.0",
      interpreter_args: `--env-file=${ENV_FILE}`,
      env: { NODE_ENV: "development" },
      max_memory_restart: "2G",
    },
    {
      ...common,
      name: "vsme-api-dev",
      cwd: `${ROOT}/apps/api`,
      // node --watch tự reload khi sửa .ts; --import tsx để chạy TS trực tiếp.
      script: "src/index.ts",
      interpreter_args: `--env-file=${ENV_FILE} --import tsx --watch`,
      env: { NODE_ENV: "development", API_PORT: "4000", API_HOST: "0.0.0.0" },
      max_memory_restart: "1G",
    },
    {
      ...common,
      name: "vsme-worker-dev",
      cwd: `${ROOT}/apps/api`,
      script: "src/worker.ts",
      interpreter_args: `--env-file=${ENV_FILE} --import tsx --watch`,
      env: { NODE_ENV: "development", AGENT_WORKER_POLL_MS: "4000", AGENT_WORKER_CONCURRENCY: "3" },
      max_memory_restart: "1G",
    },
  ],
};
