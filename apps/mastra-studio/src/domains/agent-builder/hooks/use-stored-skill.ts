import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

export function useStoredSkill(skillId: string | undefined) {
  const client = useMastraClient();

  return useQuery({
    enabled: !!skillId,
    queryFn: () => client.getStoredSkill(skillId!).details(),
    queryKey: ["stored-skill", skillId],
  });
}
