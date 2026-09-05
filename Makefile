AGENT_DIR := apps/livekit-agent
WEB_DIR   := apps/web
WORKER_DIR := apps/worker
WORKER_PACKAGE := @app/worker
DESKTOP_PACKAGE := @app/desktop
VENV      := $(AGENT_DIR)/.venv
PY        := uv run --project $(AGENT_DIR)
AGENT_SCRIPT := src/agent.py

.DEFAULT_GOAL := help

LIVEKIT_LOCAL_COMPOSE := docker compose --env-file infra/livekit-local/.env -f infra/livekit-local/compose.yml
QUEUE_LOCAL_COMPOSE := docker compose -f infra/queue-local/compose.yml

.PHONY: queue-local-up queue-local-down queue-local-status

queue-local-up: ## 启动独立的本地应用任务 Redis
	$(QUEUE_LOCAL_COMPOSE) up -d --wait

queue-local-down: ## 停止本地应用任务 Redis，保留队列数据
	$(QUEUE_LOCAL_COMPOSE) down

queue-local-status: ## 查看本地应用任务 Redis 状态
	$(QUEUE_LOCAL_COMPOSE) ps

.PHONY: livekit-local-up livekit-local-down livekit-local-status livekit-local-logs

livekit-local-up: ## 启动本地 LiveKit、双路录音服务和专用 Redis
	$(LIVEKIT_LOCAL_COMPOSE) up -d

livekit-local-down: ## 停止本地 LiveKit 基础设施，不删除业务数据
	$(LIVEKIT_LOCAL_COMPOSE) down

livekit-local-status: ## 查看本地 LiveKit 基础设施状态
	$(LIVEKIT_LOCAL_COMPOSE) ps

livekit-local-logs: ## 查看本地 LiveKit 和录音服务日志
	$(LIVEKIT_LOCAL_COMPOSE) logs --tail=100 -f livekit egress

.PHONY: help install web-install agent-install agent-download \
        dev web-dev web-dev-fresh worker-dev worker-start worker-typecheck \
        desktop-dev desktop-start desktop-typecheck desktop-build \
        desktop-build-mac desktop-build-win desktop-build-linux desktop-build-unpack \
        agent-dev agent-console agent-start agent-shell \
        agent-deploy agent-update-secrets agent-clean clean

help: ## 显示所有可用命令
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---------- install ----------

install: web-install agent-install agent-download ## 一键安装前后端依赖 + 下载模型

web-install: ## bun install (TanStack Start 前端)
	bun install
	bun run hooks

agent-install: ## 创建 venv 并安装 Python 依赖 (uv sync)
	cd $(AGENT_DIR) && uv sync

agent-download: ## 下载 Silero VAD + turn-detector 模型
	cd $(AGENT_DIR) && uv run $(AGENT_SCRIPT) download-files

# ---------- dev ----------

dev: ## 并行启动 TanStack Start + LiveKit agent worker + 简历解析 worker
	@$(MAKE) -j3 web-dev agent-dev worker-dev

web-dev: ## 使用已有依赖缓存启动 TanStack Start dev server
	bun run --filter @app/web dev

web-dev-fresh: ## 清理依赖缓存后启动 TanStack Start dev server
	bun run --filter @app/web dev:fresh

worker-dev: ## 仅启动简历异步解析 worker (dev 模式，热重载)
	cd $(WORKER_DIR) && bun run dev

worker-start: ## 启动简历异步解析 worker (生产模式，不热重载)
	cd $(WORKER_DIR) && bun run start

worker-typecheck: ## 检查简历异步解析 worker TypeScript 类型
	bun run --filter $(WORKER_PACKAGE) typecheck

# ---------- desktop (Electron) ----------

desktop-dev: ## 启动 Electron 桌面端 (electron-vite dev)
	bun run --filter $(DESKTOP_PACKAGE) dev

desktop-start: ## 预览已构建的 Electron 桌面端
	bun run --filter $(DESKTOP_PACKAGE) start

desktop-typecheck: ## 检查 Electron 桌面端 TypeScript 类型
	bun run --filter $(DESKTOP_PACKAGE) typecheck

desktop-build: ## 构建 Electron 主进程/渲染进程 (不打安装包)
	bun run --filter $(DESKTOP_PACKAGE) build

desktop-build-mac: ## 构建并打包 macOS 安装包 (dmg)
	bun run --filter $(DESKTOP_PACKAGE) build:mac

desktop-build-win: ## 构建并打包 Windows 安装包
	bun run --filter $(DESKTOP_PACKAGE) build:win

desktop-build-linux: ## 构建并打包 Linux 安装包
	bun run --filter $(DESKTOP_PACKAGE) build:linux

desktop-build-unpack: ## 构建未打包的应用目录 (调试用)
	bun run --filter $(DESKTOP_PACKAGE) build:unpack

agent-dev: ## 仅启动 LiveKit agent worker (dev 模式，热重载)
	cd $(AGENT_DIR) && uv run $(AGENT_SCRIPT) dev

agent-console: ## 在终端里直接和 agent 对话 (不开房间)
	cd $(AGENT_DIR) && uv run $(AGENT_SCRIPT) console

agent-start: ## 启动 LiveKit agent worker (生产模式，不热重载)
	cd $(AGENT_DIR) && uv run $(AGENT_SCRIPT) start

agent-shell: ## 进入激活了 venv 的子 shell (手动调 python/pytest 等)
	@echo "Entering venv shell for $(AGENT_DIR). Type 'exit' to leave."
	@cd $(AGENT_DIR) && $$SHELL -c '. .venv/bin/activate && exec $$SHELL'

# ---------- deploy ----------

agent-deploy: ## 构建并部署 agent 到 LiveKit Cloud (代码+环境变量)
	cd $(AGENT_DIR) && lk agent deploy --secrets-file .env.secrets --project resume

agent-update-secrets: ## 仅更新 agent 环境变量并重启 (不重新构建)
	cd $(AGENT_DIR) && lk agent update-secrets --secrets-file .env.secrets --project resume

# ---------- clean ----------

agent-clean: ## 删除 Python venv
	rm -rf $(VENV)

clean: agent-clean ## 清理所有生成目录
	rm -rf apps/web/.output apps/web/node_modules/.vite node_modules/.cache
	rm -rf apps/desktop/out apps/desktop/dist
