import type { ListStoredWorkspacesParams, ListStoredWorkspacesResponse } from "@mastra/client-js";
import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

/**
 * Hook to list stored workspaces from the database.
 * These are workspaces that have been persisted via the stored workspaces API,
 * as opposed to runtime-registered workspaces from code-defined agents.
 */
export const useStoredWorkspaces = (
  params?: ListStoredWorkspacesParams,
  options?: { enabled?: boolean },
) => {
  const client = useMastraClient();

  return useQuery({
    enabled: options?.enabled !== false,
    queryFn: async (): Promise<ListStoredWorkspacesResponse> => client.listStoredWorkspaces(params),
    queryKey: ["stored-workspaces", params],
  });
};
