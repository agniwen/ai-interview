'use client';

import type { UIMessage } from 'ai';
import type { ReactNode } from 'react';
import { isReasoningUIPart, isToolUIPart } from 'ai';
import { useMemo, useState } from 'react';
import { ToolCallsSummaryBar } from './tool-calls-summary-bar';

/**
 * Determines if a message has any tool call or reasoning content
 * that should be collapsible.
 */
function messageHasCollapsibleContent(message: UIMessage): boolean {
  return message.parts.some(p => isToolUIPart(p) || isReasoningUIPart(p));
}

function countToolCalls(message: UIMessage): number {
  let count = 0;
  for (const part of message.parts) {
    if (isToolUIPart(part))
      count++;
  }
  return count;
}

/**
 * Checks whether a message has an active approval request, which
 * should force the tool calls to be expanded so the user can respond.
 */
function messageHasActiveApproval(message: UIMessage): boolean {
  return message.parts.some(
    p => isToolUIPart(p) && p.state === 'approval-requested',
  );
}

export interface AssistantMessageGroupsProps {
  message: UIMessage
  isStreaming: boolean
  /** Pre-computed generation duration in ms (for completed messages) */
  durationMs: number | null
  /** ISO timestamp of the preceding user message's createdAt (for live timer while streaming) */
  startedAt: string | null
  /**
   * Render function that produces the list of group elements.
   * Called with `isExpanded` so the caller can conditionally
   * skip rendering collapsible groups.
   */
  children: (isExpanded: boolean) => ReactNode
}

/**
 * Wraps an assistant message's groups with a collapsible summary bar.
 * By default, tool calls and reasoning are hidden behind a single-line
 * summary. Clicking the summary expands to show the full content.
 */
export function AssistantMessageGroups({
  message,
  isStreaming,
  durationMs,
  startedAt,
  children,
}: AssistantMessageGroupsProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const hasCollapsible = useMemo(
    () => messageHasCollapsibleContent(message),
    [message],
  );

  const toolCallCount = useMemo(() => countToolCalls(message), [message]);

  const hasActiveApproval = useMemo(
    () => messageHasActiveApproval(message),
    [message],
  );

  // Force expand when there's an active approval the user needs to respond to
  const effectiveExpanded = isExpanded || hasActiveApproval;

  // If no collapsible content, just render children directly
  if (!hasCollapsible) {
    return <>{children(true)}</>;
  }

  return (
    <>
      <ToolCallsSummaryBar
        isExpanded={effectiveExpanded}
        onToggle={() => setIsExpanded(v => !v)}
        isStreaming={isStreaming}
        toolCallCount={toolCallCount}
        durationMs={durationMs}
        startedAt={startedAt}
        statusWordSeed={message.id}
      />
      <div className='space-y-1'>{children(effectiveExpanded)}</div>
    </>
  );
}
