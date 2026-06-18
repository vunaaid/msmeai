# Deployment Guide — VietKeto (Hybrid Architecture)

> Mô hình: App trên Cloud + Database on-premise  
> Kết nối: WireGuard VPN Tunnel

---

## 1. Tổng Quan Kiến Trúc Triển Khai

```
Internet
    │
    ▼
┌───────────────────────────────────────┐
│         CLOUD SERVER (VPS)            │
│  Provider: Vultr / DigitalOcean / AWS │
│  OS: Ubuntu 22.04 LTS                │
│  RAM: 4GB+  CPU: 2 cores+            │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │   Docker Compose (Cloud)        │  │
│  │                                 │  │
│  │   nginx:443/80 ──→ nextjs:3000  │  │
│  │   redis:6379                    │  │
│  │   minio:9000 (backup storage)   │  │
│  └─────────────────────────────────┘  │
│                  │                    │
│         WireGuard VPN (port 51820)    │
└──────────────────┼────────────────────┘
                   │ Encrypted tunnel
                   │ 10.0.0.1 ↔ 10.0.0.2
┌──────────────────▼────────────────────┐
│       ON-PREMISE SERVER (Văn Phòng)   │
│  Hardware: PC/Server + UPS            │
│  OS: Ubuntu 22.04 LTS                │
│  RAM: 8GB+  Storage: 500GB SSD+      │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │   Docker Compose (On-Premise)   │  │
│  │                                 │  │
│  │   postgresql:5432               │  │
│  │   minio:9000 (primary storage)  │  │
│  └─────────────────────────────────┘  │
└───────────────────────────────────────┘
```

---

## 2. Yêu Cầu Hạ Tầng

### 2.1 Cloud Server
| Thông số | Tối thiểu | Khuyến nghị |
|----------|-----------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Storage | 50 GB SSD | 100 GB SSD |
| Bandwidth | 1 TB/tháng | Unlimited |
| OS | Ubuntu 22.04 | Ubuntu 22.04 |
| Provider | Bất kỳ | Vultr/DO (Singapore) |

**Chi phí ước tính:** ~$20–40 USD/tháng

### 2.2 On-Premise Server
| Thông số | Tối thiểu | Khuyến nghị |
|----------|-----------|-------------|
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Storage | 500 GB SSD | 1 TB SSD RAID1 |
| OS | Ubuntu 22.04 | Ubuntu 22.04 |
| Network | 100 Mbps | 1 Gbps |
| UPS | Bắt buộc | Bắt buộc |

**Hardware gợi ý:** Synology NAS hoặc PC Server cũ (Dell PowerEdge, HP ProLiant)

---

## 3. Cấu Hình Docker Compose

### 3.1 `docker/docker-compose.yml` (Local Development)
```yaml
version: '3.9'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: vietketo_dev
      POSTGRES_USER: vietketo
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vietketo"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

### 3.2 `docker/docker-compose.prod-cloud.yml` (Cloud Server)
```yaml
version: '3.9'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - certbot_data:/var/www/certbot
    depends_on:
      - nextjs
    restart: unless-stopped

  nextjs:
    image: vietketo/web:latest
    environment:
      DATABASE_URL: postgresql://vietketo:${DB_PASSWORD}@10.0.0.2:5432/vietketo_prod
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      NEXTAUTH_URL: https://app.vietketo.vn
      MINIO_ENDPOINT: 10.0.0.2
      MINIO_PORT: 9000
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    restart: unless-stopped

  certbot:
    image: certbot/certbot
    volumes:
      - certbot_data:/var/www/certbot
      - ./nginx/ssl:/etc/letsencrypt

volumes:
  redis_data:
  certbot_data:
```

### 3.3 `docker/docker-compose.prod-onprem.yml` (On-Premise Server)
```yaml
version: '3.9'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: vietketo_prod
      POSTGRES_USER: vietketo
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "10.0.0.2:5432:5432"  # Chỉ bind VPN interface
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    shm_size: '256mb'

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}
    ports:
      - "10.0.0.2:9000:9000"  # Chỉ bind VPN interface
      - "10.0.0.2:9001:9001"
    volumes:
      - minio_data:/data
    restart: unless-stopped

  backup:
    image: prodrigestivill/postgres-backup-local
    environment:
      POSTGRES_HOST: postgres
      POSTGRES_DB: vietketo_prod
      POSTGRES_USER: vietketo
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      SCHEDULE: "@daily"
      BACKUP_KEEP_DAYS: 30
      BACKUP_KEEP_WEEKS: 8
      BACKUP_KEEP_MONTHS: 12
    volumes:
      - ./backups:/backups
    depends_on:
      - postgres

volumes:
  postgres_data:
  minio_data:
