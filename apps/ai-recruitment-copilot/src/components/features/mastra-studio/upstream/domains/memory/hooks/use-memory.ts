import type { GetObservationalMemoryResponse, GetMemoryStatusResponse } from "@mastra/client-js";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useMastraClient } from "@mastra/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useMergedRequestContext } from "@/components/features/mastra-studio/upstream/domains/request-context";

import type { MemorySearchParams } from "@/components/features/mastra-studio/upstream/types/memory";

export const useMemory = (agentId?: string) => {
  const client = useMastraClient();
  const requestContext = useMergedRequestContext();

  return useQuery({
    enabled: Boolean(agentId),
    gcTime: 10 * 60 * 1000, // 10 minutes
    queryFn: () => (agentId ? client.getMemoryStatus(agentId, requestContext) : null),
    queryKey: ["memory", agentId, requestContext],
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes,
  });
};

export const useMemoryConfig = (agentId?: string) => {
  const client = useMastraClient();
  const requestContext = useMergedRequestContext();

  return useQuery({
    enabled: Boolean(agentId),
    gcTime: 10 * 60 * 1000, // 10 minutes
    queryFn: () => (agentId ? client.getMemoryConfig({ agentId, requestContext }) : null),
    queryKey: ["memory", "config", agentId, requestContext],
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes,
  });
};

export const useThread = ({ threadId, agentId }: { threadId?: string; agentId?: string }) => {
  const client = useMastraClient();
  const requestContext = useMergedRequestContext();

  return useQuery({
    enabled: Boolean(threadId) && threadId !== "new" && Boolean(agentId),
    gcTime: 10 * 60 * 1000,
    queryFn: () => client.getMemoryThread({ agentId, threadId: threadId! }).get({ requestContext }),
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
      toast.error("Failed to delete chat");
    },
    onSuccess: (_, variables) => {
      const { agentId } = variables;
      if (agentId) {
        void queryClient.invalidateQueries({ queryKey: ["memory", "threads", agentId, agentId] });
      }
      toast.success("Chat deleted successfully");
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
    mutationFn: async ({
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
    mutationFn: async ({
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
      toast.error("Failed to clone thread");
    },
    onSuccess: (_, variables) => {
      const { agentId } = variables;
      if (agentId) {
        void queryClient.invalidateQueries({ queryKey: ["memory", "threads", agentId, agentId] });
      }
      toast.success("Thread cloned successfully");
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
    gcTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: (previousData) => previousData, // Keep previous data during refetch to prevent skeleton flash
    queryFn: async () => {
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
    refetchInterval: isActive ? 2000 : false, // Poll every 2 seconds when active
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: isActive ? 1000 : 30 * 1000, // 1 second when active, 30 seconds otherwise
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
    gcTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: (previousData) => previousData, // Keep previous data during refetch to prevent skeleton flash
    queryFn: () =>
      agentId
        ? client.getMemoryStatus(agentId, requestContext, {
            resourceId,
            threadId,
          })
        : null,
    queryKey: ["memory-status", agentId, resourceId, threadId, requestContext],
    refetchInterval: isActive && pollWhenActive ? 2000 : false, // Poll every 2 seconds when active
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: isActive && pollWhenActive ? 1000 : 30 * 1000, // 1 second when active, 30 seconds otherwise
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
