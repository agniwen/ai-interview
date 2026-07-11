"use client";

import type { KeywordCategory } from "@arc/shared/answer-keywords";
import { cn } from "@arc/shared/utils";
import { useKeywordHighlight } from "./context";

const CATEGORY_META: { category: KeywordCategory; label: string; dotClass: string }[] = [
  { category: "skill", dotClass: "bg-blue-500", label: "技能" },
  { category: "metric", dotClass: "bg-emerald-500", label: "数字/绩效" },
  { category: "risk", dotClass: "bg-amber-500", label: "风险词" },
];

export function KeywordHighlightLegend({ className }: { className?: string }) {
  const { enabledCategories, toggleCategory } = useKeywordHighlight();
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-muted-foreground text-xs">关键词高亮</span>
      {CATEGORY_META.map((meta) => {
        const active = enabledCategories.has(meta.category);
        return (
          <button
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
              active
                ? "border-border bg-background"
                : "border-muted/60 bg-muted/30 text-muted-foreground opacity-60",
            )}
            key={meta.category}
            onClick={() => toggleCategory(meta.category)}
            type="button"
          >
            <span
              className={cn("size-2 rounded-full", meta.dotClass, active ? "" : "opacity-40")}
            />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
