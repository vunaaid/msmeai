#!/bin/bash
# Start script for PM2 — dùng tsx để chạy TypeScript trực tiếp (không cần build)
export NODE_ENV=production
cd /home/novel/vSME/apps/api
exec node_modules/.bin/tsx src/index.ts
