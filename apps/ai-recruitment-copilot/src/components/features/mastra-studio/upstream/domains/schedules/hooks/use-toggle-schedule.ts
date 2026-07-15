import type { ScheduleResponse } from "@mastra/client-js";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useMastraClient } from "@mastra/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Pause/resume a schedule. Used by the schedule detail page button.
 *
 * On success invalidates `['schedule', scheduleId]` and `['schedules']` so the
 * detail meta strip and the list view both refresh.
 */
export const useToggleSchedule = (scheduleId: string | undefined) => {
  const client = useMastraClient();
  const queryClient = useQueryClient();

  return useMutation<ScheduleResponse, Error, "pause" | "resume">({
    mutationFn: async (action) => {
      if (!scheduleId) {
        throw new Error("必须提供定时任务 ID");
      }
      return action === "pause"
        ? await client.pauseSchedule(scheduleId)
        : await client.resumeSchedule(scheduleId);
    },
    onError: (error) => {
      toast.error(error.message);
    },
    onSuccess: (_, action) => {
      void queryClient.invalidateQueries({ queryKey: ["schedule", scheduleId] });
      void queryClient.invalidateQueries({ queryKey: ["schedules"] });
      toast.success(action === "pause" ? "定时任务已暂停" : "定时任务已恢复");
    },
  });
};
