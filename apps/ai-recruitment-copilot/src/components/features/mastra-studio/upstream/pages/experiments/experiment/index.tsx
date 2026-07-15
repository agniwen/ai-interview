import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { ErrorState } from "@mastra/playground-ui/components/ErrorState";
import { PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import {
  is401UnauthorizedError,
  is403ForbiddenError,
  is404NotFoundError,
} from "@mastra/playground-ui/utils/errors";
import { ArrowLeft, PlayCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "@/components/features/mastra-studio/router/compat";
import {
  useDatasetExperiment,
  useDatasetExperimentResults,
} from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-experiments";
import { useExperiments } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-experiments";
import { ExperimentPageTabs } from "@/components/features/mastra-studio/upstream/domains/experiments/components/experiment-page-tabs";
import { ExperimentTopArea } from "@/components/features/mastra-studio/upstream/domains/experiments/components/experiment-top-area";

function ExperimentPageShell({ children }: { children?: ReactNode }) {
  return (
    <PageLayout height="full">
      <div />
      <PageLayout.MainArea isCentered>{children}</PageLayout.MainArea>
    </PageLayout>
  );
}

interface ExperimentFallbackOptions {
  datasetId: string;
  experiment?: { id: string };
  experimentError: unknown;
  experimentId?: string;
  experimentLoading: boolean;
  experimentsListLoading: boolean;
}

function getExperimentFallback({
  datasetId,
  experiment,
  experimentError,
  experimentId,
  experimentLoading,
  experimentsListLoading,
}: ExperimentFallbackOptions): ReactNode | undefined {
  if (!experimentId || experimentsListLoading || experimentLoading) {
    return null;
  }
  if (experimentError && is401UnauthorizedError(experimentError)) {
    return (
      <ExperimentPageShell>
        <SessionExpired />
      </ExperimentPageShell>
    );
  }
  if (experimentError && is403ForbiddenError(experimentError)) {
    return (
      <ExperimentPageShell>
        <PermissionDenied resource="数据集" />
      </ExperimentPageShell>
    );
  }
  if ((experimentError && is404NotFoundError(experimentError)) || !datasetId || !experiment) {
    return (
      <ExperimentPageShell>
        <EmptyState
          iconSlot={<PlayCircle />}
          titleSlot="未找到实验"
          descriptionSlot={`未找到 ID 为“${experimentId}”的实验。`}
          actionSlot={
            <Button as={Link} to="/experiments">
              <ArrowLeft />
              返回实验
            </Button>
          }
        />
      </ExperimentPageShell>
    );
  }
  if (experimentError) {
    return (
      <ExperimentPageShell>
        <ErrorState
          title="加载实验失败"
          message={
            experimentError instanceof Error ? experimentError.message : "发生意外错误，请重试。"
          }
        />
      </ExperimentPageShell>
    );
  }
  return undefined;
}

function ExperimentPage() {
  const { experimentId } = useParams<{ experimentId: string }>();

  // Resolve datasetId from experimentId (the URL has only the experiment id).
  const { data: experimentsData, isLoading: experimentsListLoading } = useExperiments();
  const matchedExperiment = experimentsData?.experiments?.find((e) => e.id === experimentId);
  const datasetId = matchedExperiment?.datasetId ?? "";

  const {
    data: experiment,
    isLoading: experimentLoading,
    error: experimentError,
  } = useDatasetExperiment(datasetId, experimentId ?? "");

  const {
    data: results,
    isLoading: resultsLoading,
    setEndOfListElement,
    isFetchingNextPage,
    hasNextPage,
  } = useDatasetExperimentResults({
    datasetId,
    experimentId: experimentId ?? "",
    experimentStatus: experiment?.status,
  });

  const fallback = getExperimentFallback({
    datasetId,
    experiment,
    experimentError,
    experimentId,
    experimentLoading,
    experimentsListLoading,
  });
  if (fallback !== undefined) {
    return fallback;
  }
  if (!experiment || !experimentId) {
    return null;
  }

  return (
    <PageLayout height="full">
      <ExperimentTopArea experiment={experiment} />

      <PageLayout.MainArea>
        <ExperimentPageTabs
          experimentId={experimentId}
          datasetId={datasetId}
          experimentStatus={experiment.status}
          results={results ?? []}
          isLoading={resultsLoading}
          setEndOfListElement={setEndOfListElement}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
        />
      </PageLayout.MainArea>
    </PageLayout>
  );
}

export { ExperimentPage };
export default ExperimentPage;
