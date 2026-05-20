/**
 * 本地维护的聊天模型清单。运行时仍走百炼 OpenAI-兼容网关，只是 picker 列表不再
 * 跟随 `/models` 接口，而是以本文件为唯一可信源。
 *
 * Locally curated chat-model catalog. Runtime still hits Alibaba Cloud Model
 * Studio's OpenAI-compatible gateway; this file is the single source of truth
 * for what the picker shows and which ids the server accepts.
 *
 * 改清单只需要编辑下面的数组——新增/删除/调整 label 都不需要再动接口或前端。
 * To change the offering, edit the array below — no route or client changes
 * needed.
 */

export type ChatModelProvider = "alibaba" | "deepseek" | "moonshot" | "zhipu" | "minimax" | "other";

export interface ChatModelOption {
  /** 调用上游时使用的 model id（百炼上架的字面值）。
   *  Model id sent to the upstream gateway. Must match a Bailian id verbatim. */
  id: string;
  /** picker 中展示的名称。Display label shown in the picker. */
  label: string;
  /** 用于 picker 分组与 logo 选择。Used to bucket + pick a vendor logo. */
  provider: ChatModelProvider;
}

/**
 * 当前对外开放的模型清单（阿里云百炼国内 region）。
 * Currently exposed chat models (Bailian China region).
 */
export const LOCAL_CHAT_MODELS: readonly ChatModelOption[] = [
  // Qwen — 通义千问自研
  { id: "qwen3.6-plus", label: "Qwen3.6 Plus", provider: "alibaba" },
  { id: "qwen3.6-max-preview", label: "Qwen3.6 Max", provider: "alibaba" },
  { id: "qwen3.6-flash", label: "Qwen3.6 Flash", provider: "alibaba" },
  // DeepSeek — V4 自带 thinking 模式（enable_thinking），无需单独的推理变体
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", provider: "deepseek" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "deepseek" },
  // Kimi — 月之暗面，百炼托管版（K2.6 默认开启 thinking）
  { id: "kimi-k2.6", label: "Kimi K2.6", provider: "moonshot" },
  // GLM — 智谱
  { id: "glm-5.1", label: "GLM-5.1", provider: "zhipu" },
  { id: "glm-4.5-air", label: "GLM-4.5 Air", provider: "zhipu" },
  // MiniMax
  { id: "MiniMax-M2.7", label: "MiniMax M2.7", provider: "minimax" },
];

/**
 * 服务端兜底默认值：客户端未传 / 传了不在清单里时回落到这个 id。
 * Server-side default — used when the client omits `model` or sends an id
 * that's not in `LOCAL_CHAT_MODELS`.
 */
export const LOCAL_DEFAULT_MODEL_ID = "qwen3.6-plus";

/** 快速 O(1) 校验用。Set for O(1) id validation. */
export const LOCAL_CHAT_MODEL_IDS: ReadonlySet<string> = new Set(
  LOCAL_CHAT_MODELS.map((m) => m.id),
);

/**
 * 把任意 id 收敛到清单内；非法值回落到默认。
 * Clamp an arbitrary id to the local catalog; unknown values fall back to the default.
 */
export function resolveChatModelId(id: string | null | undefined): string {
  if (typeof id === "string" && LOCAL_CHAT_MODEL_IDS.has(id)) {
    return id;
  }
  return LOCAL_DEFAULT_MODEL_ID;
}
