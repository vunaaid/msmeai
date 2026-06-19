// PM2 process config for vSME — web (Next.js) + api (Express via tsx)
// Start:  pm2 start ecosystem.config.js
// ROOT mặc định là thư mục chứa file này; có thể override bằng env VSME_ROOT.
const ROOT = process.env.VSME_ROOT || __dirname;
const ENV_FILE = `${ROOT}/secrets/.env`;
const HOME = process.env.HOME;
const MINIO_BIN = `${HOME}/.local/bin/minio`;
const MINIO_DATA = `${ROOT}/data/minio`;

module.exports = {
  apps: [
    {
      // Object storage (MinIO) — binary cài tại ~/.local/bin/minio.
      // Khởi động trước api/web để upload tài liệu hoạt động.
      name: "vsme-minio",
      script: MINIO_BIN,
      args: `server ${MINIO_DATA} --address :9000 --console-address :9001`,
      interpreter: "none",
      instances: 1,
      exec_mode: "fork",
      env: {
        // Lấy từ .env / môi trường — KHÔNG hardcode secret trong repo.
        MINIO_ROOT_USER: process.env.MINIO_ACCESS_KEY,
        MINIO_ROOT_PASSWORD: process.env.MINIO_SECRET_KEY,
      },
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      min_uptime: "5s",
      time: true,
    },
    {
      name: "vsme-web",
      cwd: `${ROOT}/apps/web`,
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3000",
      interpreter: "node",
      // Inject root .env at runtime (Node 20+ built-in). NODE_ENV forced to
      // production below — next start requires it and --env-file won't override
      // an env var already set by PM2.
      interpreter_args: `--env-file=${ENV_FILE}`,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: "1G",
      min_uptime: "5s",
      time: true,
    },
    {
      name: "vsme-api",
      cwd: `${ROOT}/apps/api`,
      // Run TypeScript directly via tsx loader (no build step — see start.sh).
      script: "src/index.ts",
      interpreter: "node",
      interpreter_args: `--env-file=${ENV_FILE} --import tsx`,
      instances: 1,
      exec_mode: "fork",
      env: {
        API_PORT: "4000",
      },
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: "512M",
      min_uptime: "5s",
      time: true,
    },
    {
      // Agent Worker — scan hàng đợi WorkItem (Postgres), load skill nhân viên & thực thi.
      // Tăng instances để chạy nhiều worker (claim atomic chống trùng).
      name: "vsme-worker",
      cwd: `${ROOT}/apps/api`,
      script: "src/worker.ts",
      interpreter: "node",
      interpreter_args: `--env-file=${ENV_FILE} --import tsx`,
      instances: 1,
      exec_mode: "fork",
      env: {
        AGENT_WORKER_POLL_MS: "4000",
        AGENT_WORKER_CONCURRENCY: "3",
      },
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: "512M",
      min_uptime: "5s",
      time: true,
    },
  ],
};
