"use client";

import type { ResumeLibraryDetail } from "@/lib/shared/studio-resumes";
import { useQuery } from "@tanstack/react-query";
import { BotIcon, ExternalLinkIcon, PencilIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { CandidateBasicInfoView } from "@/components/candidate-basic-info-view";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ResumeProfileView } from "@/components/resume-profile-view";
import { fetchStudioResume } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

interface ResumeDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string | null;
  onEdit: (recordId: string) => void;
}

export function ResumeDetailDialog({
  open,
  onOpenChange,
  recordId,
  onEdit,
}: ResumeDetailDialogProps) {
  const slug = useWorkspaceSlug();
  const router = useRouter();

  const query = useQuery({
    enabled: open && Boolean(recordId),
    queryFn: () => fetchStudioResume(slug, recordId as string),
    queryKey: ["studio-resumes", slug, "detail", recordId] as const,
    staleTime: 30 * 1000,
  });

  const detail: ResumeLibraryDetail | null = query.data ?? null;

  function handleStartInterview() {
    if (!recordId) {
      return;
    }
    router.push(`/w/${slug}/studio/interviews?recordId=${recordId}`);
    onOpenChange(false);
  }

  return (
    <Modal
      onOpenChange={onOpenChange}
      open={open}
      title="简历详情"
      description="查看候选人基础信息与结构化简历。不显示面试态字段。"
      size="lg"
    >
      <div className="space-y-6">
        {query.isLoading || !detail ? (
          <p className="text-muted-foreground text-sm">加载中…</p>
        ) : (
          <>
            <CandidateBasicInfoView
              candidateName={detail.candidateName}
              candidateEmail={detail.candidateEmail}
              candidatePhone={detail.candidatePhone}
              targetRole={detail.targetRole}
              jobDescriptionName={detail.jobDescriptionName}
              creatorName={detail.creatorName}
              resumeFileName={detail.resumeFileName}
              hasResumeFile={detail.hasResumeFile}
              pdfPreviewUrl={
                detail.hasResumeFile
                  ? `/api/w/${slug}/studio/resumes/${detail.id}/resume`
                  : undefined
              }
            />

            {detail.notes ? (
              <section className="space-y-2">
                <h3 className="font-medium text-sm">简历评价</h3>
                <p className="whitespace-pre-line text-sm">{detail.notes}</p>
              </section>
            ) : null}

            <section className="space-y-3">
              <h3 className="font-medium text-sm">结构化简历</h3>
              <ResumeProfileView profile={detail.resumeProfile} />
            </section>
          </>
        )}
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
        {detail ? (
          <>
            <Button onClick={() => onEdit(detail.id)} type="button" variant="outline">
              <PencilIcon className="size-4" />
              编辑
            </Button>
            <Button onClick={handleStartInterview} type="button">
              <BotIcon className="size-4" />
              发起 AI 面试
              <ExternalLinkIcon className="size-3.5 opacity-70" />
            </Button>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
