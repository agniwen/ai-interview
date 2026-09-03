"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";

/** Default pause after typing before committing search (URL / query). */
export const DEFAULT_SEARCH_DEBOUNCE_MS = 300;

export interface DebouncedSearchInputProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** Minimum width CSS custom property wrapper style (optional). */
  className?: string;
  style?: CSSProperties;
  debounceMs?: number;
  loading?: boolean;
  "data-slot"?: string;
}

/**
 * Search box for list/table toolbars.
 *
 * - Local draft state keeps typing responsive and avoids controlled-input
 *   thrash from URL/query updates on every keystroke.
 * - Debounces commits so list fetches do not fire mid-word.
 * - Ignores commits during IME composition (Chinese/Japanese/Korean pinyin
 *   etc.) so intermediate composition text never navigates or refetches.
 * - Flushes on blur and Enter for snappier intentional commits.
 */
export function DebouncedSearchInput({
  className,
  debounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
  loading = false,
  onValueChange,
  placeholder,
  style,
  value,
  "data-slot": dataSlot,
}: DebouncedSearchInputProps) {
  const [draft, setDraft] = useState(value);
  const [composing, setComposing] = useState(false);
  const draftRef = useRef(value);
  const composingRef = useRef(false);
  const lastCommittedRef = useRef(value);
  const onValueChangeRef = useRef(onValueChange);

  useEffect(() => {
    onValueChangeRef.current = onValueChange;
  }, [onValueChange]);

  const setDraftValue = (next: string) => {
    draftRef.current = next;
    setDraft(next);
  };

  const setComposingValue = (next: boolean) => {
    composingRef.current = next;
    setComposing(next);
  };

  // External value wins when parent resets filters / navigates (not while composing).
  useEffect(() => {
    if (composing) {
      return;
    }
    if (value !== lastCommittedRef.current) {
      lastCommittedRef.current = value;
      setDraftValue(value);
    }
  }, [value, composing]);

  // Debounced commit of local draft → parent.
  useEffect(() => {
    if (composing) {
      return;
    }
    if (draft === lastCommittedRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      const next = draftRef.current;
      if (composingRef.current || next === lastCommittedRef.current) {
        return;
      }
      lastCommittedRef.current = next;
      onValueChangeRef.current(next);
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [draft, composing, debounceMs]);

  const flush = () => {
    if (composingRef.current) {
      return;
    }
    const next = draftRef.current;
    if (next === lastCommittedRef.current) {
      return;
    }
    lastCommittedRef.current = next;
    onValueChangeRef.current(next);
  };

  return (
    <div className={className} data-slot={dataSlot} style={style}>
      <div className="relative min-w-0">
        <Icon
          className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground"
          icon="ph:magnifying-glass"
        />
        <Input
          className="[&>input]:pr-9 [&>input]:pl-9"
          onBlur={flush}
          onChange={(event) => {
            setDraftValue(event.target.value);
          }}
          onCompositionEnd={(event) => {
            // Read final composed value from the event target; some browsers
            // only settle the value on compositionend.
            setDraftValue(event.currentTarget.value);
            setComposingValue(false);
          }}
          onCompositionStart={() => {
            setComposingValue(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              // Enter should not commit mid-IME (Enter often confirms composition).
              if (event.nativeEvent.isComposing || composingRef.current) {
                return;
              }
              flush();
            }
          }}
          placeholder={placeholder}
          value={draft}
        />
        {loading ? (
          <Icon
            className="pointer-events-none absolute top-1/2 right-3 z-10 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            icon="ph:spinner"
          />
        ) : null}
      </div>
    </div>
  );
}
