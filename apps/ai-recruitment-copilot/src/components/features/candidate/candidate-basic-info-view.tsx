"use client";

import type { ReactNode } from "react";
import { FileTextIcon, UploadIcon } from "lucide-react";
import { Suspense, lazy, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileThumbnail } from "@/components/ui/file-thumbnail";

const PdfPreviewDialog = lazy(async () => {
  const mod = await import("@/components/features/pdf/pdf-preview-dialog");
  return { default: mod.PdfPreviewDialog };
});

/**
 * 简历库与 AI 面试详情共用的"候选人基础信息卡片"。
 * 只读展示候选人身份维度的字段，附带可选 PDF 预览按钮与 footer 操作槽。
 *
 * Read-only candidate basic-info card shared between the resume library detail
 * dialog and the AI interview detail/edit dialogs. Exposes an optional footer
 * slot for callers (e.g. "编辑候选人信息" jump to the resume library).
 */
export interface CandidateBasicInfoViewProps {
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  jobDescriptionName: string | null;
  creatorName: string | null;
  /** 简历 PDF 文件名（仅展示）。Resume PDF filename, display only. */
  resumeFileName: string | null;
  /** 是否存在 PDF（决定预览按钮是否启用）。 */
  hasResumeFile: boolean;
  /** 预览 PDF 的 URL；省略则不渲染预览按钮。 */
  pdfPreviewUrl?: string;
  /** 替换简历文件的入口；通常打开编辑弹窗。 */
  onReplaceResumeFile?: () => void;
  /** 卡片底部的可选操作区（例如「编辑候选人信息」跳转按钮）。 */
  footer?: ReactNode;
  className?: string;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

function renderText(value: string | null) {
  return value && value.trim() ? value : "—";
}

export function CandidateBasicInfoView({
  candidateName,
  candidateEmail,
  candidatePhone,
  targetRole,
  jobDescriptionName,
  creatorName,
  resumeFileName,
  hasResumeFile,
  pdfPreviewUrl,
  onReplaceResumeFile,
  footer,
  className,
}: CandidateBasicInfoViewProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const canPreview = Boolean(pdfPreviewUrl && hasResumeFile);

  return (
    <div className={className}>
      <section className="space-y-2">
        <Row label="姓名" value={renderText(candidateName)} />
        <Row label="邮箱" value={renderText(candidateEmail)} />
        <Row label="电话" value={renderText(candidatePhone)} />
        <Row label="目标岗位" value={renderText(targetRole)} />
        <Row label="关联岗位" value={renderText(jobDescriptionName)} />
        <Row label="创建人" value={renderText(creatorName)} />
        <Row
          label="简历文件"
          value={
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
              <FileThumbnail
                className="w-18 shrink-0 rounded-md"
                file={{
                  name: resumeFileName ?? "resume.pdf",
                  type: "application/pdf",
                }}
                hasError={!hasResumeFile}
                previewAspectRatio={0.74}
                previewContent={
                  <div className="flex size-full flex-col items-center justify-center gap-1 bg-muted/70 text-muted-foreground">
                    <FileTextIcon className="size-5" />
                    <span className="font-medium text-[10px]">PDF</span>
                  </div>
                }
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-sm">{renderText(resumeFileName)}</div>
                  <div className="text-muted-foreground text-xs">
                    {hasResumeFile ? "简历附件" : "暂无 PDF 附件"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canPreview ? (
                    <Button
                      onClick={() => setPreviewOpen(true)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <FileTextIcon className="size-4" />
                      预览
                    </Button>
                  ) : null}
                  {onReplaceResumeFile ? (
                    <Button onClick={onReplaceResumeFile} size="sm" type="button" variant="outline">
                      <UploadIcon className="size-4" />
                      替换简历
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          }
        />
      </section>

      {footer ? <div className="mt-4 flex items-center justify-end gap-2">{footer}</div> : null}

      {canPreview && previewOpen && pdfPreviewUrl ? (
        <Suspense fallback={null}>
          <PdfPreviewDialog
            filename={resumeFileName ?? undefined}
            onOpenChange={setPreviewOpen}
            open={previewOpen}
            url={pdfPreviewUrl}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
