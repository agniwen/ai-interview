import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

export const useMastraPackages = () => {
  const client = useMastraClient();

  return useQuery({
    queryFn: () => client.getSystemPackages(),
    queryKey: ["mastra-packages"],
  });
};
