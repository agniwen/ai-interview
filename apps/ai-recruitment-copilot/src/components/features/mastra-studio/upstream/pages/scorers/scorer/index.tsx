import { Button } from "@mastra/playground-ui/components/Button";
import { ErrorState } from "@mastra/playground-ui/components/ErrorState";
import { PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { toast } from "@mastra/playground-ui/utils/toast";
import { PencilIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link,
  useParams,
  useSearchParams,
} from "@/components/features/mastra-studio/router/compat";
import { useAgents } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-agents";
import { NoScoresInfo } from "@/components/features/mastra-studio/upstream/domains/scores/components/no-scores-info";
import { ScoresList } from "@/components/features/mastra-studio/upstream/domains/scores/components/scores-list";
import { ScoresTools } from "@/components/features/mastra-studio/upstream/domains/scores/components/scores-tools";
import type { ScoreEntityOption as EntityOptions } from "@/components/features/mastra-studio/upstream/domains/scores/components/scores-tools";
import {
  useScorer,
  useScoresByScorerId,
} from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-scorers";
import { useWorkflows } from "@/components/features/mastra-studio/upstream/domains/workflows/hooks/use-workflows";
import { RouteHeaderActions } from "@/components/features/mastra-studio/upstream/lib/route-header";

type ScorerPageState = "content" | "empty" | "error" | "forbidden" | "unauthorized";

function getScoreEntityFilter(option: EntityOptions | undefined) {
  return {
    entityId: option?.value === "all" ? undefined : option?.value,
    entityType: option?.type === "ALL" ? undefined : option?.type,
  };
}

function getErrorMessage(...errors: unknown[]): string {
  for (const error of errors) {
    if (error instanceof Error) {
      return error.message;
    }
  }
  return "An unexpected error occurred";
}

function getScorerPageState({
  agentsError,
  hasFilterApplied,
  hasNoScores,
  scorerError,
  workflowsError,
}: {
  agentsError: unknown;
  hasFilterApplied: boolean;
  hasNoScores: boolean;
  scorerError: unknown;
  workflowsError: unknown;
}): ScorerPageState {
  if (
    is401UnauthorizedError(scorerError) ||
    is401UnauthorizedError(agentsError) ||
    is401UnauthorizedError(workflowsError)
  ) {
    return "unauthorized";
  }
  if (scorerError && is403ForbiddenError(scorerError)) {
    return "forbidden";
  }
  if (scorerError || agentsError || workflowsError) {
    return "error";
  }
  if (hasNoScores && !hasFilterApplied) {
    return "empty";
  }
  return "content";
}

function ScorerEmptyContent({ message, state }: { message: string; state: ScorerPageState }) {
  switch (state) {
    case "unauthorized": {
      return <SessionExpired />;
    }
    case "forbidden": {
      return <PermissionDenied resource="scorers" />;
    }
    case "error": {
      return <ErrorState title="Failed to load scorer" message={message} />;
    }
    default: {
      return <NoScoresInfo />;
    }
  }
}

function ScorerHeaderActions({ isStored, scorerId }: { isStored: boolean; scorerId: string }) {
  if (!isStored) {
    return null;
  }
  return (
    <RouteHeaderActions owner="scorer-detail">
      <Button variant="default" as={Link} to={`/cms/scorers/${scorerId}/edit`} size="sm">
        <PencilIcon /> Edit
      </Button>
    </RouteHeaderActions>
  );
}

export default function Scorer() {
  const { scorerId } = useParams() as { scorerId: string };
  const [searchParams, setSearchParams] = useSearchParams();
  const scoreIdFromUrl = searchParams.get("scoreId") ?? undefined;
  const [selectedScoreId, setSelectedScoreId] = useState<string | undefined>(scoreIdFromUrl);
  const [selectedEntityOption, setSelectedEntityOption] = useState<EntityOptions | undefined>({
    label: "All Entities",
    type: "ALL" as const,
    value: "all",
  });

  const { scorer, error: scorerError } = useScorer(scorerId);

  const { data: agents = {}, isLoading: isLoadingAgents, error: agentsError } = useAgents();
  const { isLoading: isLoadingWorkflows, error: workflowsError } = useWorkflows();
  const entityFilter = getScoreEntityFilter(selectedEntityOption);
  const {
    data: scores = [],
    isLoading: isLoadingScores,
    error: scoresError,
    isFetchingNextPage,
    hasNextPage,
    setEndOfListElement,
  } = useScoresByScorerId({
    ...entityFilter,
    scorerId,
  });

  const agentOptions: EntityOptions[] = useMemo(
    () =>
      scorer?.agentIds
        ?.filter((agentId) => agents[agentId])
        .map((agentId) => ({
          label: agents[agentId].name,
          type: "AGENT" as const,
          value: agentId,
        })) || [],
    [scorer?.agentIds, agents],
  );

  const workflowOptions: EntityOptions[] = useMemo(
    () =>
      scorer?.workflowIds?.map((workflowId) => ({
        label: workflowId,
        type: "WORKFLOW" as const,
        value: workflowId,
      })) || [],
    [scorer?.workflowIds],
  );

  const entityOptions: EntityOptions[] = useMemo(
    () => [
      { label: "All Entities", type: "ALL" as const, value: "all" },
      ...agentOptions,
      ...workflowOptions,
    ],
    [agentOptions, workflowOptions],
  );

  // Sync URL entity to state (treat missing ?entity as 'all' so browser back/forward resets the filter)
  const entityName = searchParams.get("entity") ?? "all";
  const matchedEntityOption = entityOptions.find((option) => option.value === entityName);
  useEffect(() => {
    if (matchedEntityOption && matchedEntityOption.value !== selectedEntityOption?.value) {
      setSelectedEntityOption(matchedEntityOption);
    }
  }, [matchedEntityOption, selectedEntityOption?.value]);

  useEffect(() => {
    if (scorerError) {
      const errorMessage =
        scorerError instanceof Error ? scorerError.message : "Failed to load scorer";
      toast.error(`Error loading scorer: ${errorMessage}`);
    }
  }, [scorerError]);

  useEffect(() => {
    if (agentsError) {
      const errorMessage =
        agentsError instanceof Error ? agentsError.message : "Failed to load agents";
      toast.error(`Error loading agents: ${errorMessage}`);
    }
  }, [agentsError]);

  useEffect(() => {
    if (workflowsError) {
      const errorMessage =
        workflowsError instanceof Error ? workflowsError.message : "Failed to load workflows";
      toast.error(`Error loading workflows: ${errorMessage}`);
    }
  }, [workflowsError]);

  const handleSelectedEntityChange = (option: EntityOptions | undefined) => {
    if (!option?.value) {
      return;
    }

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("entity", option.value);
      return next;
    });
  };

  // Sync URL → state when scoreId in URL changes externally (e.g. browser back/forward)
  useEffect(() => {
    const urlScoreId = searchParams.get("scoreId") ?? undefined;

    if (urlScoreId === selectedScoreId) {
      return;
    }

    if (!urlScoreId) {
      setSelectedScoreId(undefined);
      return;
    }

    const matchingScore = scores.find((score) => score.id === urlScoreId);
    if (!matchingScore) {
      return;
    }

    setSelectedScoreId(urlScoreId);
  }, [scores, searchParams, selectedScoreId]);

  const handleScoreClick = useCallback(
    (id: string) => {
      setSelectedScoreId(id || undefined);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (id) {
          next.set("scoreId", id);
        } else {
          next.delete("scoreId");
        }
        return next;
      });
    },
    [setSearchParams],
  );

  if (!scorer) {
    return null;
  }

  const hasNoScores = !isLoadingScores && scores.length === 0;
  const hasFilterApplied = selectedEntityOption?.value !== "all";
  const pageState = getScorerPageState({
    agentsError,
    hasFilterApplied,
    hasNoScores,
    scorerError,
    workflowsError,
  });
  const scorerHeaderActions = (
    <ScorerHeaderActions isStored={scorer.scorer?.source === "stored"} scorerId={scorerId} />
  );

  if (pageState !== "content") {
    const errorMessage = getErrorMessage(scorerError, agentsError, workflowsError);

    return (
      <PageLayout width="wide" height="full">
        {scorerHeaderActions}
        <PageLayout.MainArea isCentered>
          <ScorerEmptyContent message={errorMessage} state={pageState} />
        </PageLayout.MainArea>
      </PageLayout>
    );
  }

  return (
    <PageLayout width="wide">
      {scorerHeaderActions}
      <PageLayout.TopArea>
        <ScoresTools
          selectedEntity={selectedEntityOption}
          entityOptions={entityOptions}
          onEntityChange={handleSelectedEntityChange}
          onReset={() => {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set("entity", "all");
              return next;
            });
          }}
          isLoading={isLoadingScores || isLoadingAgents || isLoadingWorkflows}
        />
      </PageLayout.TopArea>

      <ScoresList
        scores={scores}
        isLoading={isLoadingScores}
        selectedScoreId={selectedScoreId}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        setEndOfListElement={setEndOfListElement}
        onScoreClick={handleScoreClick}
        errorMsg={scoresError?.message}
      />
    </PageLayout>
  );
}
