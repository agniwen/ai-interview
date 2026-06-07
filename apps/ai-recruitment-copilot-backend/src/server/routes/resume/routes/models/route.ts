import {
  LOCAL_CHAT_MODELS,
  LOCAL_DEFAULT_MODEL_ID,
} from "@arc/ai-recruitment-copilot-backend/server/agents/chat-models.config";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

/**
 * 返回 composer 模型选择器的可选项。
 * 数据源是本地手维护的 `LOCAL_CHAT_MODELS`，不再回源到百炼 `/models`。
 *
 * Returns the composer model picker options. Source of truth is the locally
 * curated `LOCAL_CHAT_MODELS`; the upstream `/models` call has been removed.
 */
export const modelsRouter = factory
  .createApp()
  .get("/", (c) => c.json({ defaultId: LOCAL_DEFAULT_MODEL_ID, models: LOCAL_CHAT_MODELS }, 200));
