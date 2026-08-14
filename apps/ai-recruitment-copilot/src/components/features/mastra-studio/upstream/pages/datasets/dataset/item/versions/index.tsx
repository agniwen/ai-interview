import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { Chip } from "@mastra/playground-ui/components/Chip";
import { CodeDiff } from "@mastra/playground-ui/components/CodeDiff";
import { Column, Columns } from "@mastra/playground-ui/components/Columns";
import {
  MainContentContent,
  MainContentLayout,
} from "@mastra/playground-ui/components/MainContent";
import { MainHeader } from "@mastra/playground-ui/components/MainHeader";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mastra/playground-ui/components/Select";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { TextAndIcon } from "@mastra/playground-ui/components/Text";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { format } from "date-fns";
import {
  ArrowLeft,
  HistoryIcon,
  GitCompareIcon,
  ColumnsIcon,
  GitCompareArrowsIcon,
} from "lucide-react";
import { Fragment, useState } from "react";
import {
  useParams,
  useSearchParams,
  Link,
} from "@/components/features/mastra-studio/router/compat";
import { DatasetItemContent } from "@/components/features/mastra-studio/upstream/domains/datasets";
import {
  useDatasetItemVersion,
  useDatasetItemVersions,
} from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-item-versions";
import type { DatasetItemVersion } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-item-versions";
import { useDataset } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-datasets";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";
import { RouteHeaderActions } from "@/components/features/mastra-studio/upstream/lib/route-header";
import { cn } from "@/components/features/mastra-studio/upstream/lib/utils";

function versionToText(version: DatasetItemVersion): string {
  return JSON.stringify(
    {
      groundTruth: version.groundTruth ?? null,
      input: version.input ?? null,
      metadata: version.metadata ?? null,
    },
    null,
    2,
  );
}

function parseVersionNumbers(value: string | null): number[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map(Number)
    .filter((version) => !Number.isNaN(version) && version > 0);
}

function normalizeRouteParam(value: string | undefined): string {
  return value ?? "";
}

function getComparedVersion(versionNumbers: number[], index: number): number {
  return versionNumbers[index] ?? 0;
}

function CompareVersionColumn({
  datasetId,
  itemId,
  datasetVersion,
  latestVersion,
  allVersions,
  versionNumbers,
  LinkComponent,
  idx,
  showContent = true,
  onVersionChange,
}: {
  datasetId: string;
  itemId: string;
  datasetVersion: number;
  latestVersion?: number;
  allVersions: DatasetItemVersion[];
  versionNumbers: number[];
  LinkComponent: ReturnType<typeof useLinkComponent>["Link"];
  idx: number;
  showContent?: boolean;
  onVersionChange: (newVersion: number) => void;
}) {
  const { data: version, isLoading } = useDatasetItemVersion(
    datasetId,
    itemId,
    datasetVersion,
    latestVersion,
  );
  const otherVersionNumbers = new Set(versionNumbers.filter((_, i) => i !== idx));
  const options = allVersions.map((v) => {
    const date = typeof v.updatedAt === "string" ? new Date(v.updatedAt) : v.updatedAt;
    return {
      disabled: otherVersionNumbers.has(v.datasetVersion),
      label: (
        <>
          <b>v. {v.datasetVersion}</b> - {format(date, "yyyy/MM/dd HH:mm")}
          {v.isLatest ? (
            <Chip color="blue" size="small">
              最新
            </Chip>
          ) : null}
        </>
      ),
      value: String(v.datasetVersion),
    };
  });
  const displayItem = version
    ? {
        createdAt: version.createdAt,
        datasetId,
        datasetVersion: version.datasetVersion,
        groundTruth: version.groundTruth,
        id: version.id,
        input: version.input,
        metadata: version.metadata,
        updatedAt: version.updatedAt,
      }
    : null;
  let columnContent = <div className="text-neutral4 text-sm">版本 {datasetVersion} 未找到</div>;
  if (isLoading) {
    columnContent = <div className="text-neutral4 text-sm">正在加载...</div>;
  } else if (version && displayItem) {
    columnContent = <DatasetItemContent item={displayItem} Link={LinkComponent} />;
  }
  return (
    <Column>
      <Column.Toolbar className="grid gap-4 grid-cols-[auto_1fr]">
        <HistoryIcon className="w-6 h-6 opacity-50" />
        <Select
          name={`compare-version-${idx}`}
          value={String(datasetVersion)}
          onValueChange={(val: string) => onVersionChange(Number(val))}
        >
          <SelectTrigger aria-label="版本" className="w-full">
            <SelectValue placeholder="选择版本" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Column.Toolbar>
      {showContent && <Column.Content>{columnContent}</Column.Content>}
    </Column>
  );
}

