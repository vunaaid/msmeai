module.exports = {
  apps: [
    {
      name: "vsme-api",
      // Run node directly with tsx loader hooks — avoids tsx CLI wrapper exiting and confusing PM2
      script: "/usr/bin/node",
      args: [
        // Load .env file (Node 20+ built-in, no dotenv needed)
        "--env-file", "/home/novel/vSME/.env",
        "--require", "/home/novel/vSME/node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/preflight.cjs",
        "--import", "file:///home/novel/vSME/node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/loader.mjs",
        "/home/novel/vSME/apps/api/src/index.ts",
      ].join(" "),
      cwd: "/home/novel/vSME/apps/api",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        API_PORT: "4000",
      },
      error_file: "logs/pm2-error.log",
      out_file:   "logs/pm2-out.log",
      time: true,
    },
  ],
};
