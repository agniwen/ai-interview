import type { ScheduleResponse } from "@mastra/client-js";
import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

export const useSchedule = (scheduleId: string | undefined) => {
  const client = useMastraClient();

  return useQuery<ScheduleResponse>({
    enabled: !!scheduleId,
    queryFn: async () => {
      if (!scheduleId) {
        throw new Error("必须提供定时任务 ID");
      }
      return await client.getSchedule(scheduleId);
    },
    queryKey: ["schedule", scheduleId],
  });
};
