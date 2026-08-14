import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { useAgentSettingsState } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-agent-settings-state";
import type { AgentSettingsType as AgentSettings } from "@/components/features/mastra-studio/upstream/types";

interface AgentContextType {
  settings?: AgentSettings;
  setSettings: (settings: AgentSettings) => void;
  resetAll: () => void;
}

export const AgentSettingsContext = createContext<AgentContextType>({} as AgentContextType);

export interface AgentSettingsProviderProps {
  children: ReactNode;
  agentId: string;
  defaultSettings?: AgentSettings;
}

export function AgentSettingsProvider({
  children,
  agentId,
  defaultSettings,
}: AgentSettingsProviderProps) {
  const { settings, setSettings, resetAll } = useAgentSettingsState({
    agentId,
    defaultSettings,
  });

  return (
    <AgentSettingsContext.Provider
      value={{
        resetAll,
        setSettings,
        settings,
      }}
    >
      {children}
    </AgentSettingsContext.Provider>
  );
}

export const useAgentSettings = () => useContext(AgentSettingsContext);
