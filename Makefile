AGENT_DIR := agent
VENV      := $(AGENT_DIR)/.venv
PY        := uv run --project $(AGENT_DIR)
AGENT_SCRIPT := src/agent.py

.DEFAULT_GOAL := help

.PHONY: help install web-install agent-install agent-download \
        dev web-dev agent-dev agent-console agent-start agent-shell \
        agent-deploy agent-update-secrets agent-clean clean

help: ## 显示所有可用命令
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---------- install ----------

install: web-install agent-install agent-download ## 一键安装前后端依赖 + 下载模型

web-install: ## pnpm install (Next.js 前端)
	pnpm install

agent-install: ## 创建 venv 并安装 Python 依赖 (uv sync)
	cd $(AGENT_DIR) && uv sync

agent-download: ## 下载 Silero VAD + turn-detector 模型
	cd $(AGENT_DIR) && uv run $(AGENT_SCRIPT) download-files

# ---------- dev ----------

dev: ## 并行启动 Next.js + LiveKit agent worker (Ctrl-C 同时停止)
	@$(MAKE) -j2 web-dev agent-dev

web-dev: ## 仅启动 Next.js dev server
	pnpm dev

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
	rm -rf .next node_modules/.cache
