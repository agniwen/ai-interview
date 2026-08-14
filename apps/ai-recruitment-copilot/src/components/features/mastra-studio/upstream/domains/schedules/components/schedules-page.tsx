import { ErrorState } from "@mastra/playground-ui/components/ErrorState";
import { ListSearch } from "@mastra/playground-ui/components/ListSearch";
import { useState } from "react";
import { useSchedules } from "../hooks/use-schedules";
import { SchedulesList } from "./schedules-list";

export function SchedulesPage({ workflowId }: { workflowId?: string } = {}) {
  const { data: schedules, isLoading, error } = useSchedules(workflowId ? { workflowId } : {});
  const [search, setSearch] = useState("");

  if (error) {
    return <ErrorState title="加载定时任务失败" message={error.message} />;
  }

  return (
    <div className="grid grid-rows-[auto_1fr] gap-4 h-full overflow-hidden">
      <div className="max-w-120">
        <ListSearch onSearch={setSearch} label="筛选定时任务" placeholder="按 ID 或工作流筛选" />
      </div>
      <div className="overflow-y-auto">
        <SchedulesList schedules={schedules ?? []} isLoading={isLoading} search={search} />
      </div>
    </div>
  );
}
