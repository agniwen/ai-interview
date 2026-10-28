"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

const StudioHeaderOverrideContext = createContext<ReactNode | null>(null);
const StudioHeaderOverrideSetterContext = createContext<
  ((override: ReactNode | null) => void) | null
>(null);
// 详情页/编辑页的页面级顶栏操作（如 Agent 入口）；一级页面的全局操作仍由 SiteHeader 决定。
// Page-level header actions for detail/editor pages; primary pages keep SiteHeader's global actions.
const StudioHeaderActionsContext = createContext<ReactNode | null>(null);
const StudioHeaderActionsSetterContext = createContext<
  ((actions: ReactNode | null) => void) | null
>(null);

export function StudioHeaderProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<ReactNode | null>(null);
  const [actions, setActions] = useState<ReactNode | null>(null);

  return (
    <StudioHeaderOverrideSetterContext.Provider value={setOverride}>
      <StudioHeaderOverrideContext.Provider value={override}>
        <StudioHeaderActionsSetterContext.Provider value={setActions}>
          <StudioHeaderActionsContext.Provider value={actions}>
            {children}
          </StudioHeaderActionsContext.Provider>
        </StudioHeaderActionsSetterContext.Provider>
      </StudioHeaderOverrideContext.Provider>
    </StudioHeaderOverrideSetterContext.Provider>
  );
}

export function useStudioHeaderOverride(override: ReactNode | null) {
  const setOverride = useContext(StudioHeaderOverrideSetterContext);

  useEffect(() => {
    if (!setOverride) {
      return;
    }

    setOverride(override);

    return () => {
      setOverride(null);
    };
  }, [override, setOverride]);
}

export function useStudioHeaderOverrideValue() {
  return useContext(StudioHeaderOverrideContext);
}

export function useStudioHeaderActions(actions: ReactNode | null) {
  const setActions = useContext(StudioHeaderActionsSetterContext);

  useEffect(() => {
    if (!setActions) {
      return;
    }

    setActions(actions);

    return () => {
      setActions(null);
    };
  }, [actions, setActions]);
}

export function useStudioHeaderActionsValue() {
  return useContext(StudioHeaderActionsContext);
}
