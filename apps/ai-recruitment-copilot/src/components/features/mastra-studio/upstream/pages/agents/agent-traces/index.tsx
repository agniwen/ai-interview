import { EntityType } from "@mastra/core/observability";
import { useParams } from "@/components/features/mastra-studio/router/compat";
import TracesPage from "@/components/features/mastra-studio/upstream/pages/traces";

function AgentTraces() {
  const { agentId } = useParams();
  if (!agentId) {
    return null;
  }
  return <TracesPage scopedEntityId={agentId} scopedEntityType={EntityType.AGENT} />;
}

export default AgentTraces;
