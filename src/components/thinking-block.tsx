'use client';

import type { ToolRenderState } from '@/lib/tool-state';
import { Brain } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ToolLayout } from './tool-call/tool-layout';

interface ThinkingBlockProps {
  text: string
  isStreaming?: boolean
  partCount?: number
}

const COMPLETED_STATE: ToolRenderState = {
  running: false,
  interrupted: false,
  denied: false,
  approvalRequested: false,
  isActiveApproval: false,
};

const STREAMING_STATE: ToolRenderState = {
  running: true,
  interrupted: false,
  denied: false,
  approvalRequested: false,
  isActiveApproval: false,
};

export function ThinkingBlock({
  text,
  isStreaming = false,
  partCount = 1,
}: ThinkingBlockProps) {
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isStreaming) {
      if (startTimeRef.current !== null) {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }

    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }

    intervalRef.current = setInterval(() => {
      setElapsed(
        Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000),
      );
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isStreaming]);

  const hasContent = text.trim().length > 0;
  const thoughtLabel
    = partCount === 1
      ? '思考完成'
      : `${partCount} 次思考`;

  const name = isStreaming ? '思考中...' : thoughtLabel;

  const summary
    = !isStreaming && elapsed > 0
      ? `${elapsed} 秒`
      : '';

  const expandedContent = hasContent
    ? (
        <div className=' border-t border-b border-border bg-muted/40 px-3 py-2'>
          <p className='whitespace-pre-wrap break-words text-xs text-muted-foreground'>
            {text}
          </p>
        </div>
      )
    : undefined;

  return (
    <ToolLayout
      name={name}
      icon={<Brain className='h-3.5 w-3.5' />}
      summary={summary}
      state={isStreaming ? STREAMING_STATE : COMPLETED_STATE}
      expandedContent={expandedContent}
    />
  );
}
