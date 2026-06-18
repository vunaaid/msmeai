# vSME — Makefile
# Shortcuts cho các lệnh phát triển phổ biến

PNPM := $(HOME)/.local/share/pnpm/bin/pnpm
DOCKER_COMPOSE := docker compose -f docker/docker-compose.yml

.PHONY: help install dev build infra-up infra-down db-migrate db-seed db-studio clean

help: ## Hiển thị help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Cài đặt dependencies
	$(PNPM) install

dev: ## Chạy app dev (cần infra đang chạy)
	$(PNPM) dev

build: ## Build tất cả packages
	$(PNPM) build

# ─── Infrastructure ──────────────────────────────────────────────────────────

infra-up: ## Khởi động PostgreSQL + Redis + MinIO
	$(DOCKER_COMPOSE) up -d
	@echo "✅ Infrastructure running:"
	@echo "   PostgreSQL: localhost:5432"
	@echo "   Redis:      localhost:6379"
	@echo "   MinIO:      localhost:9000 (Console: localhost:9001)"
	@echo "   MailHog:    localhost:8025"

infra-down: ## Dừng infrastructure
	$(DOCKER_COMPOSE) down

infra-logs: ## Xem logs infrastructure
	$(DOCKER_COMPOSE) logs -f

infra-reset: ## Reset infrastructure (xóa data)
	$(DOCKER_COMPOSE) down -v

# ─── Database ────────────────────────────────────────────────────────────────

db-migrate: ## Chạy Prisma migrations
	$(PNPM) db:migrate

db-generate: ## Generate Prisma client
	$(PNPM) db:generate

db-seed: ## Seed database (super admin + default data)
	$(PNPM) db:seed

db-studio: ## Mở Prisma Studio
	$(PNPM) db:studio

db-reset: ## Reset database + seed lại
	cd packages/db && $(PNPM) db:reset && $(PNPM) db:seed

# ─── Setup ───────────────────────────────────────────────────────────────────

setup: install infra-up ## Setup lần đầu (install + infra)
	@echo "⏳ Waiting for PostgreSQL..."
	@sleep 5
	@$(MAKE) db-migrate
	@$(MAKE) db-seed
	@echo ""
	@echo "🎉 Setup hoàn tất!"
	@echo "   Chạy 'make dev' để bắt đầu"
	@echo ""
	@echo "📌 Login:"
	@echo "   URL:      http://localhost:3000/login"
	@echo "   Email:    admin@vsme.local"
	@echo "   Password: Admin@vSME2026!"

clean: ## Xóa node_modules và build artifacts
	find . -name "node_modules" -type d -prune -exec rm -rf {} +
	find . -name ".next" -type d -prune -exec rm -rf {} +
	find . -name "dist" -type d -prune -exec rm -rf {} +
	find . -name ".turbo" -type d -prune -exec rm -rf {} +
