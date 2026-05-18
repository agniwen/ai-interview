"use client";

/**
 * 「简历导入映射」状态切片：把 part id → interview id 的映射封装到 hook 中。
 * Resume-import mapping slice — encapsulates the part-id → interview-id mapping.
 *
 * 主组件原本要维护 `resumeImports` 与两个 setter，逻辑碎，难以测试。
 * 抽出后调用方只需要：`const { map, markImported, markMissing, replaceAll } = useResumeImports()`。
 *
 * The chat shell previously juggled `resumeImports` plus two setters by hand.
 * Pulling the slice out gives a tighter API: `markImported`, `markMissing`, `replaceAll`.
 */

import { useCallback, useState } from "react";

export interface UseResumeImportsResult {
  /** 当前映射；键为消息 part id，值为面试记录 id。 / Current map: part id → interview id. */
  map: Record<string, string>;
  /** 整体替换（例如打开历史会话时）。 / Replace the whole map (e.g. when loading a conversation). */
  replaceAll: (next: Record<string, string>) => void;
  /** 重置为空 / Reset to empty. */
  reset: () => void;
  /** 标记某 part 已成功导入到某面试记录 / Mark a part as imported into an interview. */
  markImported: (partId: string, interviewId: string) => void;
  /** 标记某 part 不再可用（例如对应的面试记录已被删除）。 / Mark a part as no longer importable. */
  markMissing: (partId: string) => void;
}

export function useResumeImports(): UseResumeImportsResult {
  const [map, setMap] = useState<Record<string, string>>({});

  const replaceAll = useCallback((next: Record<string, string>) => {
    setMap(next);
  }, []);

  const reset = useCallback(() => {
    setMap({});
  }, []);

  const markImported = useCallback((partId: string, interviewId: string) => {
    setMap((prev) => ({ ...prev, [partId]: interviewId }));
  }, []);

  const markMissing = useCallback((partId: string) => {
    setMap((prev) => {
      if (!(partId in prev)) {
        return prev;
      }
      const { [partId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  return { map, markImported, markMissing, replaceAll, reset };
}
