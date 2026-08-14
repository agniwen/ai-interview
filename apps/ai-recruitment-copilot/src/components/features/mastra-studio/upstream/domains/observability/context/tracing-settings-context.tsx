import type { TracingOptions } from "@mastra/core/observability";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { useTracingSettingsState } from "../hooks/use-tracing-settings-state";

export interface TracingSettings {
  tracingOptions?: TracingOptions;
}

export interface TracingSettingsContextType {
  setSettings: (settings: TracingSettings) => void;
  resetAll: () => void;
  settings?: TracingSettings;
  entityType?: "workflow" | "agent";
}

export const TracingSettingsContext = createContext<TracingSettingsContextType>({
  entityType: undefined,
  resetAll: () => {
    /* empty */
  },
  setSettings: () => {
    /* empty */
  },
  settings: undefined,
});

export interface TracingSettingsProviderProps {
  children: ReactNode;
  entityId: string;
  entityType: "workflow" | "agent";
}

export const TracingSettingsProvider = ({
  children,
  entityId,
  entityType,
}: TracingSettingsProviderProps) => {
  const state = useTracingSettingsState({ entityId, entityType });

  return (
    <TracingSettingsContext.Provider value={state}>{children}</TracingSettingsContext.Provider>
  );
};

export const useTracingSettings = () => useContext(TracingSettingsContext);
