"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

const StudioHeaderOverrideContext = createContext<ReactNode | null>(null);
const StudioHeaderOverrideSetterContext = createContext<
  ((override: ReactNode | null) => void) | null
>(null);

export function StudioHeaderProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<ReactNode | null>(null);

  return (
    <StudioHeaderOverrideSetterContext.Provider value={setOverride}>
      <StudioHeaderOverrideContext.Provider value={override}>
        {children}
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
