"use client";

import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { Checkbox } from "@mastra/playground-ui/components/Checkbox";
import { Column } from "@mastra/playground-ui/components/Columns";
import { ItemList } from "@mastra/playground-ui/components/ItemList";
import { format } from "date-fns";
import { XIcon, GitCompareIcon, ArrowRightIcon } from "lucide-react";
import { useState } from "react";
import { useDatasetVersions } from "../../hooks/use-dataset-versions";
import type { DatasetVersion } from "../../hooks/use-dataset-versions";

export interface DatasetVersionsPanelProps {
  datasetId: string;
  onClose: () => void;
  onVersionSelect?: (version: DatasetVersion) => void;
  onCompareVersionsClick?: (versionNumbers: string[]) => void;
  activeVersion?: number | null;
}

/**
 * Panel showing dataset version history with optional compare selection.
 */
function DatasetVersionsListSkeleton() {
  return (
    <ItemList>
      <ItemList.Header>
        <ItemList.HeaderCol>数据集版本历史</ItemList.HeaderCol>
      </ItemList.Header>
      <ItemList.Items>
        {Array.from({ length: 3 }).map((_, index) => (
          <ItemList.Row key={index}>
            <ItemList.RowButton
              columns={[{ label: "数据集版本历史", name: "version", size: "1fr" }]}
            >
              <ItemList.TextCell isLoading>正在加载...</ItemList.TextCell>
            </ItemList.RowButton>
          </ItemList.Row>
        ))}
      </ItemList.Items>
    </ItemList>
  );
}

export function DatasetVersionsPanel({
  datasetId,
  onClose,
  onVersionSelect,
  onCompareVersionsClick,
  activeVersion,
}: DatasetVersionsPanelProps) {
  const {
    data: versions,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useDatasetVersions(datasetId);

  const [isSelectionActive, setIsSelectionActive] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const handleVersionClick = (version: DatasetVersion) => {
    onVersionSelect?.(version);
  };

  const isVersionSelected = (version: DatasetVersion): boolean => {
    if (activeVersion === null || activeVersion === undefined) {
      return version.isCurrent;
    }
    return version.version === activeVersion;
  };

  const handleToggleSelection = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else if (next.size >= 2) {
        // Drop most recent selection, keep oldest + add new one
        const [first] = [...next];
        return new Set([first, key]);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleCancelSelection = () => {
    setIsSelectionActive(false);
    setSelectedKeys(new Set());
  };

  const handleCompareClick = () => {
    setIsSelectionActive(true);
  };

  const handleExecuteCompare = () => {
    if (selectedKeys.size === 2) {
      onCompareVersionsClick?.([...selectedKeys]);
    }
  };

  return (
    <Column withLeftSeparator={true} className="w-56">
      {isSelectionActive ? (
        <Column.Toolbar className="grid justify-stretch gap-3 w-full">
          <ButtonsGroup>
            <Button onClick={handleCancelSelection}>取消</Button>
            <Button
              variant="primary"
              disabled={selectedKeys.size !== 2}
              onClick={handleExecuteCompare}
              tooltip={selectedKeys.size === 2 ? undefined : "请选择两个版本以启用对比"}
              className="w-full"
            >
              <ArrowRightIcon /> 对比
            </Button>
          </ButtonsGroup>
        </Column.Toolbar>
      ) : (
        <Column.Toolbar>
          <Button onClick={handleCompareClick}>
            <GitCompareIcon /> 对比版本
          </Button>
          <Button onClick={onClose} tooltip="隐藏版本面板">
            <XIcon />
          </Button>
        </Column.Toolbar>
      )}
      <Column.Content>
        {isLoading ? (
          <DatasetVersionsListSkeleton />
        ) : (
          <ItemList>
            <ItemList.Header>
              <ItemList.HeaderCol>数据集版本历史</ItemList.HeaderCol>
            </ItemList.Header>

            <ItemList.Scroller>
              <ItemList.Items>
                {versions?.map((item) => {
                  const key = String(item.version);
                  let createdAtDate: Date | null = null;
                  if (item.createdAt) {
                    createdAtDate =
                      typeof item.createdAt === "string"
                        ? new Date(item.createdAt)
                        : item.createdAt;
                  }

                  return (
                    <ItemList.Row
                      key={String(item.version)}
                      isSelected={isSelectionActive && selectedKeys.has(key)}
                    >
                      {isSelectionActive && (
                        <ItemList.LabelCell>
                          <Checkbox
                            checked={selectedKeys.has(key)}
                            onCheckedChange={() => {
                              /* empty */
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSelection(key);
                            }}
                            aria-label={`选择版本 ${
                              createdAtDate
                                ? `v${item.version} — ${format(createdAtDate, "yyyy/MM/dd HH:mm")}`
                                : `v${item.version}`
                            }`}
                          />
                        </ItemList.LabelCell>
                      )}
                      <ItemList.RowButton
                        item={item}
                        isFeatured={isVersionSelected(item)}
                        columns={[{ label: "数据集版本历史", name: "version", size: "1fr" }]}
                        onClick={() => handleVersionClick(item)}
                        className="py-2"
                      >
                        <ItemList.VersionCell
                          version={item.version}
                          date={createdAtDate}
                          isLatest={item.isCurrent}
                        />
                      </ItemList.RowButton>
                    </ItemList.Row>
                  );
                })}
              </ItemList.Items>
              {hasNextPage && (
                <Button
                  size="md"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="w-full mt-2"
                >
                  {isFetchingNextPage ? "正在加载..." : "加载更多"}
                </Button>
              )}
            </ItemList.Scroller>
          </ItemList>
        )}
      </Column.Content>
    </Column>
  );
}
