import type { ScheduleResponse } from "@mastra/client-js";
import { DataList, DataListSkeleton } from "@mastra/playground-ui/components/DataList";
import { useMemo } from "react";
import { formatScheduleTimestamp, formatRelativeTime } from "../utils/format";
import { ScheduleStatusText } from "./schedule-status-badge";
import { WorkflowRunStatusInline } from "./workflow-run-status-inline";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export interface SchedulesListProps {
  schedules: ScheduleResponse[];
  isLoading: boolean;
  search?: string;
}

const COLUMNS = "minmax(0, 1.2fr) minmax(0, 1.4fr) minmax(0, 1fr) auto auto auto";

function renderLastRun(schedule: ScheduleResponse) {
  if (schedule.lastRun) {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <WorkflowRunStatusInline status={schedule.lastRun.status} />
        <span
          className="text-neutral4 text-ui-sm"
          title={formatScheduleTimestamp(schedule.lastFireAt)}
        >
          {schedule.lastFireAt ? formatRelativeTime(schedule.lastFireAt) : ""}
        </span>
      </span>
    );
  }

  if (schedule.lastFireAt) {
    return (
      <span className="whitespace-nowrap" title={formatScheduleTimestamp(schedule.lastFireAt)}>
        {formatRelativeTime(schedule.lastFireAt)}
      </span>
    );
  }

  return <span className="text-neutral4">从未运行</span>;
}

export function SchedulesList({ schedules, isLoading, search = "" }: SchedulesListProps) {
  const { paths, Link } = useLinkComponent();

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    if (!term) {
      return schedules;
    }
    return schedules.filter(
      (s) =>
        s.id.toLowerCase().includes(term) ||
        (s.workflowId ?? s.agentId ?? "").toLowerCase().includes(term),
    );
  }, [schedules, search]);

  if (isLoading) {
    return <DataListSkeleton columns={COLUMNS} />;
  }

  return (
    <DataList columns={COLUMNS} variant="striped" className="min-w-0">
      <DataList.Top>
        <DataList.TopCell>目标</DataList.TopCell>
        <DataList.TopCell>定时任务 ID</DataList.TopCell>
        <DataList.TopCell>Cron</DataList.TopCell>
        <DataList.TopCell>状态</DataList.TopCell>
        <DataList.TopCell>下次触发</DataList.TopCell>
        <DataList.TopCell>上次运行</DataList.TopCell>
      </DataList.Top>

      {filtered.length === 0 && search ? (
        <DataList.NoMatch message="没有符合搜索条件的定时任务" />
      ) : null}
      {filtered.length === 0 && !search ? <DataList.NoMatch message="尚未配置定时任务" /> : null}

      {filtered.map((s) => (
        <DataList.RowLink key={s.id} to={paths.scheduleLink(s.id)} LinkComponent={Link}>
          <DataList.NameCell>{s.workflowId ?? s.agentId}</DataList.NameCell>
          <DataList.Cell height="compact" className="min-w-0">
            <span className="block truncate font-mono text-ui-smd text-neutral3" title={s.id}>
              {s.id}
            </span>
          </DataList.Cell>
          <DataList.Cell height="compact">
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <code className="font-mono text-ui-sm">{s.cron}</code>
              {s.timezone ? <span className="text-neutral4 text-ui-xs">{s.timezone}</span> : null}
            </span>
          </DataList.Cell>
          <DataList.Cell height="compact">
            <ScheduleStatusText status={s.status} />
          </DataList.Cell>
          <DataList.Cell height="compact">
            <span className="whitespace-nowrap" title={formatScheduleTimestamp(s.nextFireAt)}>
              {formatRelativeTime(s.nextFireAt)}
            </span>
          </DataList.Cell>
          <DataList.Cell height="compact">{renderLastRun(s)}</DataList.Cell>
        </DataList.RowLink>
      ))}
    </DataList>
  );
}
