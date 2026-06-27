"use client";

import { IconEye, IconLoader2 } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { BulkResumeBatchDto } from "@arc/shared/bulk-resume-upload";

interface Props {
  batches: BulkResumeBatchDto[];
  isLoading?: boolean;
  open: boolean;
  onOpenBatch: (batch: BulkResumeBatchDto) => void;
  onOpenChange: (open: boolean) => void;
}

function isActiveBatch(status: BulkResumeBatchDto["status"]) {
  return status === "pending" || status === "running";
}

function statusMeta(status: BulkResumeBatchDto["status"]): {
  label: string;
  variant: "success" | "secondary" | "outline";
} {
  switch (status) {
    case "pending": {
      return { label: "排队中", variant: "secondary" };
    }
    case "running": {
      return { label: "处理中", variant: "secondary" };
    }
    case "completed": {
      return { label: "已完成", variant: "success" };
    }
    case "cancelled": {
      return { label: "已取消", variant: "outline" };
    }
    default: {
      return { label: "未知", variant: "outline" };
    }
  }
}

function formatBatchTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });
}

export function UploadBatchListDialog({
  batches,
  isLoading = false,
  onOpenBatch,
  onOpenChange,
  open,
}: Props) {
  return (
    <Modal
      footer={
        <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
          关闭
        </Button>
      }
      onOpenChange={onOpenChange}
      open={open}
      size="lg"
      title="上传批次"
    >
      <div className="space-y-2">
        {isLoading ? (
          <div className="flex h-24 items-center justify-center text-muted-foreground text-sm">
            <IconLoader2 className="mr-2 size-4 animate-spin" />
            正在加载批次…
          </div>
        ) : null}
        {!isLoading && batches.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-muted-foreground text-sm">
            暂无上传批次
          </div>
        ) : null}
        {batches.map((batch) => {
          const meta = statusMeta(batch.status);
          const active = isActiveBatch(batch.status);
          return (
            <div
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              key={batch.id}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {formatBatchTime(batch.createdAt)} 上传
                  </span>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                </div>
                <div className="truncate text-muted-foreground text-xs">
                  {batch.processedCount}/{batch.totalCount} 已处理 · 成功 {batch.succeededCount} ·
                  失败 {batch.failedCount} · 跳过 {batch.skippedCount}
                </div>
              </div>
              <Button
                onClick={() => {
                  onOpenBatch(batch);
                }}
                size="sm"
                type="button"
                variant={active ? "default" : "outline"}
              >
                <IconEye className="size-4" />
                {active ? "查看进度" : "查看"}
              </Button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
