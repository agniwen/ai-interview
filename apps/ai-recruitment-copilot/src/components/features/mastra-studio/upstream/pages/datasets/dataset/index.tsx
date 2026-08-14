import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { DataKeysAndValues } from "@mastra/playground-ui/components/DataKeysAndValues";
import { DropdownMenu } from "@mastra/playground-ui/components/DropdownMenu";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { ErrorState } from "@mastra/playground-ui/components/ErrorState";
import { PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { Tooltip, TooltipContent, TooltipTrigger } from "@mastra/playground-ui/components/Tooltip";
import {
  is401UnauthorizedError,
  is403ForbiddenError,
  is404NotFoundError,
} from "@mastra/playground-ui/utils/errors";
import { format } from "date-fns/format";
import { ArrowLeft, Copy, DatabaseIcon, MoreVertical, Pencil, Play, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  Link,
  useParams,
  useNavigate,
  useSearchParams,
} from "@/components/features/mastra-studio/router/compat";
import {
  DatasetPageTabs,
  DuplicateDatasetDialog,
  ExperimentTriggerDialog,
  AddItemDialog,
  EditDatasetDialog,
  DeleteDatasetDialog,
} from "@/components/features/mastra-studio/upstream/domains/datasets";
import { useDatasetItems } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-items";
import { useDatasetItemsUrlState } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-items-url-state";
import { useDataset } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-datasets";

function DatasetPageShell({ children }: { children?: ReactNode }) {
  return (
    <PageLayout height="full">
      <div />
      <PageLayout.MainArea isCentered>{children}</PageLayout.MainArea>
    </PageLayout>
  );
}

function getRunExperimentLabel(activeVersion: number | null | undefined): string {
  return activeVersion === null || activeVersion === undefined
    ? "运行实验"
    : `在 v${activeVersion} 上运行`;
}

function shouldDisableExperimentTrigger(isLoading: boolean, itemCount: number): boolean {
  return isLoading ? false : itemCount === 0;
}

function getDatasetPageState({
  datasetId,
  dataset,
  error,
  isLoading,
}: {
  datasetId: string;
  dataset: unknown;
  error: unknown;
  isLoading: boolean;
}): ReactNode | undefined {
  if (isLoading) {
    return null;
  }
  if (error && is401UnauthorizedError(error)) {
    return (
      <DatasetPageShell>
        <SessionExpired />
      </DatasetPageShell>
    );
  }
  if (error && is403ForbiddenError(error)) {
    return (
      <DatasetPageShell>
        <PermissionDenied resource="数据集" />
      </DatasetPageShell>
    );
  }
  if ((error && is404NotFoundError(error)) || (!error && !dataset)) {
    return (
      <DatasetPageShell>
        <EmptyState
          iconSlot={<DatabaseIcon />}
          titleSlot="未找到数据集"
          descriptionSlot={`未找到 ID 为“${datasetId}”的数据集。`}
          actionSlot={
            <Button as={Link} to="/datasets">
              <ArrowLeft />
              返回数据集列表
            </Button>
          }
        />
      </DatasetPageShell>
    );
  }
  if (error) {
    return (
      <DatasetPageShell>
        <ErrorState
          title="加载数据集失败"
          message={error instanceof Error ? error.message : "发生意外错误，请重试。"}
        />
      </DatasetPageShell>
    );
  }
  return undefined;
}

function DatasetPage() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeVersion } = useDatasetItemsUrlState(searchParams, setSearchParams);

  // Dialog states
  const [experimentDialogOpen, setExperimentDialogOpen] = useState(false);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);

  // Fetch dataset for edit dialog
  const { data: dataset, error, isLoading: isDatasetLoading } = useDataset(datasetId);

  // Unfiltered items query — used to disable the experiment trigger when the
  // dataset has no items. React Query dedupes this with the same call inside
  // DatasetPageTabs.
  const { data: unfilteredItems = [], isLoading: isUnfilteredLoading } = useDatasetItems(
    datasetId,
    undefined,
    activeVersion,
  );
  const disableExperimentTrigger = shouldDisableExperimentTrigger(
    isUnfilteredLoading,
    unfilteredItems.length,
  );
  const runExperimentLabel = getRunExperimentLabel(activeVersion);

  const pageState = getDatasetPageState({
    dataset,
    datasetId,
    error,
    isLoading: isDatasetLoading,
  });
  if (pageState !== undefined) {
    return pageState;
  }

  const handleExperimentSuccess = (experimentId: string) => {
    void navigate(`/datasets/${datasetId}/experiments/${experimentId}`);
  };

  const handleDeleteSuccess = () => {
    // Navigate back to datasets list
    void navigate("/datasets");
  };

  return (
    <>
      <PageLayout height="full">
        <PageLayout.TopArea>
          <PageLayout.Row>
            <PageLayout.Column>
              {dataset?.description && (
                <p className="text-ui-smd text-neutral3 mb-1">{dataset.description}</p>
              )}
              <DataKeysAndValues numOfCol={2}>
                <DataKeysAndValues.Key>创建时间</DataKeysAndValues.Key>
                <DataKeysAndValues.Value>
                  {dataset?.createdAt ? format(new Date(dataset.createdAt), "yyyy/MM/dd") : ""}
                </DataKeysAndValues.Value>
                <DataKeysAndValues.Key>最新版本</DataKeysAndValues.Key>
                <DataKeysAndValues.Value>v{dataset?.version ?? ""}</DataKeysAndValues.Value>
              </DataKeysAndValues>
            </PageLayout.Column>
            <PageLayout.Column>
              <ButtonsGroup>
                {disableExperimentTrigger ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-not-allowed">
                        <div className="pointer-events-none opacity-50" inert aria-disabled="true">
                          <Button variant="primary">
                            <Play />
                            {runExperimentLabel}
                          </Button>
                        </div>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>请先向数据集添加数据项，再运行实验</TooltipContent>
                  </Tooltip>
                ) : (
                  <Button variant="primary" onClick={() => setExperimentDialogOpen(true)}>
                    <Play />
                    {runExperimentLabel}
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenu.Trigger asChild>
                    <Button size="lg" aria-label="数据集操作菜单">
                      <MoreVertical />
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="end" className="w-48">
                    <DropdownMenu.Item onSelect={() => setEditDialogOpen(true)}>
                      <Pencil /> 编辑数据集
                    </DropdownMenu.Item>
                    <DropdownMenu.Item onSelect={() => setDuplicateDialogOpen(true)}>
                      <Copy /> 复制数据集
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onSelect={() => setDeleteDialogOpen(true)}
                      className="text-red-500 focus:text-red-400"
                    >
                      <Trash2 /> 删除数据集
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu>
              </ButtonsGroup>
            </PageLayout.Column>
          </PageLayout.Row>
        </PageLayout.TopArea>

        <PageLayout.MainArea>
          <DatasetPageTabs
            datasetId={datasetId}
            onAddItemClick={() => setAddItemDialogOpen(true)}
          />
        </PageLayout.MainArea>
      </PageLayout>

      <ExperimentTriggerDialog
        datasetId={datasetId}
        version={activeVersion ?? undefined}
        requestContextSchema={dataset?.requestContextSchema}
        open={experimentDialogOpen}
        onOpenChange={setExperimentDialogOpen}
        onSuccess={handleExperimentSuccess}
      />

      <AddItemDialog
        datasetId={datasetId}
        open={addItemDialogOpen}
        onOpenChange={setAddItemDialogOpen}
      />

      {/* Dataset edit dialog */}
      {dataset && (
        <EditDatasetDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          dataset={{
            description: dataset?.description || "",
            groundTruthSchema: dataset.groundTruthSchema,
            id: dataset.id,
            inputSchema: dataset.inputSchema,
            name: dataset.name,
            requestContextSchema: dataset.requestContextSchema,
            targetType: dataset.targetType,
          }}
        />
      )}

      {/* Dataset duplicate dialog */}
      {dataset && (
        <DuplicateDatasetDialog
          open={duplicateDialogOpen}
          onOpenChange={setDuplicateDialogOpen}
          sourceDatasetId={dataset.id}
          sourceDatasetName={dataset.name}
          sourceDatasetDescription={(dataset as { description?: string }).description}
          sourceDatasetTargetType={dataset.targetType}
        />
      )}

      {/* Dataset delete dialog */}
      {dataset && (
        <DeleteDatasetDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          datasetId={dataset.id}
          datasetName={dataset.name}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </>
  );
}

export { DatasetPage };
export default DatasetPage;
