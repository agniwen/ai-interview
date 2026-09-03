"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type { ResumePoolListRecord } from "@app/shared/resume-pool";
import { lazy, Suspense } from "react";
import { formatResumeCandidateTitle } from "@/components/features/resume/resume-record-display-id";
import { Modal } from "@/components/ui/modal";
import { fetchResumePoolItem } from "@/lib/client/api";

export interface ResumePoolDetailDialogContentProps {
  canRecommend: boolean;
  currentUserId: string | null;
  onOpenDuplicateMatches?: (record: ResumePoolListRecord) => void;
  record: ResumePoolListRecord | null;
  recordId?: string | null;
  slug: string;
}

interface ResumePoolDetailDialogProps extends ResumePoolDetailDialogContentProps {
  onOpenChange: (open: boolean) => void;
}

const ResumePoolDetailDialogContent = lazy(async () => {
  const mod = await import("./resume-pool-details");
  return { default: mod.ResumePoolDetailDialogContent };
});

function candidateTitle(record: ResumePoolListRecord | null) {
  if (!record) {
    return "候选人详情";
  }
  return formatResumeCandidateTitle(record.candidateName?.trim() || "未命名候选人", record.id);
}

export function ResumePoolDetailDialog({
  canRecommend,
  currentUserId,
  onOpenDuplicateMatches,
  onOpenChange,
  record,
  recordId,
  slug,
}: ResumePoolDetailDialogProps) {
  const itemId = record?.id ?? recordId ?? "";
  const detailQuery = useQuery({
    enabled: Boolean(itemId),
    queryFn: async () => {
      if (!itemId) {
        return null;
      }
      return await fetchResumePoolItem(slug, itemId);
    },
    queryKey: ["resume-pool", "detail", slug, itemId],
  });
  const detail = detailQuery.data ?? record;

  return (
    <Modal
      description={detail?.resumeFileName ?? record?.resumeFileName ?? undefined}
      onOpenChange={onOpenChange}
      open={Boolean(itemId)}
      size="2xl"
      title={candidateTitle(detail)}
    >
      <Suspense
        fallback={
          <output
            aria-live="polite"
            className="flex min-h-64 items-center justify-center gap-2 text-muted-foreground text-sm"
          >
            <IconLoader2 aria-hidden="true" className="size-4 animate-spin" />
            正在加载人才详情…
          </output>
        }
      >
        <ResumePoolDetailDialogContent
          canRecommend={canRecommend}
          currentUserId={currentUserId}
          onOpenDuplicateMatches={onOpenDuplicateMatches}
          record={record}
          recordId={recordId}
          slug={slug}
        />
      </Suspense>
    </Modal>
  );
}
