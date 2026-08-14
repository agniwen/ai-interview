import type { DatasetItem } from "@mastra/client-js";
import { Chip } from "@mastra/playground-ui/components/Chip";
import { ItemList } from "@mastra/playground-ui/components/ItemList";
import { Tooltip, TooltipContent, TooltipTrigger } from "@mastra/playground-ui/components/Tooltip";
import { cn } from "@mastra/playground-ui/utils/cn";
import { BanIcon, EqualIcon, PenIcon, PlusIcon } from "lucide-react";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export interface DatasetCompareVersionsListProps {
  datasetId: string;
  versionA: number;
  versionB: number;
  allItems: { id: string; createdAt: Date }[];
  itemsAMap: Map<string, DatasetItem>;
  itemsBMap: Map<string, DatasetItem>;
  onItemClick?: (itemId: string, itemA?: DatasetItem, itemB?: DatasetItem) => void;
}

const columns = [
  { label: "ID", name: "id", size: "1fr" },
  { label: "版本 A", name: "versionA", size: "1fr" },
  { label: "版本 B", name: "versionB", size: "1fr" },
  { label: "对比", name: "compare", size: "10rem" },
];

const versionInfoConfig = {
  added: {
    borderColor: "border-blue-900",
    color: "blue" as const,
    icon: <PlusIcon />,
    tooltip: "此版本新增",
  },
  changed: {
    borderColor: "border-yellow-900",
    color: "orange" as const,
    icon: <PenIcon />,
    tooltip: "此版本已更改",
  },
  same: {
    borderColor: "border-green-900",
    color: "green" as const,
    icon: <EqualIcon />,
    tooltip: "两个版本中相同",
  },
};

function EmptyCell({ red = false, tooltip }: { red?: boolean; tooltip?: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <BanIcon
          className={cn("text-neutral3/40 w-5 h-5 ", {
            "text-red-900": red,
          })}
        />
      </TooltipTrigger>
      {tooltip && <TooltipContent>{tooltip}</TooltipContent>}
    </Tooltip>
  );
}

function VersionInfo({
  variant,
  version,
}: {
  variant?: keyof typeof versionInfoConfig;
  version?: number;
}) {
  if (!variant) {
    return <span className="text-ui-md text-neutral4">版本 {version}</span>;
  }
  const { color, icon, tooltip } = versionInfoConfig[variant];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="grid grid-cols-[1fr_auto]">
          {version !== undefined && (
            <span className="pr-3 text-ui-md text-neutral4 min-w-16 flex justify-end">
              版本 {version}
            </span>
          )}
          <Chip color={color} size="small">
            {icon}
          </Chip>
        </div>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function getStatus(itemA?: DatasetItem, itemB?: DatasetItem): string {
  if (itemA && itemB && itemA.datasetVersion === itemB.datasetVersion) {
    return "same";
  }
  if (itemA && itemB && itemA.datasetVersion !== itemB.datasetVersion) {
    return "changed";
  }
  if (itemA) {
    return "added";
  }
  return "removed";
}

export function DatasetCompareVersionsList({
  datasetId,
  versionA,
  versionB,
  allItems,
  itemsAMap,
  itemsBMap,
}: DatasetCompareVersionsListProps) {
  const { Link } = useLinkComponent();
  const isANewer = versionA > versionB;
  return (
    <ItemList>
      <ItemList.Scroller>
        <ItemList.Items>
          {allItems.map(({ id }) => {
            const itemA = itemsAMap.get(id);
            const itemB = itemsBMap.get(id);
            const status = getStatus(itemA, itemB);
            const hasChanged = status !== "same";
            let itemAVariant: keyof typeof versionInfoConfig | undefined;
            if (itemB === undefined && isANewer) {
              itemAVariant = "added";
            } else if (status === "changed" && isANewer) {
              itemAVariant = "changed";
            }
            let itemBVariant: keyof typeof versionInfoConfig | undefined;
            if (itemA === undefined && isANewer === false) {
              itemBVariant = "added";
            } else if (status === "changed" && isANewer === false) {
              itemBVariant = "changed";
            }

            return (
              <ItemList.Row key={id} columns={columns}>
                <ItemList.IdCell id={id} isShortened={false} />
                {hasChanged ? (
                  <>
                    {itemA?.datasetVersion ? (
                      <ItemList.LinkCell
                        LinkComponent={Link}
                        href={`/datasets/${datasetId}/items/${id}`}
                        className="gap-2"
                      >
                        <VersionInfo variant={itemAVariant} version={itemA.datasetVersion} />
                      </ItemList.LinkCell>
                    ) : (
                      <ItemList.Cell className={"justify-center flex  items-center"}>
                        <EmptyCell
                          red={isANewer}
                          tooltip={isANewer ? "此版本中已删除" : "此版本中不存在"}
                        />
                      </ItemList.Cell>
                    )}
                    {itemB?.datasetVersion ? (
                      <ItemList.LinkCell
                        LinkComponent={Link}
                        href={`/datasets/${datasetId}/items/${id}`}
                        className="gap-2"
                      >
                        <VersionInfo variant={itemBVariant} version={itemB.datasetVersion} />
                      </ItemList.LinkCell>
                    ) : (
                      <ItemList.Cell className={"justify-center flex items-center"}>
                        <EmptyCell
                          red={!isANewer}
                          tooltip={isANewer ? "此版本中不存在" : "此版本中已删除"}
                        />
                      </ItemList.Cell>
                    )}
                  </>
                ) : (
                  <ItemList.LinkCell
                    LinkComponent={Link}
                    href={`/datasets/${datasetId}/items/${id}`}
                    className="col-span-2 gap-2"
                  >
                    <VersionInfo variant="same" version={itemB?.datasetVersion} />
                  </ItemList.LinkCell>
                )}

                {status === "changed" ? (
                  <ItemList.LinkCell
                    LinkComponent={Link}
                    href={`/datasets/${datasetId}/items/${id}/versions?ids=${itemA?.datasetVersion},${itemB?.datasetVersion}`}
                  >
                    对比
                  </ItemList.LinkCell>
                ) : (
                  <ItemList.Cell>
                    <EmptyCell tooltip={<>仅可对比已更改的数据项</>} />
                  </ItemList.Cell>
                )}
              </ItemList.Row>
            );
          })}
        </ItemList.Items>
      </ItemList.Scroller>
    </ItemList>
  );
}
