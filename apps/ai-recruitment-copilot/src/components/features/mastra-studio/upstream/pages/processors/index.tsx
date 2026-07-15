import { ErrorState } from "@mastra/playground-ui/components/ErrorState";
import { ListSearch } from "@mastra/playground-ui/components/ListSearch";
import { NoDataPageLayout, PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { useState } from "react";
import { NoProcessorsInfo } from "@/components/features/mastra-studio/upstream/domains/processors/components/processors-list/no-processors-info";
import { ProcessorsList } from "@/components/features/mastra-studio/upstream/domains/processors/components/processors-list/processors-list";
import { useProcessors } from "@/components/features/mastra-studio/upstream/domains/processors/hooks/use-processors";

export function Processors() {
  const { data: processors = {}, isLoading, error } = useProcessors();
  const [search, setSearch] = useState("");

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
        <PermissionDenied resource="处理器" />
      </NoDataPageLayout>
    );
  }

  if (error) {
    return (
      <NoDataPageLayout>
        <ErrorState title="加载处理器失败" message={error.message} />
      </NoDataPageLayout>
    );
  }

  if (Object.keys(processors).length === 0 && !isLoading) {
    return (
      <NoDataPageLayout>
        <NoProcessorsInfo />
      </NoDataPageLayout>
    );
  }

  return (
    <PageLayout>
      <PageLayout.TopArea>
        <div className="max-w-120">
          <ListSearch onSearch={setSearch} label="筛选处理器" placeholder="按名称筛选" />
        </div>
      </PageLayout.TopArea>

      <ProcessorsList processors={processors} isLoading={isLoading} search={search} />
    </PageLayout>
  );
}
