# vSME — Hướng dẫn cho Claude Code

Nền tảng quản lý công ty SME tích hợp AI. Monorepo (pnpm + turbo):
- `apps/web` — Next.js 15 (port 3000), proxy `/api/*` → Express API.
- `apps/api` — Express API chạy qua `tsx` (port 4000, không build).
- `packages/db` — Prisma schema + client (`@vsme/db`). DB: Postgres `vsme_dev` @ localhost:5432.
- `packages/ai-sdk` — agents/skills SDK.
- Chạy production qua PM2: `pm2 start ecosystem.config.js` (web + api). `.env` ở root.
- Reverse proxy: cấu hình nginx trỏ về web (3000) / api (4000) — đặt host/IP trong môi trường riêng của bạn (không hardcode trong repo).

## ⚠️ LUÔN kiểm tra DB schema TRƯỚC khi build & deploy

Lỗi 500 phổ biến nhất (`Prisma P2021: The table ... does not exist`) xảy ra khi
`packages/db/prisma/schema.prisma` được sửa nhưng DB chưa được đồng bộ. Các bảng
như `work_items`, `company_agents`, `projects`, `documents` bị thiếu → endpoint trả 500.

**Trước mọi lần build/deploy, BẮT BUỘC chạy:**

```bash
pnpm db:check          # báo lỗi (exit 2) nếu DB lệch schema
```

Nếu lệch, tạo migration mới rồi build lại:

```bash
pnpm db:migrate        # prisma migrate dev — tạo migration từ thay đổi schema
# hoặc khi deploy lên môi trường đã có DB:
pnpm --filter @vsme/db db:migrate:deploy
```

Hoặc dùng lệnh deploy gộp (đã chứa check):

```bash
pnpm deploy            # db:check → type-check → build → pm2 restart
```

> Migrations đã được rebaseline (2026-05-29): toàn bộ schema gộp trong
> `packages/db/prisma/migrations/0_init`. `migrate deploy`/`migrate dev` hoạt động
> bình thường trở lại (đã test trên DB sạch: khớp 100% với `schema.prisma`).
> Từ giờ, mỗi lần sửa `schema.prisma` hãy chạy `pnpm db:migrate` để tạo migration
> mới — KHÔNG dùng `db push` trên môi trường thật nữa (push không tạo lịch sử migration).
> DB local là nguồn dữ liệu chính thức — không reset.

## Sau khi deploy: xác minh

```bash
pm2 logs --nostream --lines 30        # không được có "prisma:error" / P2021
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/work   # 401 (auth) là OK, 500 là lỗi
```
