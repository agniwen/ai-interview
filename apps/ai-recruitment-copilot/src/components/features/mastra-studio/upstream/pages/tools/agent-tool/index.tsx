import { useParams } from "@/components/features/mastra-studio/router/compat";
import { AgentToolPanel } from "@/components/features/mastra-studio/upstream/domains/agents/components/AgentToolPanel";

const AgentTool = () => {
  const { toolId, agentId } = useParams();

  return (
    <div className="h-full w-full overflow-y-auto">
      <AgentToolPanel toolId={toolId!} agentId={agentId!} />
    </div>
  );
};

export default AgentTool;
