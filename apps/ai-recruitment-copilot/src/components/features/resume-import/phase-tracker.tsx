"use client";

import { IconCheck } from "@tabler/icons-react";
import { cn } from "@arc/shared/utils";
import type { ImportPhase } from "./types";

const PHASES: { key: Exclude<ImportPhase, "idle">; label: string }[] = [
  { key: "preparing", label: "准备文件" },
  { key: "parsing", label: "解析简历" },
  { key: "saving", label: "写入简历库" },
];

export function PhaseTracker({ phase }: { phase: ImportPhase }) {
  const currentIndex = phase === "idle" ? -1 : PHASES.findIndex((p) => p.key === phase);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-xs">
      {PHASES.map((item, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <div className="flex items-center gap-1.5" key={item.key}>
            <span
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-full border font-medium",
                done &&
                  "border-emerald-400/70 bg-emerald-50 text-emerald-600 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300",
                active && "border-primary bg-primary/10 text-primary",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              {done ? <IconCheck className="size-3" /> : index + 1}
            </span>
            <span className={cn(active ? "font-medium text-foreground" : "text-muted-foreground")}>
              {item.label}
            </span>
            {index < PHASES.length - 1 ? <span className="text-muted-foreground/50">›</span> : null}
          </div>
        );
      })}
    </div>
  );
}