function DatasetItemVersionsComparePage() {
  const { datasetId, itemId } = useParams<{ datasetId: string; itemId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isDiffView, setIsDiffView] = useState<boolean>(false);
  const resolvedDatasetId = normalizeRouteParam(datasetId);
  const resolvedItemId = normalizeRouteParam(itemId);

  // ?ids=2,5 — direct dataset version numbers
  const versionNumbers = parseVersionNumbers(searchParams.get("ids"));

  const { data: dataset, error } = useDataset(resolvedDatasetId);
  const { Link: FrameworkLink } = useLinkComponent();
  const { data: allVersions } = useDatasetItemVersions(resolvedDatasetId, resolvedItemId);

  const { data: versionA } = useDatasetItemVersion(
    resolvedDatasetId,
    resolvedItemId,
    getComparedVersion(versionNumbers, 0),
    dataset?.version,
  );
  const { data: versionB } = useDatasetItemVersion(
    resolvedDatasetId,
    resolvedItemId,
    getComparedVersion(versionNumbers, 1),
    dataset?.version,
  );

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

  if (!datasetId || !itemId || versionNumbers.length < 2) {
    return (
      <MainContentLayout>
        <MainContentContent>
          <div className="text-neutral4 text-center py-8">
            <p>请至少选择两个版本进行对比。</p>
          </div>
        </MainContentContent>
      </MainContentLayout>
    );
  }

  return (
    <MainContentLayout>
      <RouteHeaderActions owner="dataset-item-versions-compare">
        <Button as={Link} to={`/datasets/${datasetId}/items/${itemId}`} variant="outline">
          <ArrowLeft />
          返回数据项
        </Button>
      </RouteHeaderActions>

      <div className="h-full overflow-hidden px-[3vw] pb-4">
        <div
          className={cn("grid gap-6 max-w-[140rem] mx-auto grid-rows-[auto_1fr] h-full", {
            "grid-rows-[auto_auto_1fr]": isDiffView,
          })}
        >
          <MainHeader>
            <MainHeader.Column>
              <MainHeader.Title>
                <GitCompareIcon />
                对比数据项版本
              </MainHeader.Title>
              <MainHeader.Description>
                <TextAndIcon>
                  正在对比数据项的 {versionNumbers.length} 个版本：{" "}
                  <Link
                    to={`/datasets/${datasetId}/items/${itemId}`}
                    className="text-info1 hover:underline"
                  >
                    {itemId}
                  </Link>
                </TextAndIcon>
              </MainHeader.Description>
            </MainHeader.Column>
            <MainHeader.Column>
              <ButtonsGroup>
                <Button variant="primary" onClick={() => setIsDiffView((v) => !v)}>
                  {isDiffView ? (
                    <>
                      <ColumnsIcon /> 默认视图
                    </>
                  ) : (
                    <>
                      <GitCompareArrowsIcon /> 差异视图
                    </>
                  )}
                </Button>
              </ButtonsGroup>
            </MainHeader.Column>
          </MainHeader>

          <Columns className="grid-cols-[1fr_3vw_1fr]">
            {versionNumbers.map((datasetVersion, idx) => (
              <Fragment key={datasetVersion}>
                <CompareVersionColumn
                  datasetId={datasetId}
                  itemId={itemId}
                  datasetVersion={datasetVersion}
                  latestVersion={dataset?.version}
                  allVersions={allVersions ?? []}
                  versionNumbers={versionNumbers}
                  LinkComponent={FrameworkLink}
                  idx={idx}
                  showContent={!isDiffView}
                  onVersionChange={(newVersion: number) => {
                    const newVersions = [...versionNumbers];
                    newVersions[idx] = newVersion;
                    setSearchParams({ ids: newVersions.join(",") });
                  }}
                />
                {idx === 0 && <div className={cn("bg-surface5 w-[3px] shrink-0 mx-[1.5vw]")} />}
              </Fragment>
            ))}
          </Columns>
          {isDiffView && versionA && versionB && (
            <CodeDiff codeA={versionToText(versionA)} codeB={versionToText(versionB)} />
          )}
        </div>
      </div>
    </MainContentLayout>
  );
}

export { DatasetItemVersionsComparePage };
export default DatasetItemVersionsComparePage;
