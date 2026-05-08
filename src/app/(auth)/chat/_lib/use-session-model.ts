"use client";

import { useAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { chatModelByIdAtom, DRAFT_CHAT_KEY } from "../_atoms/model";

/**
 * 读写当前会话的模型选择；`chatId` 为 null 时落入 draft 槽。
 * 返回值结构与 `useState` 对齐，方便就地使用。
 *
 * Read/write the model selection scoped to the given conversation. When
 * `chatId` is null the value lives in the draft slot. The tuple shape mirrors
 * `useState` so it slots into existing call sites.
 */
export function useSessionModel(chatId: string | null): readonly [string, (id: string) => void] {
  const [byId, setById] = useAtom(chatModelByIdAtom);
  const key = chatId ?? DRAFT_CHAT_KEY;

  const value = useMemo(() => byId[key] ?? "", [byId, key]);

  const setModel = useCallback(
    (id: string) => {
      setById((prev) => {
        if (id) {
          return { ...prev, [key]: id };
        }
        // 解构剔除 key，避免 dynamic delete（lint 规则同时也利好 V8 fast-properties）。
        // Strip the key via destructuring rather than `delete` to keep V8's
        // fast-properties path and satisfy the no-dynamic-delete rule.
        const { [key]: _removed, ...rest } = prev;
        return rest;
      });
    },
    [key, setById],
  );

  return [value, setModel] as const;
}
