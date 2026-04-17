"use client";

import type { AgentState } from "@livekit/components-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

const stateConfig: Record<string, { label: string; dotClass: string }> = {
  connecting: { dotClass: "bg-gray-400", label: "正在连接..." },
  idle: { dotClass: "bg-gray-400", label: "等待中..." },
  initializing: { dotClass: "bg-gray-400", label: "正在初始化..." },
  listening: { dotClass: "bg-blue-500", label: "请开始回答..." },
  speaking: { dotClass: "bg-green-500", label: "面试官正在讲话" },
  thinking: { dotClass: "bg-amber-500", label: "面试官正在思考" },
};

interface AgentStateIndicatorProps {
  state: AgentState;
  className?: string;
}

export function AgentStateIndicator({ state, className }: AgentStateIndicatorProps) {
  const config = stateConfig[state];
  if (!config) {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground",
          className,
        )}
      >
        <span className={cn("relative flex size-2.5")}>
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75",
              config.dotClass,
              (state === "speaking" || state === "listening" || state === "thinking") &&
                "animate-ping",
            )}
          />
          <span className={cn("relative inline-flex size-2.5 rounded-full", config.dotClass)} />
        </span>
        <span>{config.label}</span>
      </motion.div>
    </AnimatePresence>
  );
}
