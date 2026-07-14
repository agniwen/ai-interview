import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";
import { usePlaygroundStore } from "@/components/features/mastra-studio/upstream/store/playground-store";

export interface UseAgentMessagesProps {
  threadId?: string;
  agentId: string;
  memory: boolean;
}
export const useAgentMessages = ({ threadId, agentId, memory }: UseAgentMessagesProps) => {
  const client = useMastraClient();
  const { requestContext } = usePlaygroundStore();

  return useQuery({
    enabled: memory && Boolean(threadId),
    gcTime: 0,
    queryFn: async () => {
      if (!threadId) {
        return null;
      }
      const result = await client.listThreadMessages(threadId, {
        agentId,
        includeSystemReminders: true,
        requestContext,
      });
      return result;
    },
    queryKey: ["memory", "messages", threadId, agentId, "requestContext"],
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 0,
  });
};
