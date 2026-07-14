import { Skeleton } from "@mastra/playground-ui/components/Skeleton";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useMemo, useEffect } from "react";
import { parse } from "superjson";
import { z } from "zod3";
import ToolExecutor from "./tool-executor";
import { useAgents } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-agents";
import { usePermissions } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-permissions";
import { useTool } from "@/components/features/mastra-studio/upstream/domains/tools/hooks/use-all-tools";
import { useExecuteTool } from "@/components/features/mastra-studio/upstream/domains/tools/hooks/use-execute-tool";
import { resolveSerializedZodOutput } from "@/components/features/mastra-studio/upstream/lib/form/utils";
import { usePlaygroundStore } from "@/components/features/mastra-studio/upstream/store/playground-store";

export interface ToolPanelProps {
  toolId: string;
}

export const ToolPanel = ({ toolId }: ToolPanelProps) => {
  const { canExecute } = usePermissions();
  const canExecuteTool = canExecute("tools");

  const { data: agents = {} } = useAgents();

  // Check if tool exists in any agent's tools
  const agentTool = useMemo(() => {
    for (const agent of Object.values(agents)) {
      if (agent.tools) {
        const tool = Object.values(agent.tools).find((t) => t.id === toolId);
        if (tool) {
          return tool;
        }
      }
    }
    return null;
  }, [agents, toolId]);

  // Only fetch from API if tool not found in agents
  const { data: apiTool, isLoading, error } = useTool(toolId, { enabled: !agentTool });

  const tool = agentTool || apiTool;

  const { mutateAsync: executeTool, isPending: isExecuting, data: result } = useExecuteTool();
  const { requestContext: playgroundRequestContext } = usePlaygroundStore();

  useEffect(() => {
    if (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to load tool";
      toast.error(`Error loading tool: ${errorMessage}`);
    }
  }, [error]);

  const handleExecuteTool = (
    data: Record<string, unknown>,
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

    return executeTool({
      input: data,
      requestContext,
      toolId: tool.id,
    });
  };

  const zodInputSchema = tool?.inputSchema
    ? resolveSerializedZodOutput(
        parse(tool.inputSchema) as Parameters<typeof resolveSerializedZodOutput>[0],
      )
    : z.object({});

  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
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
      isExecutingTool={isExecuting}
      zodInputSchema={zodInputSchema}
      handleExecuteTool={handleExecuteTool}
      toolDescription={tool.description}
      toolId={tool.id}
      requestContextSchema={tool.requestContextSchema}
    />
  );
};
