'use client';

import type { AgentState } from '@livekit/components-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';

const stateConfig: Record<string, { label: string, dotClass: string }> = {
  speaking: { label: '面试官正在讲话', dotClass: 'bg-green-500' },
  listening: { label: '请开始回答...', dotClass: 'bg-blue-500' },
  thinking: { label: '面试官正在思考', dotClass: 'bg-amber-500' },
  connecting: { label: '正在连接...', dotClass: 'bg-gray-400' },
  initializing: { label: '正在初始化...', dotClass: 'bg-gray-400' },
  idle: { label: '等待中...', dotClass: 'bg-gray-400' },
};

interface AgentStateIndicatorProps {
  state: AgentState
  className?: string
}

export function AgentStateIndicator({ state, className }: AgentStateIndicatorProps) {
  const config = stateConfig[state];
  if (!config)
    return null;

  return (
    <AnimatePresence mode='wait'>
      <motion.div
        key={state}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground',
          className,
        )}
      >
        <span className={cn('relative flex size-2.5')}>
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-75',
              config.dotClass,
              (state === 'speaking' || state === 'listening' || state === 'thinking') && 'animate-ping',
            )}
          />
          <span className={cn('relative inline-flex size-2.5 rounded-full', config.dotClass)} />
        </span>
        <span>{config.label}</span>
      </motion.div>
    </AnimatePresence>
  );
}
