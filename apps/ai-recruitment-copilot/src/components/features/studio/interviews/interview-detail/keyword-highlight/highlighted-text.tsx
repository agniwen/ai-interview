"use client";

import { extractAnswerKeywords } from "@arc/shared/answer-keywords";
import type { KeywordCategory } from "@arc/shared/answer-keywords";
import { cn } from "@arc/shared/utils";
import { useMemo } from "react";
import { ALL_KEYWORD_CATEGORIES } from "./context";

const CATEGORY_CLASS: Record<KeywordCategory, string> = {
  metric: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  risk: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  skill: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
};

const DEFAULT_ENABLED = new Set<KeywordCategory>(ALL_KEYWORD_CATEGORIES);

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
  enabledCategories = DEFAULT_ENABLED,
  extraSkills,
  className,
}: HighlightedTextProps) {
  const spans = useMemo(() => extractAnswerKeywords(text, { extraSkills }), [text, extraSkills]);

  const segments = useMemo<Segment[]>(() => {
    const visible = spans.filter((span) => enabledCategories.has(span.category));
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
  }, [spans, enabledCategories, text]);

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
