"use client";

import type { ResumeLibraryDetail } from "@/lib/shared/studio-resumes";
import { useQuery } from "@tanstack/react-query";
import { BotIcon, ExternalLinkIcon, FileTextIcon, PencilIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ResumeProfileView } from "@/components/resume-profile-view";
import { fetchStudioResume } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

const PdfPreviewDialog = dynamic(
  async () => {
    const mod = await import("@/components/pdf-preview-dialog");
    return mod.PdfPreviewDialog;
  },
  { ssr: false },
);

interface ResumeDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string | null;
  onEdit: (recordId: string) => void;
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value ?? "—"}</span>
    </div>
  );
}

export function ResumeDetailDialog({
  open,
  onOpenChange,
  recordId,
  onEdit,
}: ResumeDetailDialogProps) {
  const slug = useWorkspaceSlug();
  const router = useRouter();
  const [previewOpen, setPreviewOpen] = useState(false);

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
    <>
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
              <section className="space-y-2">
                <h3 className="font-medium text-sm">基本信息</h3>
                <DetailRow label="姓名" value={detail.candidateName} />
                <DetailRow label="邮箱" value={detail.candidateEmail} />
                <DetailRow label="电话" value={detail.candidatePhone} />
                <DetailRow label="目标岗位" value={detail.targetRole} />
                <DetailRow label="关联岗位" value={detail.jobDescriptionName} />
                <DetailRow label="创建人" value={detail.creatorName} />
              </section>

              <section className="space-y-2">
                <h3 className="font-medium text-sm">简历</h3>
                {detail.hasResumeFile ? (
                  <Button
                    onClick={() => setPreviewOpen(true)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <FileTextIcon className="size-4" />
                    预览 {detail.resumeFileName ?? "PDF"}
                  </Button>
                ) : (
                  <p className="text-muted-foreground text-sm">该候选人没有上传 PDF。</p>
                )}
              </section>

              {detail.notes ? (
                <section className="space-y-2">
                  <h3 className="font-medium text-sm">备注</h3>
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

      {detail?.hasResumeFile && previewOpen ? (
        <PdfPreviewDialog
          filename={detail.resumeFileName ?? undefined}
          onOpenChange={setPreviewOpen}
          open={previewOpen}
          url={`/api/w/${slug}/studio/resumes/${detail.id}/resume`}
        />
      ) : null}
    </>
  );
}
