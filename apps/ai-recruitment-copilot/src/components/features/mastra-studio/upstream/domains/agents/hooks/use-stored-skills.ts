import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

export function useStoredSkills(options?: { enabled?: boolean }) {
  const client = useMastraClient();

  return useQuery({
    enabled: options?.enabled !== false,
    queryFn: () => client.listStoredSkills(),
    queryKey: ["stored-skills"],
  });
}
