"use client";

import { useCallback, useState } from "react";

/**
 * 为"自身没有 id 的列表项"维持一组稳定 UUID，常配合 @tanstack/react-form 的数组字段使用。
 * Tracks a stable UUID per item of a list whose items don't carry their own id.
 * Pair it with a @tanstack/react-form array field.
 *
 * - 调用方必须在调用 `field.pushValue` / `field.removeValue` / `field.moveValue` 的同时，
 *   调用本 hook 返回的 `push` / `remove` / `move`，让 id 与项按位置对齐。
 *   Caller must invoke the returned `push` / `remove` / `move` alongside the field
 *   methods so ids stay aligned to items by position.
 *
 * - 当字段被整体重置时（例如打开新的弹窗），传入变化的 `resetKey` 触发 id 重新生成，
 *   保证跨重置时拖拽过程不会因为 id 复用而错乱。
 *   Pass a `resetKey` that changes whenever the caller fully resets the field
 *   (e.g. dialog reopen with a different record). Ids regenerate on each reset.
 *
 * - 当 `currentCount` 与 ids 长度不一致时，做防御式重对齐——宁可换新 id 也不让列表错位。
 *   Defensive re-sync keeps ids aligned to `currentCount` if the caller forgets a
 *   helper call — better a fresh id than a mismatched list.
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
