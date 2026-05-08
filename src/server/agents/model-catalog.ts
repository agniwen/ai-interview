/**
 * 模型 id → 展示用元数据 / 校验工具。
 * Model id → display metadata + validation helpers.
 *
 * 模型列表本身完全跟随百炼 `/models` 接口（见 `list-upstream-models.ts`）；这里只
 * 负责：
 *   1. 按关键词排除掉明显不是聊天能力的服务（embedding / OCR / TTS / 图像 / 视频 …）；
 *   2. 从 id 推断 provider / 分组，给前端 UI 用；
 *   3. 收敛用户传入的 model id —— 必须在最近一次成功拉取的上游列表里。
 *
 * The actual model list mirrors DashScope `/models` (see `list-upstream-models`).
 * This module only:
 *   1. filters out clearly non-chat services by keyword (embedding / OCR / TTS / …);
 *   2. infers provider + group buckets from the id for the picker UI;
 *   3. validates user-supplied ids against the most recent upstream snapshot.
 */

export type ChatModelProvider = "alibaba" | "deepseek" | "moonshot" | "zhipu" | "minimax" | "other";

export type ChatModelGroup = "fast" | "balanced" | "reasoning" | "long";

export interface ChatModelDescriptor {
  id: string;
  label: string;
  provider: ChatModelProvider;
  group: ChatModelGroup;
}

/**
 * 服务端默认模型 id；当 atom 为空且 ALIBABA_MODEL 未设时使用。
 * Server-side fallback model id; used when both the user's atom and
 * `ALIBABA_MODEL` are empty.
 */
export const HARDCODED_DEFAULT_MODEL_ID = "deepseek-v4-flash";

/**
 * 当 HARDCODED 默认值在最新上游列表里找不到时使用的二级兜底。
 * 与前端 `SESSION_MODEL_FALLBACK_ID` 保持一致。
 *
 * Secondary fallback used when HARDCODED default is missing from the latest
 * upstream snapshot. Kept in sync with the client's `SESSION_MODEL_FALLBACK_ID`.
 */
export const SECONDARY_DEFAULT_MODEL_ID = "qwen-plus-latest";

/**
 * 白名单规则：
 *   - 带斜杠前缀（`vanchin/xxx`、`siliconflow/xxx`、`kimi/xxx` …）一律剔除
 *   - MiniMax / Kimi (Moonshot) / GLM / DeepSeek：保留官方部署
 *   - Qwen：仅保留 `qwen[number]-max` 和 `qwen[number]-plus` 形态
 *           （含快照与后缀，例如 qwen-max-2025-09-23 / qwen3.6-max-preview / qwen-plus-latest）
 *   - 其余一律剔除（包含 -flash / -turbo / qwen-coder / qwen-vl / qwq / embedding / ocr / tts …）
 *
 * Allowlist policy:
 *   - Drop anything with a slash prefix (`vanchin/...`, `siliconflow/...`,
 *     `kimi/...` …) — third-party deployments are excluded
 *   - Keep MiniMax / Kimi (Moonshot) / GLM / DeepSeek official deployments
 *   - Qwen: keep only `qwen[number]-max` / `qwen[number]-plus` shapes
 *     (snapshots and suffixes included)
 *   - Everything else dropped (-flash / -turbo / qwen-coder / qwen-vl / qwq /
 *     embedding / ocr / tts / image / audio / video …)
 */
const QWEN_MAX_OR_PLUS = /^qwen[\d.]*-(?:max|plus)(?:-|$)/;

export function isChatCapableId(id: string): boolean {
  // 第三方/自定义部署一律不进 picker。
  // Reject any deployment-prefixed id outright.
  if (id.includes("/")) {
    return false;
  }

  // 过于细分的 id（通常是带 yyyy-mm-dd 日期快照的版本）—— 横线超过 3 个就剔除。
  // 例如 `qwen-plus-2025-12-01`、`qwen3.6-plus-2026-04-02` 都会被排除，
  // 但保留 `qwen3.6-max-preview`（2 个）和 `qwen3.5-flash`（1 个）。
  // Drop ids with > 3 dashes — these are typically dated snapshot variants
  // (e.g. `qwen-plus-2025-12-01`). Cleaner names like `qwen3.6-max-preview`
  // (2 dashes) and `glm-4.5-air` (2 dashes) survive.
  const dashCount = id.split("-").length - 1;
  if (dashCount > 3) {
    return false;
  }

  const lower = id.toLowerCase();

  if (
    lower.startsWith("minimax") ||
    lower.startsWith("kimi") ||
    lower.startsWith("moonshot") ||
    lower.startsWith("glm-") ||
    lower.startsWith("deepseek")
  ) {
    return true;
  }

  return QWEN_MAX_OR_PLUS.test(lower);
}

function inferProvider(id: string): ChatModelProvider {
  // 形如 `vanchin/deepseek-...` / `kimi/kimi-k2.6` 这种带斜杠的部署前缀按尾段判断。
  // For deployments like `vanchin/deepseek-...` or `kimi/kimi-k2.6`, classify by
  // the segment after the slash.
  const tail = id.includes("/") ? (id.split("/").at(-1) ?? id) : id;
  const lower = tail.toLowerCase();

  if (lower.startsWith("deepseek")) {
    return "deepseek";
  }
  if (lower.startsWith("kimi") || lower.startsWith("moonshot")) {
    return "moonshot";
  }
  if (lower.startsWith("glm")) {
    return "zhipu";
  }
  if (lower.startsWith("minimax")) {
    return "minimax";
  }
  if (lower.startsWith("qwen") || lower.startsWith("qwq") || lower.startsWith("tongyi")) {
    return "alibaba";
  }
  return "other";
}

function inferGroup(id: string): ChatModelGroup {
  const lower = id.toLowerCase();

  if (lower.includes("flash") || lower.includes("turbo") || lower.endsWith("-air")) {
    return "fast";
  }
  // qwq / r1 / reasoner / thinking 这类显式推理模型。
  // Models that announce reasoning capability in their id.
  if (
    lower.includes("qwq") ||
    /(^|[-/])r1([-.]|$)/.test(lower) ||
    lower.includes("reasoner") ||
    lower.includes("think")
  ) {
    return "reasoning";
  }
  // 1M / long-context 标识。
  // Long-context flavors.
  if (lower.includes("long") || lower.endsWith("-1m") || lower.includes("-1m-")) {
    return "long";
  }
  return "balanced";
}

export function describeModelId(id: string): ChatModelDescriptor {
  return {
    group: inferGroup(id),
    id,
    label: id,
    provider: inferProvider(id),
  };
}

/**
 * 把任意 model id 收敛到上游最近一次成功返回的列表内；非法值回落到默认。
 * Clamp an arbitrary model id against the most recent successful upstream
 * snapshot; unknown values fall back to the default.
 */
export function resolveChatModelId(
  id: string | null | undefined,
  upstreamIds: Set<string> | null,
  fallbackId: string,
): string {
  // 上游不可达且没有缓存：宁可放行用户选择，也不要因为我们这边的网络抖动直接报错。
  // 由 DashScope 自己返回 4xx 让用户感知。
  // When upstream is unreachable AND we have no cached snapshot, let the id
  // through — better to surface DashScope's own 4xx than to block on our blip.
  if (!upstreamIds) {
    return typeof id === "string" && id.length > 0 ? id : fallbackId;
  }
  if (typeof id === "string" && upstreamIds.has(id)) {
    return id;
  }
  return upstreamIds.has(fallbackId)
    ? fallbackId
    : (upstreamIds.values().next().value ?? fallbackId);
}
