import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { useAgentWorkingMemory } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-agent-working-memory";

interface AgentWorkingMemoryContextType {
  threadExists: boolean;
  workingMemoryData: string | null;
  workingMemorySource: "thread" | "resource";
  isLoading: boolean;
  isUpdating: boolean;
  updateWorkingMemory: (newMemory: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export const WorkingMemoryContext = createContext<AgentWorkingMemoryContextType>({
  isLoading: false,
  isUpdating: false,
  refetch: () => Promise.resolve(),
  threadExists: false,
  updateWorkingMemory: () => Promise.resolve(),
  workingMemoryData: null,
  workingMemorySource: "thread",
});

export interface AgentWorkingMemoryProviderProps {
  children: ReactNode;
  agentId: string;
  threadId: string;
  resourceId: string;
}

export function WorkingMemoryProvider({
  agentId,
  threadId,
  resourceId,
  children,
}: AgentWorkingMemoryProviderProps) {
  const value = useAgentWorkingMemory(agentId, threadId, resourceId);
  return <WorkingMemoryContext.Provider value={value}>{children}</WorkingMemoryContext.Provider>;
}

export function useWorkingMemory() {
  const ctx = useContext(WorkingMemoryContext);
  if (!ctx) {
    throw new Error("useWorkingMemory must be used within a WorkingMemoryProvider");
  }
  return ctx;
}
