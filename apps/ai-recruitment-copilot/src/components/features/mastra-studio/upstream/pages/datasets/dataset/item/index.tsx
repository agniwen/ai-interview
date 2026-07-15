import type { DatasetItemToolMock } from "@mastra/client-js";
import { AlertDialog } from "@mastra/playground-ui/components/AlertDialog";
import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { Column, Columns } from "@mastra/playground-ui/components/Columns";
import { CopyButton } from "@mastra/playground-ui/components/CopyButton";
import {
  MainContentContent,
  MainContentLayout,
} from "@mastra/playground-ui/components/MainContent";
import { MainHeader } from "@mastra/playground-ui/components/MainHeader";
import { Notice } from "@mastra/playground-ui/components/Notice";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { TextAndIcon } from "@mastra/playground-ui/components/Text";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { toast } from "@mastra/playground-ui/utils/toast";
import { format } from "date-fns";
import {
  ArrowRightToLineIcon,
  Calendar1Icon,
  DatabaseIcon,
  Edit2Icon,
  FileCodeIcon,
  HistoryIcon,
  Trash2Icon,
} from "lucide-react";
import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { useParams, useNavigate } from "@/components/features/mastra-studio/router/compat";
import {
  DatasetItemContent,
  DatasetItemVersionsPanel,
  EditModeContent,
} from "@/components/features/mastra-studio/upstream/domains/datasets";
import { useDatasetItemVersions } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-item-versions";
import type { DatasetItemVersion } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-item-versions";
import { useDatasetMutations } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-mutations";
import { useDataset } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-datasets";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

type JsonParseResult<T> = { ok: true; value: T } | { ok: false };

function parseJson<T>(value: string, errorMessage: string): JsonParseResult<T> {
  try {
    return { ok: true, value: JSON.parse(value) as T };
  } catch {
    toast.error(errorMessage);
    return { ok: false };
  }
}

function parseOptionalJson<T>(value: string, errorMessage: string): JsonParseResult<T | undefined> {
  return value.trim() ? parseJson<T>(value, errorMessage) : { ok: true, value: undefined };
}

function parseChangedJson<T>(
  changed: boolean,
  value: string,
  errorMessage: string,
): JsonParseResult<T | undefined> {
  return changed ? parseOptionalJson<T>(value, errorMessage) : { ok: true, value: undefined };
}

function parseToolMocks(
  changed: boolean,
  value: string,
): JsonParseResult<DatasetItemToolMock[] | undefined> {
  const result = parseChangedJson<unknown>(changed, value, "工具模拟必须是有效的 JSON");
  if (!result.ok || result.value === undefined) {
    return result as JsonParseResult<undefined>;
  }
  if (!Array.isArray(result.value)) {
    toast.error("工具模拟必须是 JSON 数组");
    return { ok: false };
  }
  return { ok: true, value: result.value as DatasetItemToolMock[] };
}

function normalizeRouteParam(value: string | undefined): string {
  return value ?? "";
}

function hasItemVersions(
  datasetId: string | undefined,
  itemId: string | undefined,
  versions: DatasetItemVersion[] | undefined,
): boolean {
  return Boolean(datasetId && itemId && versions && versions.length > 0);
}

function getItemPageState({
  error,
  isLoading,
  hasVersions,
}: {
  error: unknown;
  isLoading: boolean;
  hasVersions: boolean;
}): ReactNode | undefined {
  if (error && is401UnauthorizedError(error)) {
    return (
      <MainContentLayout>
        <div className="flex h-full items-center justify-center">
          <SessionExpired />
        </div>
      </MainContentLayout>
    );
  }
  if (error && is403ForbiddenError(error)) {
    return (
      <MainContentLayout>
        <div className="flex h-full items-center justify-center">
          <PermissionDenied resource="数据集" />
        </div>
      </MainContentLayout>
    );
  }
  if (isLoading) {
    return null;
  }
  if (!hasVersions) {
    return (
      <MainContentLayout>
        <MainContentContent>
          <div className="text-neutral3 p-4">未找到数据项</div>
        </MainContentContent>
      </MainContentLayout>
    );
  }
  return undefined;
}

