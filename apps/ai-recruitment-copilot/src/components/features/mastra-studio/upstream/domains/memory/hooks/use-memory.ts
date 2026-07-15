import type { GetObservationalMemoryResponse, GetMemoryStatusResponse } from "@mastra/client-js";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useMastraClient } from "@mastra/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useMergedRequestContext } from "@/components/features/mastra-studio/upstream/domains/request-context/context/schema-request-context";

import type { MemorySearchParams } from "@/components/features/mastra-studio/upstream/types/memory";

export const useMemory = (agentId?: string) => {
  const client = useMastraClient();
  const requestContext = useMergedRequestContext();

  return useQuery({
    enabled: Boolean(agentId),
    // 10 minutes.
    gcTime: 10 * 60 * 1000,
    queryFn: () => (agentId ? client.getMemoryStatus(agentId, requestContext) : null),
    queryKey: ["memory", agentId, requestContext],
    retry: false,
    // 5 minutes.
    staleTime: 5 * 60 * 1000,
  });
};

export const useMemoryConfig = (agentId?: string) => {
  const client = useMastraClient();
  const requestContext = useMergedRequestContext();

  return useQuery({
    enabled: Boolean(agentId),
    // 10 minutes.
    gcTime: 10 * 60 * 1000,
    queryFn: () => (agentId ? client.getMemoryConfig({ agentId, requestContext }) : null),
    queryKey: ["memory", "config", agentId, requestContext],
    refetchOnWindowFocus: false,
    retry: false,
    // 5 minutes.
    staleTime: 5 * 60 * 1000,
  });
};

