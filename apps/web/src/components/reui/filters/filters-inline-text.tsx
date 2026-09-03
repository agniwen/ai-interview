"use client";

import * as React from "react";
import {
  isFilterLocked,
  useFilterActions,
  useFilterChipAutoOpen,
  useFilterFocusStore,
} from "@/components/reui/filters/filters-context";
import type { FilterField, FilterRule } from "@/components/reui/filters/filters-types";
import { Input } from "@/components/ui/input";

/** Keep typing local to this value; only Enter/blur changes the list query. */
export function FilterInlineText<V, O>({
  rule,
  field,
}: {
  rule: FilterRule<V>;
  field: FilterField<V, O>;
}) {
  const actions = useFilterActions<V, O>();
  const focusStore = useFilterFocusStore();
  const autoOpen = useFilterChipAutoOpen(rule.id) === "value";
  const locked = isFilterLocked(actions);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const composing = React.useRef(false);
  const committed = rule.value == null ? "" : String(rule.value);
  const [state, setState] = React.useState({ committed, draft: committed });

  // URL navigation and Clear must replace the draft without remounting the input.
  if (state.committed !== committed) {
    setState({ committed, draft: committed });
  }

  React.useEffect(() => {
    if (!autoOpen) return;
    if (!locked) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    focusStore.set({ id: rule.id, segment: "value", autoOpen: false });
  }, [autoOpen, locked, focusStore, rule.id]);

  const commit = () => {
    if (locked || composing.current || state.draft === committed) return;
    actions.updateRule(rule.id, { value: state.draft as V });
  };

  return (
    <Input
      ref={inputRef}
      aria-label={field.label}
      placeholder={field.placeholder ?? actions.labels.valuePlaceholder}
      className="h-auto min-h-8 w-40 min-w-16 max-w-64 self-stretch rounded-none border-l-0 has-focus-visible:shadow-none"
      value={state.draft}
      readOnly={locked}
      disabled={actions.disabled}
      onFocus={() => focusStore.set({ id: rule.id, segment: "value", autoOpen: false })}
      onChange={(event) => setState({ committed, draft: event.target.value })}
      onBlur={commit}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        // Some IMEs finish composition after focus has already left the input.
        if (event.currentTarget !== document.activeElement && !locked) {
          const next = event.currentTarget.value;
          if (next !== committed) actions.updateRule(rule.id, { value: next as V });
        }
      }}
      onKeyDown={(event) => {
        // These keys belong to the input, not chip navigation or a parent form.
        if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setState({ committed, draft: committed });
        }
      }}
    />
  );
}
