import type { ChatModelOption } from "@/lib/client/api";
import { SESSION_MODEL_FALLBACK_ID } from "../_atoms/model";

/**
 * 把"用户在 atom 里持久化的 model id"转换为"实际可用的 model id"，
 * 让 picker / composer / chat-workspace 共用同一份兜底逻辑，避免"显示 A、发送 B"。
 *
 * 规则：
 *   - models 还没加载（length === 0）→ 原样返回，不抢跑
 *   - raw === ""（用户显式选"默认"）→ 仍返回 ""，调用方据此决定要不要用 defaultId
 *   - raw 在列表里 → 直接用
 *   - SESSION_MODEL_FALLBACK_ID（qwen-plus-latest）在列表里 → 用它
 *   - 服务端 defaultId 在列表里 → 用它
 *   - 列表第一个 / 再不行回到 raw
 *
 * Resolve a persisted atom model id to an actually usable id, consulting the
 * latest /models snapshot. Picker, composer, and chat-workspace share this so
 * the displayed model and the model actually sent stay in lockstep.
 *
 * Rules:
 *   - models not loaded yet → echo `raw` (don't pre-empt the user)
 *   - raw === "" (means "use server default") → return "" so callers can
 *     forward the empty marker; do NOT eagerly resolve to defaultId here
 *   - raw in list → use it
 *   - SESSION_MODEL_FALLBACK_ID in list → use it
 *   - server defaultId in list → use it
 *   - first listed model, otherwise echo raw
 */
export function resolveEffectiveModel(params: {
  raw: string;
  models: readonly ChatModelOption[];
  defaultId: string;
}): string {
  const { raw, models, defaultId } = params;

  if (models.length === 0) {
    return raw;
  }
  if (!raw) {
    return "";
  }
  if (models.some((m) => m.id === raw)) {
    return raw;
  }
  if (models.some((m) => m.id === SESSION_MODEL_FALLBACK_ID)) {
    return SESSION_MODEL_FALLBACK_ID;
  }
  if (models.some((m) => m.id === defaultId)) {
    return defaultId;
  }
  return models[0]?.id ?? raw;
}
