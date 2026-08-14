import { Button } from "@mastra/playground-ui/components/Button";
import { ApiIcon } from "@mastra/playground-ui/icons/ApiIcon";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { CalendarClockIcon, EyeIcon } from "lucide-react";
import { Link } from "@/components/features/mastra-studio/router/compat";
import { useSchedules } from "@/components/features/mastra-studio/upstream/domains/schedules/hooks/use-schedules";
import { RouteHeaderActions } from "@/components/features/mastra-studio/upstream/lib/route-header";
import { EMBEDDED_MASTRA_API_PREFIX } from "@/components/features/mastra-studio/mastra-studio-config";

export function WorkflowHeader({
  workflowName,
  workflowId,
}: {
  workflowName: string;
  workflowId: string;
}) {
  const { data: schedules } = useSchedules({ workflowId });
  const scheduleCount = schedules?.length ?? 0;
  const singleSchedule = scheduleCount === 1 ? schedules?.[0] : undefined;
  const schedulesHref = singleSchedule
    ? `/workflows/schedules/${encodeURIComponent(singleSchedule.id)}`
    : `/workflows/schedules?workflowId=${encodeURIComponent(workflowId)}`;

  return (
    <RouteHeaderActions owner="workflow-detail">
      <div className="flex items-center gap-2">
        {scheduleCount > 0 && (
          <Button as={Link} to={schedulesHref} size="sm">
            <Icon>
              <CalendarClockIcon />
            </Icon>
            定时任务（{scheduleCount}）
          </Button>
        )}
        <Button
          as={Link}
          to={`/observability?entity=${encodeURIComponent(workflowName)}`}
          size="sm"
        >
          <Icon>
            <EyeIcon />
          </Icon>
          追踪
        </Button>
        <Button
          as="a"
          target="_blank"
          rel="noopener noreferrer"
          href={`${EMBEDDED_MASTRA_API_PREFIX}/swagger-ui`}
          variant="ghost"
          size="sm"
        >
          <ApiIcon />
          API 端点
        </Button>
      </div>
    </RouteHeaderActions>
  );
}
