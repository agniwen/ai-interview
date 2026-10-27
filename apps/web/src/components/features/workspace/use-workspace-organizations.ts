import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/client/auth-client";

export function useWorkspaceOrganizations(enabled = true) {
  return useQuery({
    enabled,
    queryFn: async () => {
      const result = await authClient.organization.list();
      return result.data ?? [];
    },
    queryKey: ["organizations"],
  });
}
