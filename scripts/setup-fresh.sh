#!/usr/bin/env bash
# setup-fresh.sh — Cài đặt vSME từ đầu: tạo database, tạo bảng, seed dữ liệu,
# tạo tài khoản quản trị với trạng thái buộc đổi mật khẩu ở lần đăng nhập đầu.
#
# An toàn dữ liệu (DB này đã từng bị xoá sạch một lần vào 2026-05-29):
#   - Nếu DB chưa tồn tại       → tạo mới, tạo bảng, seed.
#   - Nếu DB đã có dữ liệu thật → BẮT BUỘC backup trước; chỉ tạo lại khi bản
#     backup đã được xác minh khôi phục được. Backup lỗi = dừng, không xoá gì.
#
# Usage:
#   bash scripts/setup-fresh.sh            # cài mới; nếu có dữ liệu thật thì hỏi
#   bash scripts/setup-fresh.sh --force    # không hỏi (vẫn backup + xác minh trước)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_DIR="$ROOT/packages/db"
SCHEMA="$DB_DIR/prisma/schema.prisma"
BACKUP_DIR="$ROOT/data/backups"
FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

# ─── Nạp .env ────────────────────────────────────────────────────────────────
# Nạp TOÀN BỘ .env chứ không riêng DATABASE_URL: bước seed còn cần MINIO_* để
# upload template tài liệu (thiếu thì nó lặng lẽ bỏ qua phần template), và
# WEB_PORT để in đúng URL đăng nhập.
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL không có (đã tìm trong $ROOT/.env)"; exit 1
fi

# psql không hiểu ?schema=public của Prisma → cắt query string.
PG_URL="${DATABASE_URL%%\?*}"
DB_NAME="$(basename "$PG_URL" | sed 's/?.*//')"
# URL tới database 'postgres' để tạo/xoá DB đích.
ADMIN_URL="$(dirname "$PG_URL")/postgres"

echo "🚀 Cài đặt vSME"
echo "   Database: $DB_NAME"

# ─── 1. DB đã tồn tại chưa? ──────────────────────────────────────────────────
DB_EXISTS=$(psql "$ADMIN_URL" -At -c \
  "select 1 from pg_database where datname = '$DB_NAME';" 2>/dev/null || echo "")

RECREATE=0

if [[ -n "$DB_EXISTS" ]]; then
  echo "   → Database đã tồn tại, kiểm tra dữ liệu..."

  # Đếm dữ liệu thật. Bảng chưa có (cài dở) → coi như rỗng.
  USER_COUNT=$(psql "$PG_URL" -At -c "select count(*) from users;" 2>/dev/null || echo "0")
  COMPANY_COUNT=$(psql "$PG_URL" -At -c "select count(*) from companies;" 2>/dev/null || echo "0")
  echo "   → Hiện có: $USER_COUNT tài khoản, $COMPANY_COUNT công ty"

  if [[ "$USER_COUNT" -gt 0 || "$COMPANY_COUNT" -gt 0 ]]; then
    echo ""
    echo "⚠️  DATABASE ĐANG CÓ DỮ LIỆU THẬT."
    echo "   Cài đặt lại sẽ XOÁ toàn bộ. Script sẽ backup và xác minh trước."

    if [[ "$FORCE" -ne 1 ]]; then
      read -r -p "   Gõ đúng chữ 'XOA' để tiếp tục, Enter để huỷ: " confirm
      if [[ "$confirm" != "XOA" ]]; then
        echo "✋ Đã huỷ. Không có gì bị thay đổi."; exit 0
      fi
    fi

    # ─── Backup ──────────────────────────────────────────────────────────────
    mkdir -p "$BACKUP_DIR"
    STAMP="$(date +%Y%m%d_%H%M%S)"
    BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_pre_setup_${STAMP}.dump"
    echo ""
    echo "   → Backup: $BACKUP_FILE"
    if ! pg_dump "$PG_URL" -Fc -f "$BACKUP_FILE"; then
      echo "❌ pg_dump THẤT BẠI. Dừng lại — không xoá gì cả."; exit 1
    fi

    # ─── Xác minh backup khôi phục được ──────────────────────────────────────
    # pg_dump trả 0 vẫn có thể ra file hỏng/cụt. Chỉ tin khi pg_restore đọc được
    # danh mục VÀ thấy đủ bảng users + companies.
    echo "   → Xác minh backup..."
    if [[ ! -s "$BACKUP_FILE" ]]; then
      echo "❌ File backup rỗng. Dừng lại — không xoá gì cả."; exit 1
    fi
    if ! pg_restore --list "$BACKUP_FILE" >/tmp/vsme_backup_toc.txt 2>/dev/null; then
      echo "❌ Backup hỏng (pg_restore không đọc được). Dừng lại — không xoá gì cả."; exit 1
    fi
    for t in users companies; do
      if ! grep -qE "TABLE DATA public $t " /tmp/vsme_backup_toc.txt; then
        echo "❌ Backup thiếu dữ liệu bảng '$t'. Dừng lại — không xoá gì cả."; exit 1
      fi
    done
    BACKUP_SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
    echo "   ✓ Backup hợp lệ ($BACKUP_SIZE) — khôi phục bằng:"
    echo "     pg_restore -d \"$PG_URL\" --clean --if-exists \"$BACKUP_FILE\""
    RECREATE=1
  else
    echo "   → Database rỗng, dùng lại luôn."
  fi
fi

# ─── 2. Tạo lại / tạo mới database ───────────────────────────────────────────
if [[ "$RECREATE" -eq 1 ]]; then
  echo "   → Xoá và tạo lại database..."
  psql "$ADMIN_URL" -q -c \
    "select pg_terminate_backend(pid) from pg_stat_activity where datname='$DB_NAME' and pid <> pg_backend_pid();" >/dev/null
  psql "$ADMIN_URL" -q -c "drop database \"$DB_NAME\";"
  psql "$ADMIN_URL" -q -c "create database \"$DB_NAME\";"
elif [[ -z "$DB_EXISTS" ]]; then
  echo "   → Tạo database mới..."
  psql "$ADMIN_URL" -q -c "create database \"$DB_NAME\";"
fi

# ─── 3. Tạo bảng theo migrations ─────────────────────────────────────────────
echo "   → Tạo bảng (prisma migrate deploy)..."
cd "$DB_DIR"
npx prisma migrate deploy

echo "   → Sinh Prisma client..."
npx prisma generate >/dev/null

# ─── 4. Seed dữ liệu + tài khoản quản trị ────────────────────────────────────
echo "   → Seed dữ liệu..."
cd "$ROOT"
pnpm --filter @vsme/db db:seed

# ─── 5. Xác minh ─────────────────────────────────────────────────────────────
echo "   → Xác minh schema khớp với schema.prisma..."
bash "$ROOT/scripts/check-db.sh"

echo ""
echo "✅ Cài đặt xong."
echo ""
echo "   Tài khoản quản trị (buộc đổi mật khẩu ở lần đăng nhập đầu):"
psql "$PG_URL" -At -F' | ' -c \
  "select email, account_type, case when must_change_password then 'phải đổi mật khẩu' else 'đã đổi' end
   from users order by is_super_admin desc, created_at;" | sed 's/^/     /'
echo ""
echo "   Mật khẩu ban đầu: ${INITIAL_ADMIN_PASSWORD:-Abc@123}"
echo "   Đăng nhập xong hệ thống sẽ chuyển thẳng sang trang /doi-mat-khau."
