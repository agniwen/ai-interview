import { NoDataPageLayout, PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { useSearchParams } from "@/components/features/mastra-studio/router/compat";
import { SchedulesPage as SchedulesPageContent } from "@/components/features/mastra-studio/upstream/domains/schedules/components/schedules-page";
import { useSchedules } from "@/components/features/mastra-studio/upstream/domains/schedules/hooks/use-schedules";

export default function SchedulesPage() {
  const [searchParams] = useSearchParams();
  const workflowId = searchParams.get("workflowId") ?? undefined;
  const { error } = useSchedules(workflowId ? { workflowId } : {});

  if (error && is401UnauthorizedError(error)) {
    return (
      <NoDataPageLayout>
        <SessionExpired />
      </NoDataPageLayout>
    );
  }

  if (error && is403ForbiddenError(error)) {
    return (
      <NoDataPageLayout>
        <PermissionDenied resource="schedules" />
      </NoDataPageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="h-full">
        <SchedulesPageContent workflowId={workflowId} />
      </div>
    </PageLayout>
  );
}
