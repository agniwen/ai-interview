import {
  IconArrowBackUp,
  IconCircleOff,
  IconDots,
  IconEdit,
  IconEye,
  IconMessage2,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  canDeleteResumeRecord,
  canEditResumeRecord,
  canLaunchInterviewFromResume,
} from "@arc/shared/studio-resumes";
import { cn } from "@arc/shared/utils";
import type { ResumeLibraryCardProps } from "./resume-library-card.types";

const ACTION_ICON_CLASS = "size-4";

type ResumeLibraryCardActionsProps = Pick<
  ResumeLibraryCardProps,
  | "canCreateChat"
  | "canCreateInterview"
  | "canDeleteResumeLibrary"
  | "canUpdateResumeLibrary"
  | "onCopyDetailLink"
  | "onDelete"
  | "onEdit"
  | "onLaunchChat"
  | "onLaunchInterview"
  | "onOpenDetail"
  | "onPreviewResume"
  | "onTransition"
  | "record"
> & {
  canCopyLink: boolean;
};

function IconActionButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <TooltipProvider delay={700}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button aria-label={label} onClick={onClick} size="icon" type="button" variant="ghost">
              {children}
            </Button>
          }
        />
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function PreviewAction({
  onPreviewResume,
  record,
}: Pick<ResumeLibraryCardProps, "onPreviewResume" | "record">) {
  const documentKind = getResumeDocumentFileIconKind({ fileName: record.resumeFileName });
  const previewable = isPreviewableResumeDocumentInput({ fileName: record.resumeFileName });
  const canPreview = record.hasResumeFile && previewable;
  const previewLabel = record.resumeFileName ?? "查看简历";

  if (canPreview) {
    return (
      <TooltipProvider delay={700}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={previewLabel}
                className="group/pdf"
                onClick={() => onPreviewResume(record)}
                size="icon"
                title={previewLabel}
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
              </Button>
            }
          />
          <TooltipContent side="top">查看简历</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const disabledIcon = (
    <span
      aria-disabled="true"
      aria-label={record.hasResumeFile ? "该格式不支持预览" : "暂无可预览简历"}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md opacity-45 grayscale"
      title={record.hasResumeFile ? undefined : "暂无可预览简历"}
    >
      <ResumeDocumentFileIcon className={ACTION_ICON_CLASS} kind={documentKind} />
    </span>
  );

  return record.hasResumeFile ? (
    <UnsupportedResumeDocumentPreviewTooltip>
      {disabledIcon}
    </UnsupportedResumeDocumentPreviewTooltip>
  ) : (
    disabledIcon
  );
}

function MoreMenu({
  canClose,
  canCopyLink,
  canDelete,
  canLaunchChat,
  canPreviewFromMenu,
  canReactivate,
  onCopyDetailLink,
  onDelete,
  onLaunchChat,
  onPreviewResume,
  onTransition,
  record,
}: Pick<
  ResumeLibraryCardProps,
  "onCopyDetailLink" | "onDelete" | "onLaunchChat" | "onPreviewResume" | "onTransition" | "record"
> & {
  canClose: boolean;
  canCopyLink: boolean;
  canDelete: boolean;
  canLaunchChat: boolean;
  canPreviewFromMenu: boolean;
  canReactivate: boolean;
}) {
  return (
    <DropdownMenu modal={false}>
      <TooltipProvider delay={700}>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button aria-label="更多操作" size="icon" type="button" variant="ghost">
                    <IconDots className={ACTION_ICON_CLASS} />
                  </Button>
                }
              />
            }
          />
          <TooltipContent side="top">更多操作</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>更多操作</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {canCopyLink ? (
          <DropdownMenuItem onClick={() => onCopyDetailLink(record)}>复制详情链接</DropdownMenuItem>
        ) : null}
        {canLaunchChat ? (
          <DropdownMenuItem onClick={() => onLaunchChat(record)}>
            <IconMessage2 className={ACTION_ICON_CLASS} />
            发起 AI Chat
          </DropdownMenuItem>
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
  canCreateChat,
  canCreateInterview,
  canDeleteResumeLibrary,
  canUpdateResumeLibrary,
  onCopyDetailLink,
  onDelete,
  onEdit,
  onLaunchChat,
  onLaunchInterview,
  onOpenDetail,
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
  const canLaunchChat = canCreateChat && canLaunchInterviewFromResume(record.resumeParseStatus);
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
      <div className="flex items-center justify-end gap-1 xl:flex-col xl:items-center">
        <PreviewAction onPreviewResume={onPreviewResume} record={record} />
        <IconActionButton label="查看" onClick={() => onOpenDetail(record, "overview")}>
          <IconEye className={ACTION_ICON_CLASS} />
        </IconActionButton>
        {canEdit ? (
          <IconActionButton label="编辑" onClick={() => onEdit(record)}>
            <IconEdit className={ACTION_ICON_CLASS} />
          </IconActionButton>
        ) : null}
        {canLaunchInterview ? (
          <IconActionButton label="发起 AI 面试" onClick={() => onLaunchInterview(record)}>
            <IconSparkles className={ACTION_ICON_CLASS} />
          </IconActionButton>
        ) : null}
        <MoreMenu
          canClose={canClose}
          canCopyLink={canCopyLink}
          canDelete={canDelete}
          canLaunchChat={canLaunchChat}
          canPreviewFromMenu={canPreviewFromMenu}
          canReactivate={canReactivate}
          onCopyDetailLink={onCopyDetailLink}
          onDelete={onDelete}
          onLaunchChat={onLaunchChat}
          onPreviewResume={onPreviewResume}
          onTransition={onTransition}
          record={record}
        />
      </div>
    </div>
  );
}
