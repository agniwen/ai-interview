/**
 * Shared tool state extraction utilities.
 * Ported from open-agents — platform-agnostic.
 */

/**
 * Common state derived from a tool part for renderers.
 */
export interface ToolRenderState {
  /** Whether the tool is currently running */
  running: boolean
  /** Whether the tool was interrupted (running when stream stopped) */
  interrupted: boolean
  /** Error message if the tool failed */
  error?: string
  /** Whether the tool was denied by the user */
  denied: boolean
  /** Reason for denial if provided */
  denialReason?: string
  /** Whether approval is being requested */
  approvalRequested: boolean
  /** Approval ID if approval is requested */
  approvalId?: string
  /** Whether this is the currently active approval */
  isActiveApproval: boolean
}

/**
 * Generic tool part type that works with any tool configuration.
 */
export interface GenericToolPart {
  state: string
  approval?: {
    id?: string
    approved?: boolean
    reason?: string
  }
  errorText?: string
  input?: unknown
  output?: unknown
}

/**
 * Extract render state from a tool part.
 */
export function extractRenderState(
  part: GenericToolPart,
  activeApprovalId: string | null,
  isStreaming: boolean,
): ToolRenderState {
  const isRunningState
    = part.state === 'input-streaming' || part.state === 'input-available';
  const approval = part.approval;
  const denied = part.state === 'output-denied' || approval?.approved === false;
  const denialReason = denied ? approval?.reason : undefined;
  const approvalRequested = part.state === 'approval-requested' && !denied;
  const error = part.state === 'output-error' ? part.errorText : undefined;
  const approvalId = approvalRequested ? approval?.id : undefined;
  const isActiveApproval
    = approvalId != null && approvalId === activeApprovalId;

  const interrupted = isRunningState && !isStreaming;
  const running = isRunningState && isStreaming;

  return {
    running,
    interrupted,
    error,
    denied,
    denialReason,
    approvalRequested,
    approvalId,
    isActiveApproval,
  };
}

/**
 * Get the status color based on tool state.
 */
export function getStatusColor(
  state: ToolRenderState,
): 'red' | 'yellow' | 'green' {
  if (state.denied)
    return 'red';
  if (state.interrupted)
    return 'yellow';
  if (state.approvalRequested)
    return 'yellow';
  if (state.running)
    return 'yellow';
  if (state.error)
    return 'red';
  return 'green';
}

/**
 * Get the status label based on tool state.
 */
export function getStatusLabel(state: ToolRenderState): string | undefined {
  if (state.denied) {
    return state.denialReason ? `已拒绝: ${state.denialReason}` : '已拒绝';
  }
  if (state.interrupted)
    return '已中断';
  if (state.approvalRequested)
    return '等待确认…';
  if (state.running)
    return '运行中…';
  if (state.error)
    return `错误: ${state.error.slice(0, 80)}`;
  return undefined;
}

/**
 * Format token count for display.
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 999_950_000_000)
    return `${(tokens / 1_000_000_000_000).toFixed(1)}t`;
  if (tokens >= 999_950_000)
    return `${(tokens / 1_000_000_000).toFixed(1)}b`;
  if (tokens >= 999_950)
    return `${(tokens / 1_000_000).toFixed(1)}m`;
  if (tokens >= 1_000)
    return `${(tokens / 1_000).toFixed(1)}k`;
  return tokens.toLocaleString();
}
