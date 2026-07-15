"use client";

import type { DatasetItem } from "@mastra/client-js";
import { CopyButton } from "@mastra/playground-ui/components/CopyButton";
import { MainHeader } from "@mastra/playground-ui/components/MainHeader";
import { TextAndIcon } from "@mastra/playground-ui/components/Text";
import { format } from "date-fns/format";
import { Calendar1Icon, HistoryIcon, FileCodeIcon } from "lucide-react";

/**
 * Header component for dataset item details
 */
export interface DatasetItemHeaderProps {
  item: DatasetItem;
}

export function DatasetItemHeader({ item }: DatasetItemHeaderProps) {
  return (
    <MainHeader withMargins={false}>
      <MainHeader.Column>
        <MainHeader.Title size="smaller">
          <FileCodeIcon />
          <span className="truncate">{item.id}</span>
          <CopyButton content={item.id} tooltip={`复制数据项 ID：${item.id}`} />
        </MainHeader.Title>
        <MainHeader.Description>
          <TextAndIcon>
            <Calendar1Icon /> 创建时间 {format(new Date(item.createdAt), "yyyy/MM/dd HH:mm")}
          </TextAndIcon>
          {item.datasetVersion !== null && item.datasetVersion !== undefined && (
            <TextAndIcon>
              <HistoryIcon /> 版本 v{item.datasetVersion}
            </TextAndIcon>
          )}
        </MainHeader.Description>
      </MainHeader.Column>
    </MainHeader>
  );
}
