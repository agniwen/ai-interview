"use client";

import type { KeywordCategory } from "@app/shared/answer-keywords";
import { createContext, useContext, useMemo } from "react";

const ALL_KEYWORD_CATEGORIES: readonly KeywordCategory[] = ["skill", "metric", "risk"];

// 高亮分类始终全开。Every highlight category is always on.
const ENABLED_CATEGORIES = new Set(ALL_KEYWORD_CATEGORIES);

const EMPTY_SKILLS: string[] = [];

interface KeywordHighlightContextValue {
  enabledCategories: Set<KeywordCategory>;
  /** 岗位结构化技能，透传给 HighlightedText 的 extraSkills（默认空）。 */
  extraSkills: string[];
}

const DEFAULT_VALUE: KeywordHighlightContextValue = {
  enabledCategories: ENABLED_CATEGORIES,
  extraSkills: EMPTY_SKILLS,
};

const KeywordHighlightContext = createContext<KeywordHighlightContextValue>(DEFAULT_VALUE);

export function KeywordHighlightProvider({
  children,
  extraSkills = EMPTY_SKILLS,
}: {
  children: React.ReactNode;
  extraSkills?: string[];
}) {
  const value = useMemo(
    () => ({ enabledCategories: ENABLED_CATEGORIES, extraSkills }),
    [extraSkills],
  );

  return (
    <KeywordHighlightContext.Provider value={value}>{children}</KeywordHighlightContext.Provider>
  );
}

export function useKeywordHighlight(): KeywordHighlightContextValue {
  return useContext(KeywordHighlightContext);
}
