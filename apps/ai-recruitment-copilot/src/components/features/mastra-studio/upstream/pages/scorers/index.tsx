import { ErrorState } from "@mastra/playground-ui/components/ErrorState";
import { NoDataPageLayout, PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { useState } from "react";
import { ScorersToolbar } from "@/components/features/mastra-studio/upstream/domains/scores/components/scorers-list/scorers-toolbar";
import { NoScorersInfo } from "@/components/features/mastra-studio/upstream/domains/scores/components/scorers-list/no-scorers-info";
import { ScorersList } from "@/components/features/mastra-studio/upstream/domains/scores/components/scorers-list/scorers-list";
import { useScorers } from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-scorers";

export default function Scorers() {
  const { data: scorers = {}, isLoading, error } = useScorers();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");

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
        <PermissionDenied resource="评分器" />
      </NoDataPageLayout>
    );
  }

  if (error) {
    return (
      <NoDataPageLayout>
        <ErrorState title="加载评分器失败" message={error.message} />
      </NoDataPageLayout>
    );
  }

  if (Object.keys(scorers).length === 0 && !isLoading) {
    return (
      <NoDataPageLayout>
        <NoScorersInfo />
      </NoDataPageLayout>
    );
  }

  const hasFilters = sourceFilter !== "all" || search !== "";

  const resetFilters = () => {
    setSearch("");
    setSourceFilter("all");
  };

  return (
    <PageLayout>
      <PageLayout.TopArea>
        <ScorersToolbar
          search={search}
          onSearchChange={setSearch}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          onReset={resetFilters}
          hasActiveFilters={hasFilters}
        />
      </PageLayout.TopArea>

      <ScorersList
        scorers={scorers}
        isLoading={isLoading}
        search={search}
        sourceFilter={sourceFilter}
      />
    </PageLayout>
  );
}
