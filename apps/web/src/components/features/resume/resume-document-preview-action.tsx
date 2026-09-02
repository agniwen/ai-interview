"use client";

import {
  UnsupportedResumeDocumentPreviewTooltip,
  isPreviewableResumeDocumentInput,
} from "@/components/features/resume/resume-document-preview-button";
import {
  ResumeDocumentFileIcon,
  getResumeDocumentFileIconKind,
} from "@/components/features/resume/resume-document-file-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@app/shared/utils";

const ACTION_ICON_CLASS = "size-3.5";
const ACTION_BUTTON_CLASS = "h-8 gap-1 px-2 text-xs";

export function ResumeDocumentPreviewAction({
  fileName,
  hasResumeFile,
  onPreview,
}: {
  fileName: string | null | undefined;
  hasResumeFile: boolean;
  onPreview: () => void;
}) {
  const documentKind = getResumeDocumentFileIconKind({ fileName });
  const previewable = isPreviewableResumeDocumentInput({ fileName });
  const previewTitle = fileName ?? "查看简历";

  if (hasResumeFile && previewable) {
    return (
      <Button
        aria-label="查看简历"
        className={cn(ACTION_BUTTON_CLASS, "group/pdf")}
        onClick={onPreview}
        size="sm"
        title={previewTitle}
        type="button"
        variant="ghost"
      >
        <ResumeDocumentFileIcon
          className={cn(
            ACTION_ICON_CLASS,
            "transition-transform duration-200 group-hover/pdf:scale-[1.03] motion-reduce:group-hover/pdf:scale-100",
          )}
          kind={documentKind}
        />
        <span>简历</span>
      </Button>
    );
  }

  const disabledControl = (
    <span
      aria-disabled="true"
      aria-label={hasResumeFile ? "该格式不支持预览" : "暂无可预览简历"}
      className={cn(
        ACTION_BUTTON_CLASS,
        "inline-flex shrink-0 items-center justify-center rounded-md opacity-45 grayscale",
      )}
      data-resume-document-preview-disabled
      title={hasResumeFile ? previewTitle : "暂无可预览简历"}
    >
      <ResumeDocumentFileIcon className={ACTION_ICON_CLASS} kind={documentKind} />
      <span>简历</span>
    </span>
  );

  return hasResumeFile ? (
    <UnsupportedResumeDocumentPreviewTooltip>
      {disabledControl}
    </UnsupportedResumeDocumentPreviewTooltip>
  ) : (
    disabledControl
  );
}
