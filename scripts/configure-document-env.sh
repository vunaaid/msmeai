#!/usr/bin/env bash
# configure-document-env.sh — Cập nhật các biến môi trường của module Tài Liệu
# (OnlyOffice + MinIO) theo từng domain/host khi deploy.
#
# Vì sao cần: presigned URL của MinIO ký theo HOST nào thì OnlyOffice phải truy cập
# đúng host đó; còn OnlyOffice gọi callback ngược về API qua một URL khác. Mỗi môi
# trường (dev Docker, staging, prod sau nginx) các URL/host này khác nhau, nên cần
# một chỗ duy nhất để set lại — thay vì sửa tay .env dễ sai.
#
# Các biến được quản lý:
#   ONLYOFFICE_URL              — URL trình duyệt nạp editor (DocsAPI)
#   NEXT_PUBLIC_ONLYOFFICE_URL  — (= ONLYOFFICE_URL, cho client Next.js)
#   ONLYOFFICE_CALLBACK_BASE    — URL API mà OnlyOffice container gọi callback (server→server)
#   MINIO_PUBLIC_ENDPOINT       — host MinIO mà OnlyOffice dùng để TẢI file (presign theo host này)
#   MINIO_PUBLIC_PORT           — port tương ứng (mặc định 9000)
#
# Usage:
#   # Dev (app chạy host, OnlyOffice + MinIO trong Docker) — preset mặc định:
#   bash scripts/configure-document-env.sh --profile docker-dev
#
#   # Prod sau reverse proxy (mỗi service một subdomain):
#   bash scripts/configure-document-env.sh \
#     --onlyoffice-url   https://docs.example.com \
#     --callback-base    https://api.example.com \
#     --minio-endpoint   files.example.com --minio-port 443
#
#   # Chỉ định file .env khác:
#   bash scripts/configure-document-env.sh --profile docker-dev --env-file /path/.env
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"

ONLYOFFICE_URL=""
CALLBACK_BASE=""
MINIO_ENDPOINT=""
MINIO_PORT=""
PUBLIC_ONLYOFFICE_URL=""
PROFILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)         ENV_FILE="$2"; shift 2;;
    --onlyoffice-url)   ONLYOFFICE_URL="$2"; shift 2;;
    --public-url)       PUBLIC_ONLYOFFICE_URL="$2"; shift 2;;
    --callback-base)    CALLBACK_BASE="$2"; shift 2;;
    --minio-endpoint)   MINIO_ENDPOINT="$2"; shift 2;;
    --minio-port)       MINIO_PORT="$2"; shift 2;;
    --profile)          PROFILE="$2"; shift 2;;
    -h|--help)          grep -E '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) echo "❌ Tham số không hợp lệ: $1"; exit 1;;
  esac
done

# ─── Preset ───────────────────────────────────────────────────────────────────
if [[ "$PROFILE" == "docker-dev" ]]; then
  : "${ONLYOFFICE_URL:=http://localhost:8082}"
  : "${CALLBACK_BASE:=http://host.docker.internal:4000}"
  : "${MINIO_ENDPOINT:=host.docker.internal}"
  : "${MINIO_PORT:=9000}"
elif [[ -n "$PROFILE" ]]; then
  echo "❌ Profile không hỗ trợ: $PROFILE (chỉ có 'docker-dev')"; exit 1
fi

# NEXT_PUBLIC mặc định bằng ONLYOFFICE_URL nếu không chỉ định riêng.
[[ -z "$PUBLIC_ONLYOFFICE_URL" && -n "$ONLYOFFICE_URL" ]] && PUBLIC_ONLYOFFICE_URL="$ONLYOFFICE_URL"
[[ -z "$MINIO_PORT" ]] && MINIO_PORT="9000"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Không tìm thấy .env: $ENV_FILE"; exit 1
fi

# ─── Helper: set hoặc thay thế KEY=VALUE trong .env (idempotent) ───────────────
set_kv() {
  local key="$1" val="$2"
  [[ -z "$val" ]] && return 0
  if grep -qE "^${key}=" "$ENV_FILE"; then
    # Thay giá trị, escape ký tự đặc biệt cho sed.
    local esc; esc="$(printf '%s' "$val" | sed -e 's/[\/&|]/\\&/g')"
    sed -i -E "s|^${key}=.*|${key}=${esc}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
  echo "  ✓ ${key}=${val}"
}

echo "📝 Cập nhật env tài liệu trong: $ENV_FILE"
set_kv "ONLYOFFICE_URL"             "$ONLYOFFICE_URL"
set_kv "NEXT_PUBLIC_ONLYOFFICE_URL" "$PUBLIC_ONLYOFFICE_URL"
set_kv "ONLYOFFICE_CALLBACK_BASE"   "$CALLBACK_BASE"
set_kv "MINIO_PUBLIC_ENDPOINT"      "$MINIO_ENDPOINT"
set_kv "MINIO_PUBLIC_PORT"          "$MINIO_PORT"

echo "✅ Xong. Khởi động lại api + web (PM2/dev) để nạp lại .env."
echo "   Lưu ý: NEXT_PUBLIC_* được Next inline lúc build → cần build lại web nếu dùng biến này ở client."
