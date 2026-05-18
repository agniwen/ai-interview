"use client";

// 简历库顶部「未完成的批量上传」卡片：用户上次关掉浏览器后留下的活跃批次会在此提示，
// 可点「继续」从中断处接着跑，或「放弃」撤销整批未处理项（已入库的简历保留）。
// Resume library top banner for an in-flight bulk upload left over from a prior
// session. Continue resumes from where it paused; cancel aborts all remaining
// pending items (already-imported resumes remain untouched).

import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getActiveBulkResumeBatch } from "@/lib/client/api/endpoints/bulk-resume-upload";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

interface Props {
  onContinue: (batchId: string) => void;
  onCancel: (batchId: string) => void;
}

export function ActiveBatchBanner({ onCancel, onContinue }: Props) {
  const slug = useWorkspaceSlug();
  const { data } = useQuery({
    queryFn: () => getActiveBulkResumeBatch(slug),
    queryKey: ["active-bulk-batch", slug],
  });
  if (!data) {
    return null;
  }
  const { batch } = data;
  return (
    <Alert>
      <AlertTitle>未完成的批量上传</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">
          进度 {batch.processedCount}/{batch.totalCount} · 成功 {batch.succeededCount} · 失败{" "}
          {batch.failedCount} · 跳过 {batch.skippedCount}
        </span>
        <div className="flex gap-2">
          <Button onClick={() => onContinue(batch.id)} size="sm">
            继续
          </Button>
          <Button onClick={() => onCancel(batch.id)} size="sm" variant="outline">
            放弃
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