```

---

## 4. Cấu Hình Nginx

### `docker/nginx/nginx.conf`
```nginx
upstream nextjs {
    server nextjs:3000;
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name app.vietketo.vn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.vietketo.vn;

    ssl_certificate /etc/nginx/ssl/live/app.vietketo.vn/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/live/app.vietketo.vn/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000" always;

    # Max upload size (cho import sao kê)
    client_max_body_size 50M;

    location / {
        proxy_pass http://nextjs;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # Static files cache
    location /_next/static/ {
        proxy_pass http://nextjs;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## 5. Thiết Lập WireGuard VPN

### 5.1 Cài đặt trên Cloud Server
```bash
# Cài WireGuard
apt install wireguard

# Tạo key pair
wg genkey | tee /etc/wireguard/private.key | wg pubkey > /etc/wireguard/public.key

# /etc/wireguard/wg0.conf (Cloud Server)
[Interface]
PrivateKey = <CLOUD_PRIVATE_KEY>
Address = 10.0.0.1/24
ListenPort = 51820

[Peer]
PublicKey = <ONPREM_PUBLIC_KEY>
AllowedIPs = 10.0.0.2/32
```

### 5.2 Cài đặt trên On-Premise Server
```bash
# /etc/wireguard/wg0.conf (On-Premise Server)
[Interface]
PrivateKey = <ONPREM_PRIVATE_KEY>
Address = 10.0.0.2/24

[Peer]
PublicKey = <CLOUD_PUBLIC_KEY>
Endpoint = <CLOUD_PUBLIC_IP>:51820
AllowedIPs = 10.0.0.1/32
PersistentKeepalive = 25
```

```bash
# Bật WireGuard tự động
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

# Kiểm tra kết nối
ping 10.0.0.1  # Từ on-premise → cloud
ping 10.0.0.2  # Từ cloud → on-premise
```

---

## 6. Environment Variables

### `.env.example`
```bash
# ============================================
# DATABASE (On-Premise PostgreSQL qua VPN)
# ============================================
DATABASE_URL="postgresql://vietketo:PASSWORD@10.0.0.2:5432/vietketo_prod"

# ============================================
# REDIS (Cloud)
# ============================================
REDIS_URL="redis://:PASSWORD@redis:6379"

# ============================================
# NEXTAUTH
# ============================================
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="https://app.vietketo.vn"

# ============================================
# MINIO (On-Premise qua VPN)
# ============================================
MINIO_ENDPOINT="10.0.0.2"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="vietketo-access"
MINIO_SECRET_KEY="vietketo-secret"
MINIO_BUCKET_INVOICES="invoices"
MINIO_BUCKET_REPORTS="reports"
MINIO_BUCKET_CERTS="certificates"

# ============================================
# EMAIL (SMTP)
# ============================================
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="noreply@company.vn"
SMTP_PASS="app-password"
SMTP_FROM="VietKeto <noreply@company.vn>"

# ============================================
# TCT ETAX (Để sau - Phase 6)
# ============================================
# TCT_API_URL="https://hoadondientu.gdt.gov.vn"
# TCT_CERT_PATH="/certs/company.p12"
# TCT_CERT_PASSWORD="cert-password"

# ============================================
# APP
# ============================================
NODE_ENV="production"
APP_URL="https://app.vietketo.vn"
LOG_LEVEL="info"
```

---

## 7. CI/CD Pipeline (GitHub Actions)

### `.github/workflows/deploy.yml`
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Build Docker image
        run: |
          docker build -t vietketo/web:${{ github.sha }} .
          docker tag vietketo/web:${{ github.sha }} vietketo/web:latest

      - name: Push to Registry
        run: |
          echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USER }} --password-stdin
          docker push vietketo/web:latest

      - name: Deploy to Cloud Server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.CLOUD_HOST }}
          username: ubuntu
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /opt/vietketo
            docker compose -f docker-compose.prod-cloud.yml pull
            docker compose -f docker-compose.prod-cloud.yml up -d
            docker image prune -f

      - name: Run DB Migrations
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.CLOUD_HOST }}
          username: ubuntu
          key: ${{ secrets.SSH_KEY }}
          script: |
            docker exec vietketo-nextjs npx prisma migrate deploy
```

---

## 8. Backup Strategy

### Database Backup
```
Hàng ngày:    pg_dump → Nén → Lưu on-premise (/backups/daily/)
Hàng tuần:    Copy lên MinIO cloud (offsite backup)
Hàng tháng:   Archive và lưu 1 năm
```

### Kiểm Tra Backup
```bash
# Script kiểm tra backup hàng ngày
# Restore vào DB test, chạy basic queries
#!/bin/bash
LATEST_BACKUP=$(ls -t /backups/daily/*.sql.gz | head -1)
pg_restore -d vietketo_test $LATEST_BACKUP
psql -d vietketo_test -c "SELECT COUNT(*) FROM journal_entries;"
echo "Backup verified: $LATEST_BACKUP"
```

---

## 9. Monitoring

### Prometheus + Grafana
```yaml
# Metrics được thu thập:
- Next.js: Response time, Error rate, Request count
- PostgreSQL: Query time, Connection pool, DB size
- Redis: Memory usage, Hit rate
- System: CPU, RAM, Disk I/O

# Alerts:
- DB connection failed → Alert ngay lập tức
- Disk > 80% → Alert cảnh báo
- Response time > 3s → Alert cảnh báo
- Error rate > 1% → Alert cảnh báo
```

---

## 10. Checklist Triển Khai

### Trước Khi Go-Live
- [ ] SSL certificate cài đặt (Let's Encrypt)
- [ ] WireGuard VPN kết nối ổn định
- [ ] Database migration chạy thành công
- [ ] Seed dữ liệu tài khoản TT200
- [ ] Tạo tài khoản Admin đầu tiên
- [ ] Test đăng nhập và phân quyền
- [ ] Test tạo bút toán GL
- [ ] Test tạo hóa đơn
- [ ] Backup tự động hoạt động
- [ ] Monitoring alerts hoạt động
- [ ] Domain DNS trỏ đúng

### Sau Go-Live
- [ ] Import dữ liệu danh mục (KH, NCC, SP)
- [ ] Import số dư đầu kỳ (opening balances)
- [ ] Nhập hóa đơn tồn đọng (nếu có)
- [ ] Training kế toán sử dụng hệ thống
- [ ] Kết nối TCT eTax (Phase 6)
