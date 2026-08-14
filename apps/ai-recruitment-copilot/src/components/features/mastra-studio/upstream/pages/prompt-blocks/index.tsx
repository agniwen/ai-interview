import { Button } from "@mastra/playground-ui/components/Button";
import { ErrorState } from "@mastra/playground-ui/components/ErrorState";
import { ListSearch } from "@mastra/playground-ui/components/ListSearch";
import { NoDataPageLayout, PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "@/components/features/mastra-studio/router/compat";
import { useIsCmsAvailable } from "@/components/features/mastra-studio/upstream/domains/cms/hooks/use-is-cms-available";
import {
  useStoredPromptBlocks,
  PromptsList,
  NoPromptBlocksInfo,
} from "@/components/features/mastra-studio/upstream/domains/prompt-blocks";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export default function PromptBlocks() {
  const { paths } = useLinkComponent();
  const { data, isLoading, error } = useStoredPromptBlocks();
  const { isCmsAvailable } = useIsCmsAvailable();
  const [search, setSearch] = useState("");

  const promptBlocks = data?.promptBlocks ?? [];

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
        <PermissionDenied resource="提示词块" />
      </NoDataPageLayout>
    );
  }

  if (error) {
    return (
      <NoDataPageLayout>
        <ErrorState title="加载提示词块失败" message={error.message} />
      </NoDataPageLayout>
    );
  }

  if (promptBlocks.length === 0 && !isLoading) {
    return (
      <NoDataPageLayout>
        <NoPromptBlocksInfo />
      </NoDataPageLayout>
    );
  }

  return (
    <PageLayout>
      <PageLayout.TopArea>
        <PageLayout.Row align="center" stack="responsive">
          <div className="max-w-120 flex-1">
            <ListSearch onSearch={setSearch} label="筛选提示词" placeholder="按名称或描述筛选" />
          </div>
          {isCmsAvailable && (
            <Button
              as={Link}
              to={paths.cmsPromptBlockCreateLink()}
              variant="primary"
              className="shrink-0"
            >
              <Plus />
              创建提示词
            </Button>
          )}
        </PageLayout.Row>
      </PageLayout.TopArea>

      <PromptsList promptBlocks={promptBlocks} isLoading={isLoading} search={search} />
    </PageLayout>
  );
}
