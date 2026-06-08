"use client";

// 简历库顶部「未完成的批量上传」卡片：用户上次关掉浏览器后留下的活跃批次会在此提示，
// 可点「查看」打开进度详情，或「取消」撤销整批未处理项（已入库的简历保留）。
// Resume library top banner for an in-flight bulk upload left over from a prior
// session. View opens progress details; cancel aborts all remaining pending
// items (already-imported resumes remain untouched).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getActiveBulkResumeBatch } from "@/lib/client/api/endpoints/bulk-resume-upload";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

interface Props {
  onContinue: (batchId: string) => void;
  onCancel: (batchId: string) => void | Promise<void>;
}

export function ActiveBatchBanner({ onCancel, onContinue }: Props) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const [isCancelling, setIsCancelling] = useState(false);
  const { data } = useQuery({
    queryFn: () => getActiveBulkResumeBatch(slug),
    queryKey: ["active-bulk-batch", slug],
    refetchInterval: 10_000,
  });
  useEffect(() => {
    if (!data) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
  }, [data, queryClient]);
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
          <Button disabled={isCancelling} onClick={() => onContinue(batch.id)} size="sm">
            查看
          </Button>
          <Button
            disabled={isCancelling}
            onClick={async () => {
              setIsCancelling(true);
              try {
                await onCancel(batch.id);
              } finally {
                setIsCancelling(false);
              }
            }}
            size="sm"
            variant="outline"
          >
            {isCancelling ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
            {isCancelling ? "正在取消…" : "取消"}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
