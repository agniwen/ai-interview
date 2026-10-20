"use client";

import {
  IconCircle,
  IconCircleCheck,
  IconCircleX,
  IconLoader2,
  IconPlayerSkipForward,
} from "@tabler/icons-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import type { BulkResumeBatchItemDto } from "@app/shared/bulk-resume-upload";
import { z } from "zod";
import type { BulkUploadState } from "./use-bulk-upload";

interface Props {
  open: boolean;
  state: BulkUploadState;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void | Promise<void>;
  onAbort: () => void;
  onResume: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
  onAfterClose?: () => void;
}

interface ItemStatusMeta {
  label: string;
  variant: "destructive" | "outline" | "secondary" | "success";
}

const duplicateMatchSnapshotSchema = z.array(
  z.object({
    candidateEmail: z.string().optional(),
    candidateName: z.string().optional(),
    candidatePhone: z.string().optional(),
  }),
);
type DuplicateMatchSnapshot = z.infer<typeof duplicateMatchSnapshotSchema>;

// 状态 → 标签文本 + Badge variant 映射。
// Maps item status to display label and Badge variant.
function itemStatusLabel(
  status: BulkResumeBatchItemDto["status"],
  target: "resume_library" | "resume_pool",
): ItemStatusMeta {
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
    return <IconLoader2 className="size-4 animate-spin text-muted-foreground" />;
  }
  if (status === "succeeded") {
    return <IconCircleCheck className="size-4 text-green" />;
  }
  if (status === "failed") {
    return <IconCircleX className="size-4 text-destructive" />;
  }
  if (status === "duplicate_skipped") {
    return <IconPlayerSkipForward className="size-4 text-amber" />;
  }
  return <IconCircle className="size-4 text-muted-foreground" />;
}

function duplicateMatchesText(snapshot: DuplicateMatchSnapshot): string | null {
  if (snapshot.length === 0) {
    return null;
  }
  const labels = snapshot.slice(0, 3).map((item) => {
    const name = item.candidateName ?? "未知候选人";
    const contact = item.candidateEmail ?? item.candidatePhone ?? null;
    return contact ? `${name}（${contact}）` : name;
  });
  if (labels.length === 0) {
    return null;
  }
  return `疑似重复：${labels.join("、")}`;
}

function uploadProgress(state: BulkUploadState) {
  const batch = state.detail?.batch;
  const hasUploads = state.uploadStatus.length > 0;
  const uploaded = state.uploadStatus.filter((status) => status === "uploaded").length;
  const failed = state.uploadStatus.filter((status) => status === "failed").length;
  const uploadFinished =
    uploaded + failed + state.uploadStatus.filter((status) => status === "cancelled").length;
  const showUploadFiles =
    hasUploads && !["processing", "completed", "paused"].includes(state.phase);
  const total = showUploadFiles ? state.uploadStatus.length : (batch?.totalCount ?? 0);
  const processed = showUploadFiles ? uploadFinished : (batch?.processedCount ?? 0);
  const percent = total === 0 ? 0 : Math.round((processed / total) * 100);

  return { failed, hasUploads, percent, processed, showUploadFiles, total, uploaded };
}

