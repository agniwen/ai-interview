import { useParams } from "@/components/features/mastra-studio/router/compat";
import { AgentToolPanel } from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-tool-panel";

const AgentTool = () => {
  const { toolId, agentId } = useParams();
  const resolvedAgentId = agentId ?? "";
  const resolvedToolId = toolId ?? "";

  return (
    <div className="h-full w-full overflow-y-auto">
      <AgentToolPanel toolId={resolvedToolId} agentId={resolvedAgentId} />
    </div>
  );
};

export default AgentTool;
