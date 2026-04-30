/**
 * AI tool 调用的渲染状态工具集（与具体平台解耦）。
 * Shared tool-state extraction utilities, ported from open-agents — platform-agnostic.
 *
 * 提供两件事：
 *   1) 将 `GenericToolPart` 扁平化为 UI 直接可用的 {@link ToolRenderState}；
 *   2) 一组渲染辅助：状态色、状态标签、Token 数格式化。
 *
 * Provides:
 *   1) flatten a `GenericToolPart` into a UI-ready {@link ToolRenderState};
 *   2) helpers for status color, status label, and token-count formatting.
 */

/**
 * 由 tool part 衍生出的"渲染端关心的状态"。
 * Common state derived from a tool part for renderers.
 */
export interface ToolRenderState {
  /** Whether the tool is currently running */
  running: boolean;
  /** Whether the tool was interrupted (running when stream stopped) */
  interrupted: boolean;
  /** Error message if the tool failed */
  error?: string;
  /** Whether the tool was denied by the user */
  denied: boolean;
  /** Reason for denial if provided */
  denialReason?: string;
  /** Whether approval is being requested */
  approvalRequested: boolean;
  /** Approval ID if approval is requested */
  approvalId?: string;
  /** Whether this is the currently active approval */
  isActiveApproval: boolean;
}

/**
 * 通用 tool part 形状：能容纳任意工具配置返回的字段子集。
 * Generic tool part type that works with any tool configuration.
 */
export interface GenericToolPart {
  state: string;
  approval?: {
    id?: string;
    approved?: boolean;
    reason?: string;
  };
  errorText?: string;
  input?: unknown;
  output?: unknown;
}

/**
 * 从 tool part 中抽取出渲染端关心的状态字段。
 * Extract render state from a tool part.
 */
export function extractRenderState(
  part: GenericToolPart,
  activeApprovalId: string | null,
  isStreaming: boolean,
): ToolRenderState {
  const isRunningState = part.state === "input-streaming" || part.state === "input-available";
  const { approval } = part;
  const denied = part.state === "output-denied" || approval?.approved === false;
  const denialReason = denied ? approval?.reason : undefined;
  const approvalRequested = part.state === "approval-requested" && !denied;
  const error = part.state === "output-error" ? part.errorText : undefined;
  const approvalId = approvalRequested ? approval?.id : undefined;
  const isActiveApproval =
    approvalId !== null && approvalId !== undefined && approvalId === activeApprovalId;

  const interrupted = isRunningState && !isStreaming;
  const running = isRunningState && isStreaming;

  return {
    approvalId,
    approvalRequested,
    denialReason,
    denied,
    error,
    interrupted,
    isActiveApproval,
    running,
  };
}

/**
 * 根据状态决定显示色：红 = 失败 / 拒绝，黄 = 进行中 / 待确认，绿 = 正常。
 * Pick a status color: red = failed / denied, yellow = in-flight / pending, green = ok.
 */
export function getStatusColor(state: ToolRenderState): "red" | "yellow" | "green" {
  if (state.denied) {
    return "red";
  }
  if (state.interrupted) {
    return "yellow";
  }
  if (state.approvalRequested) {
    return "yellow";
  }
  if (state.running) {
    return "yellow";
  }
  if (state.error) {
    return "red";
  }
  return "green";
}

/**
 * 根据状态返回中文展示文案；正常运行无文案返回 undefined。
 * Pick a Chinese label for the status; returns undefined when no label is needed.
 */
export function getStatusLabel(state: ToolRenderState): string | undefined {
  if (state.denied) {
    return state.denialReason ? `已拒绝: ${state.denialReason}` : "已拒绝";
  }
  if (state.interrupted) {
    return "已中断";
  }
  if (state.approvalRequested) {
    return "等待确认…";
  }
  if (state.running) {
    return "运行中…";
  }
  if (state.error) {
    return `错误: ${state.error.slice(0, 80)}`;
  }
  return undefined;
}

/**
 * 把 Token 数压缩成 1.2k / 3.4m / 5.6b / 7.8t 形式，便于状态栏展示。
 * Format a token count for display: 1.2k / 3.4m / 5.6b / 7.8t.
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 999_950_000_000) {
    return `${(tokens / 1_000_000_000_000).toFixed(1)}t`;
  }
  if (tokens >= 999_950_000) {
    return `${(tokens / 1_000_000_000).toFixed(1)}b`;
  }
  if (tokens >= 999_950) {
    return `${(tokens / 1_000_000).toFixed(1)}m`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toLocaleString();
}
