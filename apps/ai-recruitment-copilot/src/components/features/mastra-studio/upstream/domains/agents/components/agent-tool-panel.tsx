import { Txt } from "@mastra/playground-ui/components/Txt";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useEffect } from "react";
import { parse } from "superjson";
import { z } from "zod3";
import { useAgent } from "../hooks/use-agent";
import { useExecuteAgentTool } from "../hooks/use-execute-agent-tool";
import { usePermissions } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-permissions";
import ToolExecutor from "@/components/features/mastra-studio/upstream/domains/tools/components/tool-executor";
import { resolveSerializedZodOutput } from "@/components/features/mastra-studio/upstream/lib/form/utils";
import { usePlaygroundStore } from "@/components/features/mastra-studio/upstream/store/playground-store";

export interface AgentToolPanelProps {
  toolId: string;
  agentId: string;
}

export const AgentToolPanel = ({ toolId, agentId }: AgentToolPanelProps) => {
  const { canExecute } = usePermissions();
  const canExecuteTool = canExecute("tools");

  const { data: agent, isLoading: isAgentLoading, error } = useAgent(agentId);

  const tool = Object.values(agent?.tools ?? {}).find(
    (candidateTool) => candidateTool.id === toolId,
  );

  const {
    mutateAsync: executeTool,
    isPending: isExecutingTool,
    data: result,
  } = useExecuteAgentTool();
  const { requestContext: playgroundRequestContext } = usePlaygroundStore();

  useEffect(() => {
    if (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to load agent";
      toast.error(`Error loading agent: ${errorMessage}`);
    }
  }, [error]);

  const handleExecuteTool = async (
    data: unknown,
    schemaRequestContext?: Record<string, unknown>,
  ) => {
    if (!tool) {
      return;
    }

    // Merge global playground request context with schema request context.
    // Schema values take precedence and explicitly override global values,
    // including when schema values are empty strings (user intentionally cleared them).
    const requestContext = {
      ...playgroundRequestContext,
      ...schemaRequestContext,
    };

    await executeTool({
      agentId,
      input: data,
      playgroundRequestContext: requestContext,
      toolId: tool.id,
    });
  };

  const zodInputSchema = tool?.inputSchema
    ? resolveSerializedZodOutput(
        parse(tool.inputSchema) as Parameters<typeof resolveSerializedZodOutput>[0],
      )
    : z.object({});

  if (isAgentLoading || error) {
    return null;
  }

  if (!tool) {
    return (
      <div className="py-12 text-center px-6">
        <Txt variant="header-md" className="text-neutral3">
          Tool not found
        </Txt>
      </div>
    );
  }

  if (!canExecuteTool) {
    return (
      <div className="py-12 text-center px-6">
        <Txt variant="ui-sm" className="text-neutral3">
          You don't have permission to execute tools.
        </Txt>
      </div>
    );
  }

  return (
    <ToolExecutor
      executionResult={result}
      isExecutingTool={isExecutingTool}
      zodInputSchema={zodInputSchema}
      handleExecuteTool={handleExecuteTool}
      toolDescription={tool.description}
      toolId={tool.id}
      requestContextSchema={tool.requestContextSchema}
    />
  );
};