export function BulkUploadProgressDialog({
  onAfterClose,
  onAbort,
  onCancel,
  onOpenChange,
  onResume,
  onRetry,
  open,
  state,
}: Props) {
  const { phase, detail } = state;
  const batch = detail?.batch;
  const items = detail?.items ?? [];
  const target = batch?.target ?? "resume_library";

  const { hasUploads, showUploadFiles, uploaded, failed, total, processed, percent } =
    uploadProgress(state);

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
      return target === "resume_pool" ? "正在加入人才库" : "正在批量入库";
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
    if (phase === "creating") {
      return "正在提交解析任务…";
    }
    if (phase === "upload_failed") {
      return "文件上传失败";
    }
    if (phase === "partial_failure") {
      return "部分文件上传失败";
    }
    if (phase === "batch_failed") {
      return "批次提交待确认";
    }
    return "准备中";
  }

  const title = phaseTitle();

  // 根据当前阶段构建 footer 按钮组。
  // Builds the footer button group for the current phase.
  function buildFooter() {
    if (["upload_failed", "partial_failure", "batch_failed", "creating"].includes(phase)) {
      return (
        <div className="flex justify-end gap-2">
          <Button onClick={() => handleOpenChange(false)} type="button" variant="ghost">
            关闭
          </Button>
          {phase !== "batch_failed" && phase !== "creating" ? (
            <Button onClick={onCancel} type="button" variant="outline">
              结束本次上传
            </Button>
          ) : null}
          {state.canRetry && phase !== "creating" ? (
            <Button onClick={onRetry} type="button">
              {phase === "batch_failed" ? "重试提交" : "仅重试失败文件"}
            </Button>
          ) : null}
          {phase === "creating" ? (
            <Button disabled type="button">
              正在确认提交结果…
            </Button>
          ) : null}
        </div>
      );
    }
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
          {phase === "uploading" ? "停止上传" : "取消批次"}
        </Button>
      </div>
    );
  }

  return (
    <Modal
      description={
        batch
          ? `解析成功 ${batch.succeededCount} · 解析失败 ${batch.failedCount} · 跳过 ${batch.skippedCount}`
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
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1 flex justify-between text-muted-foreground text-xs">
            <span>
              {processed} / {total} {showUploadFiles ? "份文件已完成上传尝试" : "已处理"}
            </span>
            <span>{percent}%</span>
          </div>
          <Progress
            aria-label={showUploadFiles ? "文件上传进度" : "后台解析进度"}
            value={percent}
          />
          {hasUploads ? (
            <p className="mt-2 text-sm text-muted-foreground">
              上传成功 {uploaded} · 失败 {failed} · 已提交解析 {state.queuedCount}
            </p>
          ) : null}
          {hasUploads && batch ? (
            <p className="mt-2 text-sm text-muted-foreground">
              最近提交批次：{batch.processedCount} / {batch.totalCount}{" "}
              已处理。上传失败的文件不会影响已提交的解析任务。
            </p>
          ) : null}
        </div>

        <Card className="gap-0 overflow-hidden rounded-md py-0">
          <CardContent className="p-0">
            <ul className="max-h-72 space-y-1 overflow-y-auto bg-muted/20 p-2 text-sm">
              {showUploadFiles
                ? state.uploadStatus.map((s, idx) => (
                    <li
                      className="flex items-center justify-between rounded px-2 py-1"
                      // 上传阶段无 id，用 index 作 key。Upload phase has no id; use index as key.
                      key={`upload-${idx}`}
                    >
                      <div className="min-w-0">
                        <span className="block truncate" title={state.uploadFileNames[idx]}>
                          {state.uploadFileNames[idx] ?? `文件 ${idx + 1}`}
                        </span>
                        {state.uploadErrors[idx] ? (
                          <span className="block text-destructive text-xs">
                            {state.uploadErrors[idx]}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {s === "uploaded" ? "已上传" : null}
                        {s === "failed" ? "上传失败" : null}
                        {s === "pending" ? "等待上传" : null}
                        {s === "uploading" ? "上传中" : null}
                        {s === "retrying" ? `正在重试（${state.uploadAttempts[idx] - 1}/2）` : null}
                        {s === "cancelled" ? "已停止" : null}
                      </span>
                    </li>
                  ))
                : items.map((item) => {
                    const meta = itemStatusLabel(item.status, target);
                    const parsedDuplicateSnapshot = duplicateMatchSnapshotSchema.safeParse(
                      item.dedupMatchSnapshot,
                    );
                    const duplicateText =
                      item.status === "duplicate_skipped" && parsedDuplicateSnapshot.success
                        ? duplicateMatchesText(parsedDuplicateSnapshot.data)
                        : null;
                    return (
                      <li
                        className="flex items-start justify-between gap-3 rounded px-2 py-1 hover:bg-background/60"
                        key={item.id}
                      >
                        <span className="flex min-w-0 items-start gap-2">
                          <ItemIcon status={item.status} />
                          <span className="min-w-0">
                            <span className="block truncate">{item.originalFileName}</span>
                            {duplicateText ? (
                              <span className="block truncate text-amber-ink text-xs">
                                {duplicateText}
                              </span>
                            ) : null}
                          </span>
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

        {state.uploadError ? (
          <Alert variant="destructive">
            <AlertDescription>{state.uploadError}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}
