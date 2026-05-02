"use client";

import { createContext, use, useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";

const INPUT_APPEND_PUNCTUATION_REGEX = /[，。,.]$/;

interface ComposerInputValue {
  input: string;
  setInput: (value: string) => void;
  appendInput: (suggestion: string) => void;
  resetInput: () => void;
}

const ComposerInputContext = createContext<ComposerInputValue | null>(null);

export function useComposerInputContext(): ComposerInputValue {
  const value = use(ComposerInputContext);
  if (!value) {
    throw new Error("useComposerInputContext must be used within ComposerInputProvider");
  }
  return value;
}

function appendSuggestion(currentInput: string, suggestion: string): string {
  const normalized = currentInput.trimEnd();
  if (!normalized) {
    return suggestion;
  }
  const separator = INPUT_APPEND_PUNCTUATION_REGEX.test(normalized) ? "" : "，";
  return `${normalized}${separator}${suggestion}`;
}

export function ComposerInputProvider({ children }: { children: ReactNode }) {
  const [input, setInput] = useState("");

  const appendInput = useCallback((suggestion: string) => {
    setInput((current) => appendSuggestion(current, suggestion));
  }, []);

  const resetInput = useCallback(() => {
    setInput("");
  }, []);

  // Wrap in useMemo so the context identity only flips on input change.
  // Without this, every parent re-render (e.g., the per-chunk shell render
  // during streaming) would hand consumers a fresh object and re-render
  // QuickSuggestions / Composer footer / etc. setInter / appendInput /
  // resetInput are already stable (useState setter + useCallback).
  const value = useMemo<ComposerInputValue>(
    () => ({ appendInput, input, resetInput, setInput }),
    [appendInput, input, resetInput],
  );

  return <ComposerInputContext.Provider value={value}>{children}</ComposerInputContext.Provider>;
}
