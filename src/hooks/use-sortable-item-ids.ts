"use client";

import { useCallback, useState } from "react";

/**
 * Tracks a stable UUID per item of a list whose items don't carry their own
 * id. Pair it with a @tanstack/react-form array field:
 *
 * - Caller must invoke the returned `push` / `remove` / `move` alongside
 *   `field.pushValue` / `field.removeValue` / `field.moveValue` so ids stay
 *   aligned to items by position.
 * - Pass `resetKey` that changes whenever the caller fully resets the field
 *   (e.g. dialog reopen with a different record). Ids regenerate fresh on
 *   each reset, preserving drag-in-progress stability between resets.
 * - A defensive re-sync keeps ids aligned to `currentCount` if the caller
 *   forgets a helper call — better a fresh id than a mismatched list.
 */
export function useSortableItemIds(
  currentCount: number,
  resetKey: unknown,
): {
  ids: string[];
  push: () => void;
  remove: (index: number) => void;
  move: (from: number, to: number) => void;
} {
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  const [ids, setIds] = useState<string[]>(() =>
    Array.from({ length: currentCount }, () => crypto.randomUUID()),
  );

  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setIds(Array.from({ length: currentCount }, () => crypto.randomUUID()));
  } else if (ids.length !== currentCount) {
    // Defensive resync: caller forgot to call push/remove in lockstep.
    // Pad with new uuids or truncate from the tail.
    if (currentCount > ids.length) {
      setIds([
        ...ids,
        ...Array.from({ length: currentCount - ids.length }, () => crypto.randomUUID()),
      ]);
    } else {
      setIds(ids.slice(0, currentCount));
    }
  }

  const push = useCallback(() => {
    setIds((prev) => [...prev, crypto.randomUUID()]);
  }, []);

  const remove = useCallback((index: number) => {
    setIds((prev) => prev.toSpliced(index, 1));
  }, []);

  const move = useCallback((from: number, to: number) => {
    setIds((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) {
        return prev;
      }
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      if (moved === undefined) {
        return prev;
      }
      copy.splice(to, 0, moved);
      return copy;
    });
  }, []);

  return { ids, move, push, remove };
}
