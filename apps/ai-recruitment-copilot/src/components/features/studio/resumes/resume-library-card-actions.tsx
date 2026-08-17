import {
  IconArrowBackUp,
  IconCircleOff,
  IconDots,
  IconEdit,
  IconFileText,
  IconLoader2,
  IconRefresh,
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
  | "canForceReparse"
  | "canRetryResumeParse"
  | "canUpdateResumeLibrary"
  | "onCopyDetailLink"
  | "onDelete"
  | "onEdit"
  | "onForceReparse"
  | "onLaunchInterview"
  | "onPreviewResume"
  | "onRetryParse"
  | "onTransition"
  | "record"
  | "retrying"
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
  canForceReparse,
  canPreviewFromMenu,
  canReactivate,
  forceReparsing,
  onCopyDetailLink,
  onDelete,
  onForceReparse,
  onPreviewResume,
  onTransition,
  record,
}: Pick<
  ResumeLibraryCardProps,
  "onCopyDetailLink" | "onDelete" | "onForceReparse" | "onPreviewResume" | "onTransition" | "record"
> & {
  canClose: boolean;
  canCopyLink: boolean;
  canDelete: boolean;
  canForceReparse: boolean;
  canPreviewFromMenu: boolean;
  canReactivate: boolean;
  forceReparsing: boolean;
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
        {canForceReparse ? (
          <DropdownMenuItem disabled={forceReparsing} onClick={() => onForceReparse(record)}>
            <IconRefresh className={ACTION_ICON_CLASS} />
            {forceReparsing ? "入队中" : "重新解析"}
          </DropdownMenuItem>
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

function resolveCardActionFlags({
  canCreateInterview,
  canDeleteResumeLibrary,
  canForceReparse,
  canRetryResumeParse,
  canUpdateResumeLibrary,
  record,
}: Pick<
  ResumeLibraryCardActionsProps,
  | "canCreateInterview"
  | "canDeleteResumeLibrary"
  | "canForceReparse"
  | "canRetryResumeParse"
  | "canUpdateResumeLibrary"
  | "record"
>) {
  const parseEditable = canEditResumeRecord(record.resumeParseStatus);
  const previewable = isPreviewableResumeDocumentInput({ fileName: record.resumeFileName });
  const isClosed = record.pipelineStage === "closed";
  const parseInFlight =
    record.resumeParseStatus === "queued" || record.resumeParseStatus === "processing";

  return {
    canClose: canUpdateResumeLibrary && parseEditable && !isClosed,
    canDelete: canDeleteResumeLibrary && canDeleteResumeRecord(record.resumeParseStatus),
    canEdit: canUpdateResumeLibrary && parseEditable,
    canLaunchInterview:
      canCreateInterview &&
      canLaunchInterviewFromResume(record.resumeParseStatus) &&
      !record.hasInterviewRounds &&
      !isClosed,
    canPreviewFromMenu: !parseEditable && record.hasResumeFile && previewable,
    canReactivate: canUpdateResumeLibrary && parseEditable && isClosed,
    canRetry:
      canUpdateResumeLibrary &&
      canRetryResumeParse &&
      record.resumeParseStatus === "failed" &&
      record.resumeParseRetryable === true,
    // Admin force reparse: any record with a file that is not already in-flight.
    showForceReparseInMenu: canForceReparse && record.hasResumeFile && !parseInFlight,
  };
}

export function ResumeLibraryCardActions({
  canCopyLink,
  canCreateInterview,
  canDeleteResumeLibrary,
  canForceReparse,
  canRetryResumeParse,
  canUpdateResumeLibrary,
  onCopyDetailLink,
  onDelete,
  onEdit,
  onForceReparse,
  onLaunchInterview,
  onPreviewResume,
  onRetryParse,
  onTransition,
  record,
  retrying,
}: ResumeLibraryCardActionsProps) {
  const flags = resolveCardActionFlags({
    canCreateInterview,
    canDeleteResumeLibrary,
    canForceReparse,
    canRetryResumeParse,
    canUpdateResumeLibrary,
    record,
  });

  return (
    <div className="flex justify-end self-center">
      <div className="flex items-center justify-end gap-1.5 xl:flex-col xl:items-stretch">
        <PreviewAction onPreviewResume={onPreviewResume} record={record} />
        {flags.canRetry ? (
          <Button
            className={ACTION_BUTTON_CLASS}
            disabled={retrying}
            onClick={() => onRetryParse(record)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {retrying ? (
              <IconLoader2 className={`${ACTION_ICON_CLASS} animate-spin`} />
            ) : (
              <IconRefresh className={ACTION_ICON_CLASS} />
            )}
            <span>{retrying ? "入队中" : "重新解析"}</span>
          </Button>
        ) : null}
        {flags.canEdit ? (
          <TextActionButton label="编辑" onClick={() => onEdit(record)}>
            <IconEdit className={ACTION_ICON_CLASS} />
          </TextActionButton>
        ) : null}
        {flags.canLaunchInterview ? (
          <TextActionButton label="AI面" onClick={() => onLaunchInterview(record)}>
            <IconSparkles className={ACTION_ICON_CLASS} />
          </TextActionButton>
        ) : null}
        {record.feishuDocumentUrl ? (
          <Button
            className={ACTION_BUTTON_CLASS}
            nativeButton={false}
            render={
              <a href={record.feishuDocumentUrl} rel="noopener noreferrer" target="_blank">
                <IconFileText className={ACTION_ICON_CLASS} />
                <span>评价表</span>
              </a>
            }
            size="sm"
            variant="ghost"
          />
        ) : null}
        <MoreMenu
          canClose={flags.canClose}
          canCopyLink={canCopyLink}
          canDelete={flags.canDelete}
          canForceReparse={flags.showForceReparseInMenu}
          canPreviewFromMenu={flags.canPreviewFromMenu}
          canReactivate={flags.canReactivate}
          forceReparsing={retrying && flags.showForceReparseInMenu}
          onCopyDetailLink={onCopyDetailLink}
          onDelete={onDelete}
          onForceReparse={onForceReparse}
          onPreviewResume={onPreviewResume}
          onTransition={onTransition}
          record={record}
        />
      </div>
    </div>
  );
}
