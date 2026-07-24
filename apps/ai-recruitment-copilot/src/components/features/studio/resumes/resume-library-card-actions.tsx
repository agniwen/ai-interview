import {
  IconArrowBackUp,
  IconCircleOff,
  IconDots,
  IconEdit,
  IconSparkles,
} from "@tabler/icons-react";
import type { ReactNode } from "react";

import {
  UnsupportedResumeDocumentPreviewTooltip,
  isPreviewableResumeDocumentInput,
} from "@/components/features/resume/resume-document-preview-button";
import {
  ResumeDocumentFileIcon,
  getResumeDocumentFileIconKind,
} from "@/components/features/resume/resume-document-file-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  canDeleteResumeRecord,
  canEditResumeRecord,
  canLaunchInterviewFromResume,
} from "@arc/shared/studio-resumes";
import { cn } from "@arc/shared/utils";
import type { ResumeLibraryCardProps } from "./resume-library-card.types";

const ACTION_ICON_CLASS = "size-3.5";
const ACTION_BUTTON_CLASS = "h-8 gap-1 px-2 text-xs";

type ResumeLibraryCardActionsProps = Pick<
  ResumeLibraryCardProps,
  | "canCreateInterview"
  | "canDeleteResumeLibrary"
  | "canUpdateResumeLibrary"
  | "onCopyDetailLink"
  | "onDelete"
  | "onEdit"
  | "onLaunchInterview"
  | "onPreviewResume"
  | "onTransition"
  | "record"
> & {
  canCopyLink: boolean;
};

function TextActionButton({
  children,
  className,
  label,
  onClick,
  title,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <Button
      aria-label={label}
      className={cn(ACTION_BUTTON_CLASS, className)}
      onClick={onClick}
      size="sm"
      title={title}
      type="button"
      variant="ghost"
    >
      {children}
      <span>{label}</span>
    </Button>
  );
}

function PreviewAction({
  onPreviewResume,
  record,
}: Pick<ResumeLibraryCardProps, "onPreviewResume" | "record">) {
  const documentKind = getResumeDocumentFileIconKind({ fileName: record.resumeFileName });
  const previewable = isPreviewableResumeDocumentInput({ fileName: record.resumeFileName });
  const canPreview = record.hasResumeFile && previewable;
  const previewTitle = record.resumeFileName ?? "查看简历";

  if (canPreview) {
    return (
      <TextActionButton
        className="group/pdf"
        label="简历"
        onClick={() => onPreviewResume(record)}
        title={previewTitle}
      >
        <ResumeDocumentFileIcon
          className={cn(
            ACTION_ICON_CLASS,
            "transition-transform duration-200 group-hover/pdf:scale-[1.03] motion-reduce:group-hover/pdf:scale-100",
          )}
          kind={documentKind}
        />
      </TextActionButton>
    );
  }

  const disabledControl = (
    <span
      aria-disabled="true"
      aria-label={record.hasResumeFile ? "该格式不支持预览" : "暂无可预览简历"}
      className={cn(
        ACTION_BUTTON_CLASS,
        "inline-flex shrink-0 items-center justify-center rounded-md opacity-45 grayscale",
      )}
      title={record.hasResumeFile ? previewTitle : "暂无可预览简历"}
    >
      <ResumeDocumentFileIcon className={ACTION_ICON_CLASS} kind={documentKind} />
      <span>简历</span>
    </span>
  );

  return record.hasResumeFile ? (
    <UnsupportedResumeDocumentPreviewTooltip>
      {disabledControl}
    </UnsupportedResumeDocumentPreviewTooltip>
  ) : (
    disabledControl
  );
}

function MoreMenu({
  canClose,
  canCopyLink,
  canDelete,
  canPreviewFromMenu,
  canReactivate,
  onCopyDetailLink,
  onDelete,
  onPreviewResume,
  onTransition,
  record,
}: Pick<
  ResumeLibraryCardProps,
  "onCopyDetailLink" | "onDelete" | "onPreviewResume" | "onTransition" | "record"
> & {
  canClose: boolean;
  canCopyLink: boolean;
  canDelete: boolean;
  canPreviewFromMenu: boolean;
  canReactivate: boolean;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="更多"
            className={ACTION_BUTTON_CLASS}
            size="sm"
            type="button"
            variant="ghost"
          >
            <IconDots className={ACTION_ICON_CLASS} />
            <span>更多</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>更多操作</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {canCopyLink ? (
          <DropdownMenuItem onClick={() => onCopyDetailLink(record)}>复制详情链接</DropdownMenuItem>
        ) : null}
        {canPreviewFromMenu ? (
          <DropdownMenuItem onClick={() => onPreviewResume(record)}>查看简历</DropdownMenuItem>
        ) : null}
        {canClose ? (
          <DropdownMenuItem onClick={() => onTransition(record, "close")}>
            <IconCircleOff className={ACTION_ICON_CLASS} />
            标记结案
          </DropdownMenuItem>
        ) : null}
        {canReactivate ? (
          <DropdownMenuItem onClick={() => onTransition(record, "reactivate")}>
            <IconArrowBackUp className={ACTION_ICON_CLASS} />
            重新激活
          </DropdownMenuItem>
        ) : null}
        {canDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onDelete(record)} variant="destructive">
              删除
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ResumeLibraryCardActions({
  canCopyLink,
  canCreateInterview,
  canDeleteResumeLibrary,
  canUpdateResumeLibrary,
  onCopyDetailLink,
  onDelete,
  onEdit,
  onLaunchInterview,
  onPreviewResume,
  onTransition,
  record,
}: ResumeLibraryCardActionsProps) {
  const canEdit = canUpdateResumeLibrary && canEditResumeRecord(record.resumeParseStatus);
  const canDelete = canDeleteResumeLibrary && canDeleteResumeRecord(record.resumeParseStatus);
  const previewable = isPreviewableResumeDocumentInput({ fileName: record.resumeFileName });
  const canLaunchInterview =
    canCreateInterview &&
    canLaunchInterviewFromResume(record.resumeParseStatus) &&
    !record.hasInterviewRounds &&
    record.pipelineStage !== "closed";
  const canPreviewFromMenu =
    !canEditResumeRecord(record.resumeParseStatus) && record.hasResumeFile && previewable;
  const canClose =
    canUpdateResumeLibrary &&
    canEditResumeRecord(record.resumeParseStatus) &&
    record.pipelineStage !== "closed";
  const canReactivate =
    canUpdateResumeLibrary &&
    canEditResumeRecord(record.resumeParseStatus) &&
    record.pipelineStage === "closed";

  return (
    <div className="flex justify-end self-center">
      <div className="flex items-center justify-end gap-1.5 xl:flex-col xl:items-stretch">
        <PreviewAction onPreviewResume={onPreviewResume} record={record} />
        {canEdit ? (
          <TextActionButton label="编辑" onClick={() => onEdit(record)}>
            <IconEdit className={ACTION_ICON_CLASS} />
          </TextActionButton>
        ) : null}
        {canLaunchInterview ? (
          <TextActionButton label="AI面" onClick={() => onLaunchInterview(record)}>
            <IconSparkles className={ACTION_ICON_CLASS} />
          </TextActionButton>
        ) : null}
        <MoreMenu
          canClose={canClose}
          canCopyLink={canCopyLink}
          canDelete={canDelete}
          canPreviewFromMenu={canPreviewFromMenu}
          canReactivate={canReactivate}
          onCopyDetailLink={onCopyDetailLink}
          onDelete={onDelete}
          onPreviewResume={onPreviewResume}
          onTransition={onTransition}
          record={record}
        />
      </div>
    </div>
  );
}
