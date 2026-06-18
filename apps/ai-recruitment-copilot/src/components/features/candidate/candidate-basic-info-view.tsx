"use client";

import type { ReactNode } from "react";
import { UploadIcon } from "@/components/icons/hugeicons";
import { Button } from "@/components/ui/button";
import { ResumeDocumentFileIcon } from "@/components/features/resume/resume-document-file-icon";
import { ResumeDocumentPreviewButton } from "@/components/features/resume/resume-document-preview-button";
import { getResumeDocumentKind, resumeDocumentFormats } from "@arc/shared/resume-documents";

/**
 * 简历库与 AI 面试详情共用的"候选人基础信息卡片"。
 * 只读展示候选人身份维度的字段，附带可选简历预览按钮与 footer 操作槽。
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
  /** 简历文件名（仅展示）。Resume filename, display only. */
  resumeFileName: string | null;
  /** 是否存在简历附件（决定预览按钮是否启用）。 */
  hasResumeFile: boolean;
  /** 预览简历的 URL；省略则不渲染预览按钮。 */
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
      <div className="min-w-0 flex-1 break-words">{value}</div>
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
  const canPreview = Boolean(pdfPreviewUrl && hasResumeFile);
  const resumeDocumentKind = getResumeDocumentKind({
    fileName: resumeFileName ?? undefined,
  });
  const resumeDocumentLabel = resumeDocumentKind
    ? resumeDocumentFormats[resumeDocumentKind].label
    : "PDF";
  const resumeMediaType = resumeDocumentKind
    ? resumeDocumentFormats[resumeDocumentKind].mediaTypes[0]
    : "application/pdf";

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
            <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-2 py-1.5">
              <ResumeDocumentFileIcon
                className="size-7 shrink-0"
                kind={resumeDocumentKind ?? "pdf"}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm leading-5">
                  {renderText(resumeFileName)}
                </div>
                <div className="text-muted-foreground text-xs leading-4">
                  {hasResumeFile ? `${resumeDocumentLabel} 简历附件` : "暂无简历附件"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {canPreview && pdfPreviewUrl ? (
                  <ResumeDocumentPreviewButton
                    className="h-7 px-2 text-xs"
                    filename={resumeFileName}
                    mediaType={resumeMediaType}
                    url={pdfPreviewUrl}
                  />
                ) : null}
                {onReplaceResumeFile ? (
                  <Button
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={onReplaceResumeFile}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <UploadIcon className="size-3.5" />
                    替换
                  </Button>
                ) : null}
              </div>
            </div>
          }
        />
      </section>

      {footer ? <div className="mt-4 flex items-center justify-end gap-2">{footer}</div> : null}
    </div>
  );
}
