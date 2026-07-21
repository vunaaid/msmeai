# vSME — Hướng dẫn cho Claude Code

Nền tảng quản lý công ty SME tích hợp AI. Monorepo (pnpm + turbo):
- `apps/web` — Next.js 15, proxy `/api/*` → Express API. `/api/auth/*` do NextAuth giữ,
  KHÔNG đi qua proxy — endpoint cần gọi từ browser phải nằm ngoài `/api/auth/*`
  (vd `/api/account/*`).
- `apps/api` — Express API chạy qua `tsx` (không build).
- `packages/db` — Prisma schema + client (`@vsme/db`). DB: Postgres `sme_tavia` @ localhost:5432
  (tên DB lấy từ `DATABASE_URL` trong `.env`). DB cũ `vsme_dev` vẫn còn trên máy nhưng
  không còn được dùng — giữ lại để tra cứu dữ liệu cũ.
- `packages/ai-sdk` — agents/skills SDK.
- Chạy production qua PM2: `pm2 start ecosystem.config.js` (web + api). `.env` ở root.
- Reverse proxy: cấu hình nginx trỏ về web / api — đặt host/IP trong môi trường riêng của bạn (không hardcode trong repo).

> ⚠️ **Cổng lấy từ `.env`, không phải mặc định 3000/4000.** Máy này đang chạy
> `WEB_PORT=6006`, `API_PORT=6001`. Trên máy đó cổng 3000/4000 thuộc **project khác**
> (`novelofme-*`) — gọi nhầm sẽ nhận `Cannot POST /api/...` và tưởng là lỗi vSME.
> Luôn đọc `WEB_PORT`/`API_PORT` trong `.env` trước khi curl.

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
# 1. Sinh SQL từ chênh lệch DB → schema (KHÔNG đụng vào DB)
cd packages/db
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_ten_thay_doi
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel   prisma/schema.prisma \
  --script > prisma/migrations/<thư_mục_vừa_tạo>/migration.sql

# 2. Đọc lại SQL, đảm bảo không có DROP ngoài ý muốn, rồi apply nguyên khối
psql "$DATABASE_URL_KHONG_CO_QUERY_STRING" -v ON_ERROR_STOP=1 --single-transaction \
  -f prisma/migrations/<thư_mục_vừa_tạo>/migration.sql

# 3. Ghi vào lịch sử migration + sinh lại client
npx prisma migrate resolve --applied <tên_thư_mục>
npx prisma generate
```

Trên môi trường đã có sẵn migrations thì `migrate deploy` dùng bình thường:

```bash
pnpm --filter @vsme/db db:migrate:deploy
```

Hoặc dùng lệnh deploy gộp (đã chứa check):

```bash
pnpm deploy            # db:check → type-check → build → pm2 restart
```

> ⛔ **KHÔNG chạy `prisma migrate dev` / `migrate reset` trên DB này.** DB local là
> bản clone có drift; `migrate dev` phát hiện drift là RESET SẠCH dữ liệu (đã xảy ra
> ngày 2026-05-29). Vì vậy `pnpm db:migrate` và `pnpm db:reset` đã bị chặn có chủ đích
> trong `packages/db/package.json` — đừng gỡ chặn, hãy dùng quy trình `migrate diff`
> 3 bước ở trên. DB local là nguồn dữ liệu chính thức — không reset.
>
> Lịch sử: baseline hiện tại là
> `packages/db/prisma/migrations/20260720090000_baseline_full_schema` (2026-07-20),
> tạo ra khi DB thiếu 43/69 bảng khiến login trả 500. Thư mục
> `prisma/migrations.DISABLED_20260529/` là tàn dư của lần rebaseline hỏng năm 2026-05-29
> (chỉ còn `migration_lock.toml`, không có migration nào) — giữ lại để tham khảo, không dùng.

## Cài đặt lần đầu (máy mới / DB mới)

```bash
pnpm setup             # tạo DB → migrate deploy → seed → db:check
```

Script `scripts/setup-fresh.sh` tự phát hiện DB đang có dữ liệu thật; khi đó nó
`pg_dump` và **xác minh bản backup khôi phục được** rồi mới xoá tạo lại — backup lỗi
là dừng, không xoá gì. Tài khoản seed (`sysadmin@vsme.local`, `admin@vsme.local`) dùng
mật khẩu `Abc@123` (đổi bằng biến `INITIAL_ADMIN_PASSWORD`) và có
`mustChangePassword=true` → đăng nhập xong bị ép sang `/doi-mat-khau` trước khi dùng
được hệ thống.

## Sau khi deploy: xác minh

```bash
pm2 logs vsme-api --nostream --lines 30   # không được có "prisma:error" / P2021
# Dùng API_PORT trong .env (hiện là 6001), KHÔNG phải 4000:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:6001/api/work   # 401 (auth) là OK, 500 là lỗi
```