export const useThread = ({ threadId, agentId }: { threadId?: string; agentId?: string }) => {
  const client = useMastraClient();
  const requestContext = useMergedRequestContext();

  return useQuery({
    enabled: Boolean(threadId) && threadId !== "new" && Boolean(agentId),
    gcTime: 10 * 60 * 1000,
    queryFn: () => {
      if (!threadId) {
        return null;
      }
      return client.getMemoryThread({ agentId, threadId }).get({ requestContext });
    },
    queryKey: ["memory", "thread", threadId, agentId, requestContext],
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
};

export const useThreads = ({
  resourceId,
  agentId,
  isMemoryEnabled,
}: {
  resourceId: string;
  agentId: string;
  isMemoryEnabled: boolean;
}) => {
  const client = useMastraClient();
  const requestContext = useMergedRequestContext();

  return useQuery({
    enabled: Boolean(isMemoryEnabled),
    gcTime: 0,
    queryFn: async () => {
      if (!isMemoryEnabled) {
        return null;
      }
      const result = await client.listMemoryThreads({ agentId, requestContext, resourceId });
      return result.threads;
    },
    queryKey: ["memory", "threads", resourceId, agentId, requestContext],
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 0,
  });
};

export const useDeleteThread = () => {
  const client = useMastraClient();
  const queryClient = useQueryClient();
  const requestContext = useMergedRequestContext();

  return useMutation({
    mutationFn: ({ threadId, agentId }: { threadId: string; agentId: string }) => {
      const thread = client.getMemoryThread({ agentId, threadId });
      return thread.delete({ requestContext });
    },
    onError: () => {
      toast.error("删除对话失败");
    },
    onSuccess: (_, variables) => {
      const { agentId } = variables;
      if (agentId) {
        void queryClient.invalidateQueries({ queryKey: ["memory", "threads", agentId, agentId] });
      }
      toast.success("对话已删除");
    },
  });
};

export const useMemorySearch = ({
  agentId,
  resourceId,
  threadId,
}: {
  agentId: string;
  resourceId: string;
  threadId?: string;
}) => {
  const requestContext = useMergedRequestContext();
  const client = useMastraClient();
  return useMutation({
    mutationFn: ({
      searchQuery,
      memoryConfig,
    }: {
      searchQuery: string;
      memoryConfig?: MemorySearchParams;
    }) =>
      client.searchMemory({
        agentId,
        memoryConfig,
        requestContext,
        resourceId,
        searchQuery,
        threadId,
      }),
  });
};

export const useCloneThread = () => {
  const client = useMastraClient();
  const queryClient = useQueryClient();
  const requestContext = useMergedRequestContext();

  return useMutation({
    mutationFn: ({
      threadId,
      agentId,
      title,
    }: {
      threadId: string;
      agentId: string;
      title?: string;
    }) => {
      const thread = client.getMemoryThread({ agentId, threadId });
      return thread.clone({ requestContext, title });
    },
    onError: () => {
      toast.error("克隆会话失败");
    },
    onSuccess: (_, variables) => {
      const { agentId } = variables;
      if (agentId) {
        void queryClient.invalidateQueries({ queryKey: ["memory", "threads", agentId, agentId] });
      }
      toast.success("会话已克隆");
    },
  });
};

/**
 * Hook to fetch Observational Memory data for an agent
 * Returns the current OM record and history for a given resource/thread
 * Polls more frequently when observing/reflecting is in progress
 */
export const useObservationalMemory = ({
  agentId,
  resourceId,
  threadId,
  enabled = true,
  isActive = false,
}: {
  agentId: string;
  resourceId?: string;
  threadId?: string;
  enabled?: boolean;
  isActive?: boolean;
}) => {
  const client = useMastraClient();
  const requestContext = useMergedRequestContext();

  return useQuery<GetObservationalMemoryResponse | null>({
    enabled: enabled && Boolean(agentId) && (Boolean(resourceId) || Boolean(threadId)),
    // 5 minutes.
    gcTime: 5 * 60 * 1000,
    // Keep previous data during refetch to prevent skeleton flash.
    placeholderData: (previousData) => previousData,
    queryFn: () => {
      if (!resourceId && !threadId) {
        return null;
      }
      return client.getObservationalMemory({
        agentId,
        requestContext,
        resourceId,
        threadId,
      });
    },
    queryKey: ["observational-memory", agentId, resourceId, threadId, requestContext],
    // Poll every 2 seconds when active.
    refetchInterval: isActive ? 2000 : false,
    refetchOnWindowFocus: false,
    retry: false,
    // 1 second when active, 30 seconds otherwise.
    staleTime: isActive ? 1000 : 30 * 1000,
  });
};

/**
 * Hook to get OM-aware memory status
 * Extends useMemory with OM-specific status information
 * Polls more frequently when observing/reflecting is in progress
 */
export const useMemoryWithOMStatus = ({
  agentId,
  resourceId,
  threadId,
  pollWhenActive = true,
}: {
  agentId?: string;
  resourceId?: string;
  threadId?: string;
  pollWhenActive?: boolean;
}) => {
  const client = useMastraClient();
  const requestContext = useMergedRequestContext();
  const [isActive, setIsActive] = useState(false);

  const query = useQuery<GetMemoryStatusResponse | null>({
    enabled: Boolean(agentId),
    // 5 minutes.
    gcTime: 5 * 60 * 1000,
    // Keep previous data during refetch to prevent skeleton flash.
    placeholderData: (previousData) => previousData,
    queryFn: () =>
      agentId
        ? client.getMemoryStatus(agentId, requestContext, {
            resourceId,
            threadId,
          })
        : null,
    queryKey: ["memory-status", agentId, resourceId, threadId, requestContext],
    // Poll every 2 seconds when active.
    refetchInterval: isActive && pollWhenActive ? 2000 : false,
    refetchOnWindowFocus: false,
    retry: false,
    // 1 second when active, 30 seconds otherwise.
    staleTime: isActive && pollWhenActive ? 1000 : 30 * 1000,
  });

  // Update isActive state when data changes
  const isObserving = query.data?.observationalMemory?.isObserving;
  const isReflecting = query.data?.observationalMemory?.isReflecting;

  useEffect(() => {
    const newIsActive = isObserving || isReflecting || false;
    setIsActive(newIsActive);
  }, [isObserving, isReflecting]);

  return query;
};
