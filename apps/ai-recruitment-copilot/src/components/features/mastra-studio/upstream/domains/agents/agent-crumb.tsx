import { useParams } from "@/components/features/mastra-studio/router/compat";
import { AgentCombobox } from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-combobox";

export function AgentCrumb() {
  const { agentId } = useParams<{ agentId: string }>();
  if (!agentId) {
    return null;
  }
  return <AgentCombobox value={agentId} variant="ghost" size="sm" />;
}

export function AgentToolCrumb(): string | null {
  const { toolId } = useParams() as { toolId?: string };
  return toolId ?? null;
}
