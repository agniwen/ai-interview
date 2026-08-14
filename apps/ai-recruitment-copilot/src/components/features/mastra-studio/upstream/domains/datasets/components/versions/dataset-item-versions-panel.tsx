"use client";

import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { Checkbox } from "@mastra/playground-ui/components/Checkbox";
import { Column } from "@mastra/playground-ui/components/Columns";
import { ItemList } from "@mastra/playground-ui/components/ItemList";
import { GitCompareIcon } from "lucide-react";
import { useState } from "react";
import { useDatasetItemVersions } from "../../hooks/use-dataset-item-versions";
import type { DatasetItemVersion } from "../../hooks/use-dataset-item-versions";

export interface DatasetItemVersionsPanelProps {
  datasetId: string;
  itemId: string;
  onClose: () => void;
  onVersionSelect?: (version: DatasetItemVersion) => void;
  onCompareVersionsClick?: (versionIds: string[]) => void;
  activeVersion?: number | null;
}

/**
 * Panel showing dataset item version history.
 */
function DatasetItemVersionsListSkeleton() {
  return (
    <ItemList>
      <ItemList.Header columns={[{ label: "数据项版本历史", name: "version", size: "1fr" }]}>
        <ItemList.HeaderCol>数据项版本历史</ItemList.HeaderCol>
      </ItemList.Header>
      <ItemList.Items>
        {Array.from({ length: 3 }).map((_, index) => (
          <ItemList.Row key={index}>
            <ItemList.RowButton
              columns={[{ label: "数据项版本历史", name: "version", size: "1fr" }]}
            >
              <ItemList.TextCell isLoading>正在加载...</ItemList.TextCell>
            </ItemList.RowButton>
          </ItemList.Row>
        ))}
      </ItemList.Items>
    </ItemList>
  );
}

export function DatasetItemVersionsPanel({
  datasetId,
  itemId,
  onVersionSelect,
  onCompareVersionsClick,
  activeVersion,
}: DatasetItemVersionsPanelProps) {
  const { data: versions, isLoading } = useDatasetItemVersions(datasetId, itemId);

  const [isSelectionActive, setIsSelectionActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleVersionClick = (version: DatasetItemVersion) => {
    onVersionSelect?.(version);
  };

  const isVersionSelected = (version: DatasetItemVersion): boolean => {
    if (activeVersion === null || activeVersion === undefined) {
      return version.isLatest;
    }
    return version.datasetVersion === activeVersion;
  };

  const handleToggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size >= 2) {
        // Drop most recent selection, keep oldest + add new one
        const [first] = [...next];
        return new Set([first, id]);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCancelSelection = () => {
    setIsSelectionActive(false);
    setSelectedIds(new Set());
  };

  const handleCompareClick = () => {
    setIsSelectionActive(true);
  };

  const handleExecuteCompare = () => {
    if (selectedIds.size === 2) {
      onCompareVersionsClick?.([...selectedIds]);
    }
  };

  return (
    <Column className="min-w-56">
      {isSelectionActive ? (
        <Column.Toolbar className="grid justify-stretch gap-3 w-full">
          <ButtonsGroup>
            <Button onClick={handleCancelSelection}>取消</Button>
            <Button
              variant="primary"
              disabled={selectedIds.size !== 2}
              onClick={handleExecuteCompare}
              tooltip={selectedIds.size === 2 ? undefined : "请选择两个版本进行对比"}
              className="grow"
            >
              对比
            </Button>
          </ButtonsGroup>
        </Column.Toolbar>
      ) : (
        <>
          {(versions || []).length > 1 && (
            <Column.Toolbar>
              <Button onClick={handleCompareClick} className="w-full">
                <GitCompareIcon /> 对比版本
              </Button>
            </Column.Toolbar>
          )}
        </>
      )}

      {isLoading ? (
        <DatasetItemVersionsListSkeleton />
      ) : (
        <ItemList>
          <ItemList.Header>
            <ItemList.HeaderCol>数据项版本历史</ItemList.HeaderCol>
          </ItemList.Header>

          <ItemList.Scroller>
            <ItemList.Items>
              {versions?.map((item) => {
                const versionKey = String(item.datasetVersion);
                const versionDate =
                  typeof item.updatedAt === "string" ? new Date(item.updatedAt) : item.updatedAt;

                return (
                  <ItemList.Row
                    key={String(item.datasetVersion)}
                    isSelected={isSelectionActive && selectedIds.has(versionKey)}
                  >
                    {isSelectionActive && (
                      <ItemList.LabelCell>
                        <Checkbox
                          checked={selectedIds.has(versionKey)}
                          disabled={item.isDeleted}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!item.isDeleted) {
                              handleToggleSelection(versionKey);
                            }
                          }}
                          aria-label={`选择版本 ${item.datasetVersion}`}
                        />
                      </ItemList.LabelCell>
                    )}
                    <ItemList.RowButton
                      item={item}
                      columns={[{ label: "数据项版本历史", name: "version", size: "1fr" }]}
                      isFeatured={isVersionSelected(item)}
                      onClick={() => handleVersionClick(item)}
                      className="py-2"
                    >
                      <ItemList.VersionCell
                        version={item.datasetVersion}
                        date={versionDate}
                        isLatest={item.isLatest}
                        isDeleted={item.isDeleted}
                      />
                    </ItemList.RowButton>
                  </ItemList.Row>
                );
              })}
            </ItemList.Items>
          </ItemList.Scroller>
        </ItemList>
      )}
    </Column>
  );
}
