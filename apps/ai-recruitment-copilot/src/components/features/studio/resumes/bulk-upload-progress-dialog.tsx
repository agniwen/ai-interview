"use client";

import {
  CheckCircle2Icon,
  CircleIcon,
  LoaderCircleIcon,
  SkipForwardIcon,
  XCircleIcon,
} from "@/components/icons/hugeicons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import type { BulkResumeBatchItemDto } from "@arc/shared/bulk-resume-upload";
import type { BulkUploadState } from "./use-bulk-upload";

interface Props {
  open: boolean;
  state: BulkUploadState;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void | Promise<void>;
  onAbort: () => void;
  onResume: () => void | Promise<void>;
  onAfterClose?: () => void;
}

// 状态 → 标签文本 + Badge variant 映射。
// Maps item status to display label and Badge variant.
function itemStatusLabel(
  status: BulkResumeBatchItemDto["status"],
  target: "resume_library" | "resume_pool",
): {
  label: string;
  variant: "success" | "secondary" | "destructive" | "outline";
} {
  switch (status) {
    case "pending": {
      return { label: "排队中", variant: "outline" };
    }
    case "processing": {
      return { label: "处理中", variant: "secondary" };
    }
    case "succeeded": {
      return { label: target === "resume_pool" ? "已加入" : "已入库", variant: "success" };
    }
    case "failed": {
      return { label: "失败", variant: "destructive" };
    }
    case "duplicate_skipped": {
      return { label: "已跳过", variant: "secondary" };
    }
    case "cancelled": {
      return { label: "已取消", variant: "outline" };
    }
    default: {
      return { label: "未知", variant: "outline" };
    }
  }
}

// 根据状态渲染对应的行图标。
// Renders the appropriate row icon for each item status.
function ItemIcon({ status }: { status: BulkResumeBatchItemDto["status"] }) {
  if (status === "processing") {
    return <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" />;
  }
  if (status === "succeeded") {
    return <CheckCircle2Icon className="size-4 text-emerald-500" />;
  }
  if (status === "failed") {
    return <XCircleIcon className="size-4 text-destructive" />;
  }
  if (status === "duplicate_skipped") {
    return <SkipForwardIcon className="size-4 text-amber-500" />;
  }
  return <CircleIcon className="size-4 text-muted-foreground" />;
}

export function BulkUploadProgressDialog({
  onAfterClose,
  onAbort,
  onCancel,
  onOpenChange,
  onResume,
  open,
  state,
}: Props) {
  const { phase, detail } = state;
  const batch = detail?.batch;
  const items = detail?.items ?? [];
  const target = batch?.target ?? "resume_library";

  const total = batch?.totalCount ?? state.uploadStatus.length;
  const processed =
    batch?.processedCount ?? state.uploadStatus.filter((s) => s === "uploaded").length;
  const percent = total === 0 ? 0 : Math.round((processed / total) * 100);

  const isTerminal = phase === "completed" || phase === "cancelled";

  function handleOpenChange(next: boolean) {
    if (!next && !isTerminal) {
      // 非终止状态下点关闭等同 abort（不调取消 API）。
      // Treat close-when-active as abort (does not cancel server-side).
      onAbort();
    }
    onOpenChange(next);
    if (!next) {
      onAfterClose?.();
    }
  }

  // 根据当前阶段返回对话框标题。
  // Returns the dialog title for the current phase.
  function phaseTitle() {
    if (phase === "uploading") {
      return "正在上传文件…";
    }
    if (phase === "processing") {
      return target === "resume_pool" ? "正在加入简历广场" : "正在批量入库";
    }
    if (phase === "paused") {
      return "已暂停";
    }
    if (phase === "completed") {
      return target === "resume_pool" ? "简历加入完成" : "批量入库完成";
    }
    if (phase === "cancelled") {
      return "批次已取消";
    }
    return "准备中";
  }

  const title = phaseTitle();

  // 根据当前阶段构建 footer 按钮组。
  // Builds the footer button group for the current phase.
  function buildFooter() {
    if (isTerminal) {
      return (
        <div className="flex justify-end">
          <Button onClick={() => handleOpenChange(false)} type="button">
            关闭
          </Button>
        </div>
      );
    }
    if (phase === "paused") {
      return (
        <div className="flex justify-end gap-2">
          <Button onClick={() => handleOpenChange(false)} type="button" variant="ghost">
            稍后再说
          </Button>
          <Button onClick={onCancel} type="button" variant="destructive">
            取消批次
          </Button>
          <Button onClick={onResume} type="button">
            继续
          </Button>
        </div>
      );
    }
    return (
      <div className="flex justify-end gap-2">
        <Button onClick={() => handleOpenChange(false)} type="button" variant="ghost">
          关闭
        </Button>
        <Button onClick={onCancel} type="button" variant="destructive">
          取消批次
        </Button>
      </div>
    );
  }

  return (
    <Modal
      description={
        batch
          ? `成功 ${batch.succeededCount} · 失败 ${batch.failedCount} · 跳过 ${batch.skippedCount}`
          : undefined
      }
      dismissible={isTerminal}
      footer={buildFooter()}
      onOpenChange={handleOpenChange}
      open={open}
      showCloseButton
      size="lg"
      title={title}
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex justify-between text-muted-foreground text-xs">
            <span>
              {processed} / {total} 已处理
            </span>
            <span>{percent}%</span>
          </div>
          <Progress value={percent} />
        </div>

        <Card className="gap-0 overflow-hidden rounded-md py-0">
          <CardContent className="p-0">
            <ul className="max-h-72 space-y-1 overflow-y-auto bg-muted/20 p-2 text-sm">
              {items.length === 0 && phase === "uploading"
                ? state.uploadStatus.map((s, idx) => (
                    <li
                      className="flex items-center justify-between rounded px-2 py-1"
                      // 上传阶段无 id，用 index 作 key。Upload phase has no id; use index as key.
                      key={`upload-${idx}`}
                    >
                      <span className="min-w-0 truncate" title={state.uploadFileNames[idx]}>
                        {state.uploadFileNames[idx] ?? `文件 ${idx + 1}`}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {s === "uploaded" ? "已上传" : null}
                        {s === "failed" ? "上传失败" : null}
                        {s === "pending" ? "上传中" : null}
                      </span>
                    </li>
                  ))
                : items.map((item) => {
                    const meta = itemStatusLabel(item.status, target);
                    return (
                      <li
                        className="flex items-center justify-between gap-3 rounded px-2 py-1 hover:bg-background/60"
                        key={item.id}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <ItemIcon status={item.status} />
                          <span className="truncate">{item.originalFileName}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {item.errorMessage ? (
                            <span
                              className="max-w-[14em] truncate text-destructive text-xs"
                              title={item.errorMessage}
                            >
                              {item.errorMessage}
                            </span>
                          ) : null}
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                        </span>
                      </li>
                    );
                  })}
            </ul>
          </CardContent>
        </Card>

        {state.uploadError && phase === "idle" ? (
          <p className="text-destructive text-sm">{state.uploadError}</p>
        ) : null}
      </div>
    </Modal>
  );
}