function DatasetItemPage() {
  const { datasetId, itemId } = useParams<{ datasetId: string; itemId: string }>();
  const resolvedDatasetId = normalizeRouteParam(datasetId);
  const resolvedItemId = normalizeRouteParam(itemId);
  const { Link: FrameworkLink } = useLinkComponent();
  const navigate = useNavigate();

  // Use versions as single source of truth - works for both active and deleted items
  const {
    data: versions,
    isLoading: isVersionsLoading,
    error,
  } = useDatasetItemVersions(resolvedDatasetId, resolvedItemId);
  const { updateItem, deleteItem } = useDatasetMutations();
  const { data: dataset } = useDataset(resolvedDatasetId);

  // Derive item state from versions
  const latestVersion = versions?.[0] ?? null;
  const isDeleted = latestVersion?.isDeleted ?? false;

  // Version viewing state
  const [selectedVersion, setSelectedVersion] = useState<DatasetItemVersion | null>(null);

  // Derive form defaults from latest version (recomputes when version changes)
  const formDefaults = useMemo(() => {
    if (!latestVersion || isDeleted) {
      return {
        groundTruth: "",
        input: "",
        metadata: "",
        requestContext: "",
        toolMocks: "",
        trajectory: "",
      };
    }
    return {
      groundTruth: latestVersion.groundTruth
        ? JSON.stringify(latestVersion.groundTruth, null, 2)
        : "",
      input: JSON.stringify(latestVersion.input, null, 2),
      metadata: latestVersion.metadata ? JSON.stringify(latestVersion.metadata, null, 2) : "",
      requestContext: latestVersion.requestContext
        ? JSON.stringify(latestVersion.requestContext, null, 2)
        : "",
      toolMocks: latestVersion.toolMocks?.length
        ? JSON.stringify(latestVersion.toolMocks, null, 2)
        : "",
      trajectory:
        latestVersion.expectedTrajectory !== null && latestVersion.expectedTrajectory !== undefined
          ? JSON.stringify(latestVersion.expectedTrajectory, null, 2)
          : "",
    };
  }, [latestVersion, isDeleted]);

  // Use datasetVersion as key to reset form state when version changes
  const versionKey = latestVersion?.datasetVersion ?? 0;

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(formDefaults.input);
  const [groundTruthValue, setGroundTruthValue] = useState(formDefaults.groundTruth);
  const [metadataValue, setMetadataValue] = useState(formDefaults.metadata);
  const [trajectoryValue, setTrajectoryValue] = useState(formDefaults.trajectory);
  const [toolMocksValue, setToolMocksValue] = useState(formDefaults.toolMocks);
  const [requestContextValue, setRequestContextValue] = useState(formDefaults.requestContext);

  // Reset form values when version changes (key-based reset pattern)
  const [prevVersionKey, setPrevVersionKey] = useState(versionKey);
  if (versionKey !== prevVersionKey) {
    setPrevVersionKey(versionKey);
    setInputValue(formDefaults.input);
    setGroundTruthValue(formDefaults.groundTruth);
    setMetadataValue(formDefaults.metadata);
    setTrajectoryValue(formDefaults.trajectory);
    setToolMocksValue(formDefaults.toolMocks);
    setRequestContextValue(formDefaults.requestContext);
  }

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleVersionSelect = (version: DatasetItemVersion) => {
    // For deleted items, always keep a version selected
    // For active items, selecting latest clears selection (shows current)
    if (isDeleted) {
      setSelectedVersion(version);
    } else {
      setSelectedVersion(version.isLatest ? null : version);
    }
  };

  const handleReturnToLatest = () => {
    setSelectedVersion(null);
  };

  // Check if viewing an old version
  const isViewingOldVersion =
    !isDeleted && selectedVersion !== null && selectedVersion !== undefined;

  const handleEditClick = () => {
    if (!isViewingOldVersion) {
      setIsEditing(true);
    }
  };

  const handleDeleteClick = () => {
    if (!isViewingOldVersion) {
      setDeleteDialogOpen(true);
    }
  };

  const handleSave = async () => {
    if (!datasetId || !itemId) {
      return;
    }

    // Parse and validate input JSON
    const inputResult = parseJson<unknown>(inputValue, "输入必须是有效的 JSON");
    if (!inputResult.ok) {
      return;
    }
    const parsedInput = inputResult.value;

    const groundTruthResult = parseOptionalJson<unknown>(
      groundTruthValue,
      "标准答案必须是有效的 JSON",
    );
    if (!groundTruthResult.ok) {
      return;
    }
    const parsedGroundTruth = groundTruthResult.value;
    const metadataResult = parseOptionalJson<Record<string, unknown>>(
      metadataValue,
      "元数据必须是有效的 JSON",
    );
    if (!metadataResult.ok) {
      return;
    }
    const parsedMetadata = metadataResult.value;
    const trajectoryChanged = trajectoryValue !== formDefaults.trajectory;
    const trajectoryResult = parseChangedJson<unknown>(
      trajectoryChanged,
      trajectoryValue,
      "预期轨迹必须是有效的 JSON",
    );
    if (!trajectoryResult.ok) {
      return;
    }
    const parsedTrajectory = trajectoryResult.value;
    const toolMocksChanged = toolMocksValue !== formDefaults.toolMocks;
    const toolMocksResult = parseToolMocks(toolMocksChanged, toolMocksValue);
    if (!toolMocksResult.ok) {
      return;
    }
    const parsedToolMocks = toolMocksResult.value;
    const requestContextChanged = requestContextValue !== formDefaults.requestContext;
    const requestContextResult = parseChangedJson<Record<string, unknown>>(
      requestContextChanged,
      requestContextValue,
      "请求上下文必须是有效的 JSON",
    );
    if (!requestContextResult.ok) {
      return;
    }
    const parsedRequestContext = requestContextResult.value;

    try {
      await updateItem.mutateAsync({
        datasetId,
        groundTruth: parsedGroundTruth,
        input: parsedInput,
        itemId,
        metadata: parsedMetadata,
        ...(trajectoryChanged ? { expectedTrajectory: parsedTrajectory ?? null } : {}),
        ...(toolMocksChanged ? { toolMocks: parsedToolMocks ?? [] } : {}),
        ...(requestContextChanged ? { requestContext: parsedRequestContext } : {}),
      });
      toast.success("数据项更新成功");
      setIsEditing(false);
    } catch (mutationError) {
      toast.error(
        `更新数据项失败：${mutationError instanceof Error ? mutationError.message : "未知错误"}`,
      );
    }
  };

  const handleCancel = () => {
    // Reset form values to latest version
    if (latestVersion) {
      setInputValue(JSON.stringify(latestVersion.input, null, 2));
      setGroundTruthValue(
        latestVersion.groundTruth ? JSON.stringify(latestVersion.groundTruth, null, 2) : "",
      );
      setMetadataValue(
        latestVersion.metadata ? JSON.stringify(latestVersion.metadata, null, 2) : "",
      );
      setTrajectoryValue(
        latestVersion.expectedTrajectory !== null && latestVersion.expectedTrajectory !== undefined
          ? JSON.stringify(latestVersion.expectedTrajectory, null, 2)
          : "",
      );
      setToolMocksValue(
        latestVersion.toolMocks?.length ? JSON.stringify(latestVersion.toolMocks, null, 2) : "",
      );
      setRequestContextValue(
        latestVersion.requestContext ? JSON.stringify(latestVersion.requestContext, null, 2) : "",
      );
    }
    setIsEditing(false);
  };

  const handleDeleteConfirm = async () => {
    if (!datasetId || !itemId) {
      return;
    }
    try {
      await deleteItem.mutateAsync({ datasetId, itemId });
      toast.success("数据项删除成功");
      setDeleteDialogOpen(false);
      void navigate(`/datasets/${datasetId}`);
    } catch (mutationError) {
      toast.error(
        `删除数据项失败：${mutationError instanceof Error ? mutationError.message : "未知错误"}`,
      );
    }
  };

  // Determine which version to display
  const versionToDisplay = selectedVersion ?? latestVersion;

  // Build display item from flat version data
  const displayItem = versionToDisplay
    ? {
        createdAt: versionToDisplay.createdAt,
        datasetId: datasetId ?? "",
        datasetVersion: versionToDisplay.datasetVersion,
        expectedTrajectory: versionToDisplay.expectedTrajectory,
        groundTruth: versionToDisplay.groundTruth,
        id: itemId ?? "",
        input: versionToDisplay.input,
        metadata: versionToDisplay.metadata,
        updatedAt: versionToDisplay.updatedAt,
      }
    : null;

  const pageState = getItemPageState({
    error,
    hasVersions: hasItemVersions(datasetId, itemId, versions),
    isLoading: isVersionsLoading,
  });
  if (pageState !== undefined) {
    return pageState;
  }

  let itemContent = displayItem ? (
    <DatasetItemContent item={displayItem} Link={FrameworkLink} />
  ) : (
    <div className="text-neutral4 text-sm">数据项数据不可用</div>
  );
  if (isEditing) {
    itemContent = (
      <EditModeContent
        inputValue={inputValue}
        setInputValue={setInputValue}
        groundTruthValue={groundTruthValue}
        setGroundTruthValue={setGroundTruthValue}
        metadataValue={metadataValue}
        setMetadataValue={setMetadataValue}
        trajectoryValue={trajectoryValue}
        setTrajectoryValue={setTrajectoryValue}
        toolMocksValue={toolMocksValue}
        setToolMocksValue={setToolMocksValue}
        requestContextValue={requestContextValue}
        setRequestContextValue={setRequestContextValue}
        validationErrors={null}
        onSave={handleSave}
        onCancel={handleCancel}
        isSaving={updateItem.isPending}
      />
    );
  }

  const renderPage = () => (
    <>
      <MainContentLayout>
        <div className="h-full overflow-hidden px-6 pb-4">
          <div className="grid gap-6 max-w-[60rem] mx-auto grid-rows-[auto_1fr] h-full">
            <MainHeader>
              <MainHeader.Column>
                <MainHeader.Title>
                  <FileCodeIcon />
                  {itemId} <CopyButton content={itemId} />
                </MainHeader.Title>
                <MainHeader.Description>
                  <TextAndIcon>
                    所属数据集 <DatabaseIcon /> {dataset?.name}
                  </TextAndIcon>
                </MainHeader.Description>
                <MainHeader.Description>
                  <TextAndIcon>
                    <Calendar1Icon /> 创建时间{" "}
                    {latestVersion?.createdAt
                      ? format(new Date(latestVersion.createdAt), "yyyy/MM/dd")
                      : ""}
                  </TextAndIcon>
                  <TextAndIcon>
                    <HistoryIcon /> 最新版本 v{latestVersion?.datasetVersion ?? ""}
                  </TextAndIcon>
                </MainHeader.Description>
              </MainHeader.Column>
              <MainHeader.Column>
                {!isEditing && !isDeleted && (
                  <ButtonsGroup>
                    <Button
                      onClick={handleEditClick}
                      disabled={isViewingOldVersion}
                      title={isViewingOldVersion ? "返回最新版本后才能编辑" : undefined}
                    >
                      <Edit2Icon /> 编辑
                    </Button>
                    <Button
                      onClick={handleDeleteClick}
                      disabled={isViewingOldVersion}
                      title={isViewingOldVersion ? "返回最新版本后才能删除" : undefined}
                    >
                      <Trash2Icon /> 删除
                    </Button>
                  </ButtonsGroup>
                )}
              </MainHeader.Column>
            </MainHeader>

            <Columns className={isEditing ? "grid-cols-1" : "grid-cols-[1fr_auto]"}>
              <Column withRightSeparator={!isEditing}>
                {isDeleted && latestVersion && (
                  <Notice variant="destructive" title="数据项已删除">
                    <Notice.Message>
                      此数据项已在版本 v{latestVersion.datasetVersion} 中删除
                    </Notice.Message>
                  </Notice>
                )}

                {!isDeleted && isViewingOldVersion && selectedVersion && (
                  <Notice
                    variant="warning"
                    title="上一个版本"
                    action={
                      <Notice.Button onClick={handleReturnToLatest}>
                        <ArrowRightToLineIcon /> 返回最新版本
                      </Notice.Button>
                    }
                  >
                    <Notice.Message>正在查看版本 v{selectedVersion.datasetVersion}</Notice.Message>
                  </Notice>
                )}

                {itemContent}
              </Column>
              {!isEditing && (
                <Column>
                  <DatasetItemVersionsPanel
                    datasetId={datasetId}
                    itemId={itemId}
                    onClose={() => {
                      /* empty */
                    }}
                    onVersionSelect={handleVersionSelect}
                    onCompareVersionsClick={(versionIds: string[]) => {
                      void navigate(
                        `/datasets/${datasetId}/items/${itemId}/versions?ids=${versionIds.join(",")}`,
                      );
                    }}
                    activeVersion={selectedVersion?.datasetVersion ?? null}
                  />
                </Column>
              )}
            </Columns>
          </div>
        </div>
      </MainContentLayout>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>删除数据项</AlertDialog.Title>
            <AlertDialog.Description>
              确定要删除此数据项吗？此操作无法撤销。
            </AlertDialog.Description>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <AlertDialog.Cancel>取消</AlertDialog.Cancel>
            <AlertDialog.Action onClick={handleDeleteConfirm}>
              {deleteItem.isPending ? "正在删除..." : "删除"}
            </AlertDialog.Action>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog>
    </>
  );
  return renderPage();
}

export { DatasetItemPage };
export default DatasetItemPage;
