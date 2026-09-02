"use client";

import { extractAnswerKeywords } from "@app/shared/answer-keywords";
import type { KeywordCategory } from "@app/shared/answer-keywords";
import { cn } from "@app/shared/utils";
import { useMemo } from "react";
import { useKeywordHighlight } from "./context";

const CATEGORY_CLASS = {
  metric: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  risk: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  skill: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
} satisfies Record<KeywordCategory, string>;

interface HighlightedTextProps {
  text: string;
  enabledCategories?: Set<KeywordCategory>;
  extraSkills?: string[];
  className?: string;
}

interface Segment {
  key: string;
  text: string;
  category: KeywordCategory | null;
}

export function HighlightedText({
  text,
  enabledCategories,
  extraSkills,
  className,
}: HighlightedTextProps) {
  const { enabledCategories: contextCategories, extraSkills: contextExtraSkills } =
    useKeywordHighlight();
  const activeCategories = enabledCategories ?? contextCategories;
  const activeExtraSkills = extraSkills ?? contextExtraSkills;
  const spans = useMemo(
    () => extractAnswerKeywords(text, { extraSkills: activeExtraSkills }),
    [text, activeExtraSkills],
  );

  const segments = useMemo<Segment[]>(() => {
    const visible = spans.filter((span) => activeCategories.has(span.category));
    const result: Segment[] = [];
    let cursor = 0;
    for (const span of visible) {
      if (span.start > cursor) {
        result.push({
          category: null,
          key: `t-${cursor}`,
          text: text.slice(cursor, span.start),
        });
      }
      result.push({
        category: span.category,
        key: `m-${span.start}`,
        text: text.slice(span.start, span.end),
      });
      cursor = span.end;
    }
    if (cursor < text.length) {
      result.push({
        category: null,
        key: `t-${cursor}`,
        text: text.slice(cursor),
      });
    }
    return result;
  }, [spans, activeCategories, text]);

  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {segments.map((segment) =>
        segment.category ? (
          <mark
            className={cn("rounded px-0.5", CATEGORY_CLASS[segment.category])}
            data-category={segment.category}
            key={segment.key}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={segment.key}>{segment.text}</span>
        ),
      )}
    </span>
  );
}
