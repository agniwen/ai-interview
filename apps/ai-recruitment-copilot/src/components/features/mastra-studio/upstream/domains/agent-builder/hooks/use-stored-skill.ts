import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

export function useStoredSkill(skillId: string | undefined) {
  const client = useMastraClient();

  return useQuery({
    enabled: !!skillId,
    queryFn: () => {
      if (!skillId) {
        throw new Error("A skill id is required");
      }
      return client.getStoredSkill(skillId).details();
    },
    queryKey: ["stored-skill", skillId],
  });
}
