"use client";

import type { KeywordCategory } from "@app/shared/answer-keywords";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

export const ALL_KEYWORD_CATEGORIES: readonly KeywordCategory[] = ["skill", "metric", "risk"];

const EMPTY_SKILLS: string[] = [];

interface KeywordHighlightContextValue {
  enabledCategories: Set<KeywordCategory>;
  toggleCategory: (category: KeywordCategory) => void;
  /** 岗位结构化技能，透传给 HighlightedText 的 extraSkills（默认空）。 */
  extraSkills: string[];
}

const DEFAULT_VALUE: KeywordHighlightContextValue = {
  enabledCategories: new Set(ALL_KEYWORD_CATEGORIES),
  extraSkills: EMPTY_SKILLS,
  toggleCategory: () => {
    // 无 Provider 时的空实现：高亮默认全开、开关不可用。
  },
};

const KeywordHighlightContext = createContext<KeywordHighlightContextValue>(DEFAULT_VALUE);

export function KeywordHighlightProvider({
  children,
  extraSkills = EMPTY_SKILLS,
}: {
  children: React.ReactNode;
  extraSkills?: string[];
}) {
  const [enabledCategories, setEnabledCategories] = useState<Set<KeywordCategory>>(
    () => new Set(ALL_KEYWORD_CATEGORIES),
  );

  const toggleCategory = useCallback((category: KeywordCategory) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ enabledCategories, extraSkills, toggleCategory }),
    [enabledCategories, extraSkills, toggleCategory],
  );

  return (
    <KeywordHighlightContext.Provider value={value}>{children}</KeywordHighlightContext.Provider>
  );
}

export function useKeywordHighlight(): KeywordHighlightContextValue {
  return useContext(KeywordHighlightContext);
}
