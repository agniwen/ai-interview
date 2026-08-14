import type {
  ReorderModelListParams,
  UpdateModelInModelListParams,
  UpdateModelParams,
} from "@mastra/client-js";
import { useMastraClient } from "@mastra/react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlaygroundStore } from "@/components/features/mastra-studio/upstream/store/playground-store";

export const useAgents = (options?: { enabled?: boolean }) => {
  const client = useMastraClient();
  const { requestContext } = usePlaygroundStore();

  return useQuery({
    enabled: options?.enabled !== false,
    queryFn: () => client.listAgents(requestContext),
    queryKey: ["agents", requestContext],
  });
};

export const useUpdateAgentModel = (agentId: string) => {
  const client = useMastraClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateModelParams) => client.getAgent(agentId).updateModel(payload),
    onError: (err) => {
      console.error("Error updating model", err);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
    },
  });
};

export const useReorderModelList = (agentId: string) => {
  const client = useMastraClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ReorderModelListParams) =>
      client.getAgent(agentId).reorderModelList(payload),
    onError: (err) => {
      console.error("Error reordering model list", err);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
    },
  });
};

export const useUpdateModelInModelList = (agentId: string) => {
  const client = useMastraClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateModelInModelListParams) =>
      client.getAgent(agentId).updateModelInModelList(payload),
    onError: (err) => {
      console.error("Error updating model in model list", err);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
    },
  });
};

export const useResetAgentModel = (agentId: string) => {
  const client = useMastraClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => client.getAgent(agentId).resetModel(),
    onError: (err) => {
      console.error("Error resetting model", err);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
    },
  });
};
