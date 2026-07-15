"use client";

import type { DatasetItem } from "@mastra/client-js";
import { KeyValueList } from "@mastra/playground-ui/components/KeyValueList";
import { Sections } from "@mastra/playground-ui/components/Sections";
import { SideDialog } from "@mastra/playground-ui/components/SideDialog";
import { TextAndIcon } from "@mastra/playground-ui/components/Text";
import { format } from "date-fns/format";
import { HashIcon, FileInputIcon, FileOutputIcon, TagIcon, RouteIcon } from "lucide-react";

export interface DatasetItemPageProps {
  item: DatasetItem;
}

/**
 * Read-only view of the dataset item details
 */
function DatasetItemContent({ item }: { item: DatasetItem }) {
  const metadataDisplay = item.metadata ? JSON.stringify(item.metadata, null, 2) : null;
  const trajectoryDisplay = item.expectedTrajectory
    ? JSON.stringify(item.expectedTrajectory, null, 2)
    : null;

  return (
    <>
      <div className="mb-4">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <FileInputIcon className="w-5 h-5" /> 数据项
        </h3>
        <TextAndIcon>
          <HashIcon className="w-4 h-4" /> {item.id}
        </TextAndIcon>
      </div>

      <Sections>
        <KeyValueList
          data={[
            {
              key: "createdAt",
              label: "创建时间",
              value: format(new Date(item.createdAt), "yyyy/MM/dd HH:mm"),
            },
            ...(item.datasetVersion !== null && item.datasetVersion !== undefined
              ? [
                  {
                    key: "version",
                    label: "版本",
                    value: `v${item.datasetVersion}`,
                  },
                ]
              : []),
          ]}
        />

        <SideDialog.CodeSection
          title="输入"
          icon={<FileInputIcon />}
          codeStr={JSON.stringify(item.input, null, 2)}
        />

        {item.groundTruth !== null && item.groundTruth !== undefined && (
          <SideDialog.CodeSection
            title="标准答案"
            icon={<FileOutputIcon />}
            codeStr={JSON.stringify(item.groundTruth, null, 2)}
          />
        )}

        {trajectoryDisplay && (
          <SideDialog.CodeSection
            title="预期轨迹"
            icon={<RouteIcon />}
            codeStr={trajectoryDisplay}
          />
        )}

        {metadataDisplay && (
          <SideDialog.CodeSection title="元数据" icon={<TagIcon />} codeStr={metadataDisplay} />
        )}
      </Sections>
    </>
  );
}

export function DatasetItemPage({ item }: DatasetItemPageProps) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <DatasetItemContent item={item} />
    </div>
  );
}

export default DatasetItemPage;
