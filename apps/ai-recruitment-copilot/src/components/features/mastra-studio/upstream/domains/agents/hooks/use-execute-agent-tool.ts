import { RequestContext } from "@mastra/core/di";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useMastraClient } from "@mastra/react";
import { useMutation } from "@tanstack/react-query";

export interface ExecuteToolInput {
  agentId: string;
  toolId: string;
  input: unknown;
  playgroundRequestContext?: Record<string, unknown>;
}

export const useExecuteAgentTool = () => {
  const client = useMastraClient();
  return useMutation({
    mutationFn: async ({ agentId, toolId, input, playgroundRequestContext }: ExecuteToolInput) => {
      const requestContext = new RequestContext();
      for (const [key, value] of Object.entries(playgroundRequestContext ?? {})) {
        requestContext.set(key, value);
      }
      try {
        const agent = client.getAgent(agentId);
        const response = await agent.executeTool(toolId, { data: input, requestContext });

        return response;
      } catch (error) {
        toast.error("Error executing agent tool");
        console.error("Error executing tool:", error);
        throw error;
      }
    },
  });
};
