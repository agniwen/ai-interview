import {
  IconArrowBackUp,
  IconBriefcase,
  IconCircleOff,
  IconDots,
  IconEdit,
  IconEye,
  IconMail,
  IconMessage2,
  IconPhone,
  IconSparkles,
} from "@tabler/icons-react";
import AvvvatarsModule from "avvvatars-react";
import { memo } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { TimeDisplay } from "@/components/features/display/time-display";
import {
  UnsupportedResumeDocumentPreviewTooltip,
  isPreviewableResumeDocumentInput,
} from "@/components/features/resume/resume-document-preview-button";
import {
  ResumeDocumentFileIcon,
  getResumeDocumentFileIconKind,
} from "@/components/features/resume/resume-document-file-icon";
import { ResumeLifecycleBadge } from "@/components/features/studio/resumes/resume-lifecycle-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  canDeleteResumeRecord,
  canEditResumeRecord,
  canLaunchInterviewFromResume,
  describeResumeProgress,
} from "@arc/shared/studio-resumes";
import type {
  ResumeLibraryListRecord,
  ResumeLibraryProfileSnapshotLine,
} from "@arc/shared/studio-resumes";
import { cn } from "@arc/shared/utils";

export type ResumeDetailDefaultTab = "overview" | "rounds" | "human-interview" | "offer";

const RESUME_LIBRARY_ACTION_ICON_CLASS = "size-4";

const Avvvatars =
  typeof AvvvatarsModule === "function"
    ? AvvvatarsModule
    : (AvvvatarsModule as unknown as { default: typeof AvvvatarsModule }).default;

function lifecycleTargetTab(record: ResumeLibraryListRecord): ResumeDetailDefaultTab {
  if (record.pipelineStage === "ai_interview") {
    return "rounds";
  }
  if (record.pipelineStage === "human_interview") {
    return "human-interview";
  }
  if (record.pipelineStage === "offer") {
    return "offer";
  }
  return "overview";
}

function describeCompactAiLifecycle(record: ResumeLibraryListRecord): string {
  const progress = record.stageProgress.aiInterview;
  if (!progress || progress.totalRounds === 0) {
    return "未排期";
  }
  if (!progress.activeRound) {
    return "完成待决策";
  }

  const current = progress.activeRound.sortOrder + 1;
  if (["in_progress", "interrupted"].includes(progress.activeRound.status)) {
    return `${current}/${progress.totalRounds} 进行中`;
  }
  if (progress.hasStarted) {
    return `${current}/${progress.totalRounds} 待下轮`;
  }
  return `${current}/${progress.totalRounds} 待进场`;
}

function describeCompactHumanLifecycle(record: ResumeLibraryListRecord): string {
  const progress = record.stageProgress.humanInterview;
  if (!progress || progress.totalRounds === 0) {
    return "未安排";
  }
  if (!progress.activeRound) {
    return `${progress.passedRounds}/${progress.totalRounds}通过待决策`;
  }

  const current = progress.activeRound.sortOrder + 1;
  if (progress.activeRound.scheduledAt) {
    return `${current}/${progress.totalRounds} 已安排`;
  }
  return `${current}/${progress.totalRounds} 待安排`;
}

function describeCompactOfferLifecycle(record: ResumeLibraryListRecord): string {
  const progress = record.stageProgress.offer;
  const draft = progress?.latestDraft;
  if (!progress || !draft) {
    return "待发出";
  }

  const version = progress.totalVersions > 1 ? `v${draft.version} ` : "";
  switch (draft.status) {
    case "draft": {
      return `${version}草稿`;
    }
    case "sent": {
      return `${version}已发待回复`;
    }
    case "accepted": {
      return `${version}接受待结案`;
    }
    case "declined": {
      return `${version}已拒绝`;
    }
    case "expired": {
      return `${version}已过期`;
    }
    default: {
      return `${version}待回复`;
    }
  }
}

function describeCompactLifecycleDetail(
  record: ResumeLibraryListRecord,
  fallback: string | null,
): string | null {
  if (record.pipelineStage === "ai_interview") {
    return describeCompactAiLifecycle(record);
  }
  if (record.pipelineStage === "human_interview") {
    return describeCompactHumanLifecycle(record);
  }
  if (record.pipelineStage === "offer") {
    return describeCompactOfferLifecycle(record);
  }
  return fallback;
}

function describeLifecycleCell(record: ResumeLibraryListRecord) {
  const progress = describeResumeProgress(record);
  const [stageLabel, ...detailParts] = progress.label.split(" · ");

  return {
    detailLabel: describeCompactLifecycleDetail(record, detailParts.join(" · ") || null),
    fullLabel: progress.label,
    stageLabel,
    tone: progress.tone,
  };
}

function textOrDash(value: string | null | undefined) {
  const text = value?.trim();
  return text || "—";
}

function formatResumeCardContact(value: string | null | undefined, fallback: string) {
  const text = value?.trim();
  return text || fallback;
}

function isResumeCardInteractiveClick(event: ReactMouseEvent<HTMLElement>) {
  const { target } = event;
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      "a,button,input,label,select,textarea,[role='button'],[role='menuitem'],[data-resume-card-interactive='true']",
    ),
  );
}

function getCreatorInitial(name: string | null | undefined) {
  return name?.trim().slice(0, 1).toUpperCase() || "?";
}

function getResumeLibraryJobDescriptionLabel(record: ResumeLibraryListRecord) {
  return record.jobDescriptionName
    ? [record.jobDescriptionDepartmentName, record.jobDescriptionName].filter(Boolean).join(" / ")
    : null;
}

function canCopyResumeDetailLink({
  currentMemberRole,
  currentUserId,
  record,
}: {
  currentMemberRole: string;
  currentUserId: string | null;
  record: ResumeLibraryListRecord;
}) {
  return (
    currentMemberRole === "owner" ||
    currentMemberRole === "admin" ||
    (Boolean(currentUserId) && record.createdBy === currentUserId)
  );
}

function duplicateMatchBadge(record: ResumeLibraryListRecord, onClick?: () => void) {
  if (!record.duplicateMatch) {
    return null;
  }
  const label =
    record.duplicateMatch.count > 1 ? `疑似重复 ${record.duplicateMatch.count} 条` : "疑似重复";
  const variant = record.duplicateMatch.highestLevel === "high" ? "destructive" : "secondary";
  return onClick ? (
    <Badge asChild className="shrink-0 cursor-pointer" variant={variant}>
      <button
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        }}
        type="button"
      >
        {label}
      </button>
    </Badge>
  ) : (
    <Badge className="shrink-0" variant={variant}>
      {label}
    </Badge>
  );
}

function getResumeAvatarValue(record: ResumeLibraryListRecord) {
  return [record.candidateName, record.candidateEmail].filter(Boolean).join(" ") || record.id;
}

function ResumeCardMetaItem({
  children,
  className,
  icon,
  label,
}: {
  children: ReactNode;
  className?: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-6 min-w-0 items-center gap-1.5 text-muted-foreground text-xs",
        className,
      )}
    >
      <span aria-hidden className="inline-flex shrink-0 items-center text-muted-foreground/70">
        {icon}
      </span>
      <span className="sr-only">{label}</span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

function ResumeCardCreatorMeta({ image, name }: { image: string | null; name: string | null }) {
  const displayName = textOrDash(name);

  return (
    <span className="inline-flex h-6 min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
      <Avatar size="sm" className="size-4!">
        {image ? <AvatarImage alt={displayName} src={image} /> : null}
        <AvatarFallback>{getCreatorInitial(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate">{displayName}</span>
    </span>
  );
}

function ResumeCardProfileSnapshot({
  snapshot,
}: {
  snapshot: {
    education: ResumeLibraryProfileSnapshotLine | null;
    work: ResumeLibraryProfileSnapshotLine | null;
  };
}) {
  if (!(snapshot.work || snapshot.education)) {
    return <div className="hidden xl:block" />;
  }

  return (
    <div className="ml-22 grid min-w-0 content-start gap-1 text-sm xl:ml-0 xl:max-w-sm xl:self-start xl:pt-8.5">
      {[snapshot.work, snapshot.education].map((line) =>
        line ? (
          <p
            className="flex min-w-0 items-baseline gap-2"
            key={`${line.primary}-${line.secondary ?? ""}-${line.period ?? ""}`}
            title={[line.period, line.primary, line.secondary].filter(Boolean).join(" · ")}
          >
            {line.period ? (
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {line.period}
              </span>
            ) : null}
            <span className="min-w-0 truncate text-foreground text-sm">
              {[line.primary, line.secondary].filter(Boolean).join(" · ")}
            </span>
          </p>
        ) : null,
      )}
    </div>
  );
}

export interface ResumeLibraryCardProps {
  canCreateChat: boolean;
  canCreateInterview: boolean;
  canDeleteResumeLibrary: boolean;
  canUpdateResumeLibrary: boolean;
  currentMemberRole: string;
  currentUserId: string | null;
  onCopyDetailLink: (record: ResumeLibraryListRecord) => void;
  onDelete: (record: ResumeLibraryListRecord) => void;
  onEdit: (record: ResumeLibraryListRecord) => void;
  onLaunchChat: (record: ResumeLibraryListRecord) => void;
  onLaunchInterview: (record: ResumeLibraryListRecord) => void;
  onOpenDetail: (record: ResumeLibraryListRecord, tab?: ResumeDetailDefaultTab) => void;
  onPreviewResume: (record: ResumeLibraryListRecord) => void;
  onSelectChange: (checked: boolean) => void;
  onShowDuplicateMatches: (record: ResumeLibraryListRecord) => void;
  onTransition: (record: ResumeLibraryListRecord, mode: "close" | "reactivate") => void;
  onViewJobDescription: (id: string) => void;
  record: ResumeLibraryListRecord;
  selected: boolean;
}

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

function ResumeLibraryIconActionButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip delayDuration={700}>
      <TooltipTrigger asChild>
        <Button aria-label={label} onClick={onClick} size="icon" type="button" variant="ghost">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function ResumeLibraryPreviewAction({
  onPreviewResume,
  record,
}: Pick<ResumeLibraryCardProps, "onPreviewResume" | "record">) {
  const documentKind = getResumeDocumentFileIconKind({ fileName: record.resumeFileName });
  const previewable = isPreviewableResumeDocumentInput({ fileName: record.resumeFileName });
  const canPreview = record.hasResumeFile && previewable;
  const previewLabel = record.resumeFileName ?? "查看简历";

  if (canPreview) {
    return (
      <Tooltip delayDuration={700}>
        <TooltipTrigger asChild>
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
                RESUME_LIBRARY_ACTION_ICON_CLASS,
                "transition-transform duration-200 group-hover/pdf:scale-[1.03] motion-reduce:group-hover/pdf:scale-100",
              )}
              kind={documentKind}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">查看简历</TooltipContent>
      </Tooltip>
    );
  }

  const disabledIcon = (
    <span
      aria-disabled="true"
      aria-label={record.hasResumeFile ? "该格式不支持预览" : "暂无可预览简历"}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md opacity-45 grayscale"
      title={record.hasResumeFile ? undefined : "暂无可预览简历"}
    >
      <ResumeDocumentFileIcon className={RESUME_LIBRARY_ACTION_ICON_CLASS} kind={documentKind} />
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

function ResumeLibraryCardActions({
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
        <ResumeLibraryPreviewAction onPreviewResume={onPreviewResume} record={record} />
        <ResumeLibraryIconActionButton
          label="查看"
          onClick={() => onOpenDetail(record, "overview")}
        >
          <IconEye className={RESUME_LIBRARY_ACTION_ICON_CLASS} />
        </ResumeLibraryIconActionButton>
        {canEdit ? (
          <ResumeLibraryIconActionButton label="编辑" onClick={() => onEdit(record)}>
            <IconEdit className={RESUME_LIBRARY_ACTION_ICON_CLASS} />
          </ResumeLibraryIconActionButton>
        ) : null}
        {canLaunchInterview ? (
          <ResumeLibraryIconActionButton
            label="发起 AI 面试"
            onClick={() => onLaunchInterview(record)}
          >
            <IconSparkles className={RESUME_LIBRARY_ACTION_ICON_CLASS} />
          </ResumeLibraryIconActionButton>
        ) : null}
        <DropdownMenu modal={false}>
          <Tooltip delayDuration={700}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button aria-label="更多操作" size="icon" type="button" variant="ghost">
                  <IconDots className={RESUME_LIBRARY_ACTION_ICON_CLASS} />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">更多操作</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>更多操作</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {canCopyLink ? (
              <DropdownMenuItem onSelect={() => onCopyDetailLink(record)}>
                复制详情链接
              </DropdownMenuItem>
            ) : null}
            {canCreateChat ? (
              <DropdownMenuItem onSelect={() => onLaunchChat(record)}>
                <IconMessage2 className={RESUME_LIBRARY_ACTION_ICON_CLASS} />
                发起 AI Chat
              </DropdownMenuItem>
            ) : null}
            {canPreviewFromMenu ? (
              <DropdownMenuItem onSelect={() => onPreviewResume(record)}>查看简历</DropdownMenuItem>
            ) : null}
            {canClose ? (
              <DropdownMenuItem onSelect={() => onTransition(record, "close")}>
                <IconCircleOff className={RESUME_LIBRARY_ACTION_ICON_CLASS} />
                标记结案
              </DropdownMenuItem>
            ) : null}
            {canReactivate ? (
              <DropdownMenuItem onSelect={() => onTransition(record, "reactivate")}>
                <IconArrowBackUp className={RESUME_LIBRARY_ACTION_ICON_CLASS} />
                重新激活
              </DropdownMenuItem>
            ) : null}
            {canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onDelete(record)} variant="destructive">
                  删除
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ResumeLibraryCardComponent({
  canCreateChat,
  canCreateInterview,
  canDeleteResumeLibrary,
  canUpdateResumeLibrary,
  currentMemberRole,
  currentUserId,
  onCopyDetailLink,
  onDelete,
  onEdit,
  onLaunchChat,
  onLaunchInterview,
  onOpenDetail,
  onPreviewResume,
  onSelectChange,
  onShowDuplicateMatches,
  onTransition,
  onViewJobDescription,
  record,
  selected,
}: ResumeLibraryCardProps) {
  const jobDescriptionLabel = getResumeLibraryJobDescriptionLabel(record);
  const lifecycle = describeLifecycleCell(record);
  const profileSnapshot = record.resumeProfileSnapshot;
  const skills = record.resumeSkills;
  const summary = record.resumeSummary;
  const canCopyLink = canCopyResumeDetailLink({ currentMemberRole, currentUserId, record });
  const { jobDescriptionId } = record;
  const jobDescriptionTextClass =
    "min-w-0 truncate text-left underline decoration-transparent underline-offset-2 transition-colors hover:decoration-foreground/40";

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <article
      className={cn(
        "relative rounded-2xl border border-input bg-background bg-clip-padding p-4 shadow-xs/5 transition-colors before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:shadow-[0_1px_--theme(--color-black/4%)] hover:border-border/80 hover:bg-muted/30 dark:bg-input/30 dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
        selected && "border-primary/40 bg-primary/5 hover:bg-primary/5 hover:border-primary/60",
      )}
      onClick={(event) => {
        if (isResumeCardInteractiveClick(event)) {
          return;
        }
        onOpenDetail(record, "overview");
      }}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.7fr)_auto] xl:items-start">
        <div className="flex min-w-0 gap-3">
          <Checkbox
            aria-label={`选择 ${record.candidateName}`}
            checked={selected}
            className="mt-3"
            onCheckedChange={(value) => onSelectChange(Boolean(value))}
          />
          <div className="mt-0.5 size-12 shrink-0 overflow-hidden rounded-full">
            <Avvvatars radius={48} size={48} style="shape" value={getResumeAvatarValue(record)} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <button
                className="min-w-0 truncate text-left font-semibold text-base underline decoration-transparent underline-offset-4 transition-colors hover:decoration-foreground/40"
                onClick={() => onOpenDetail(record, "overview")}
                type="button"
              >
                {record.candidateName}
              </button>
              {duplicateMatchBadge(record, () => onShowDuplicateMatches(record))}
              <ResumeLifecycleBadge
                className="max-w-full"
                detailLabel={lifecycle.detailLabel}
                fullLabel={lifecycle.fullLabel}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDetail(record, lifecycleTargetTab(record));
                }}
                stageLabel={lifecycle.stageLabel}
                tone={lifecycle.tone}
              />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 2xl:grid-cols-3">
              <ResumeCardMetaItem
                className="sm:col-span-2 2xl:col-span-1"
                icon={<IconBriefcase className="size-3.5" />}
                label="关联岗位"
              >
                {jobDescriptionId && jobDescriptionLabel ? (
                  <button
                    className={jobDescriptionTextClass}
                    onClick={() => {
                      if (!jobDescriptionId) {
                        return;
                      }
                      onViewJobDescription(jobDescriptionId);
                    }}
                    type="button"
                  >
                    {jobDescriptionLabel}
                  </button>
                ) : (
                  <span className={cn(jobDescriptionTextClass, "text-muted-foreground")}>
                    未绑定岗位
                  </span>
                )}
              </ResumeCardMetaItem>
              <div className="min-w-0">
                <ResumeCardCreatorMeta image={record.creatorImage} name={record.creatorName} />
              </div>
              <span className="inline-flex min-h-6 min-w-0 items-center text-muted-foreground text-xs">
                <TimeDisplay as="span" emptyText="—" value={record.createdAt} />
              </span>
              <ResumeCardMetaItem icon={<IconMail className="size-3.5" />} label="邮箱">
                {formatResumeCardContact(record.candidateEmail, "未填写邮箱")}
              </ResumeCardMetaItem>
              <ResumeCardMetaItem icon={<IconPhone className="size-3.5" />} label="电话">
                {formatResumeCardContact(record.candidatePhone, "未填写电话")}
              </ResumeCardMetaItem>
            </div>

            {summary ? (
              <p className="mt-3 line-clamp-2 text-muted-foreground text-sm leading-6">{summary}</p>
            ) : null}

            {skills.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {skills.map((item) => (
                  <Badge className="max-w-52 truncate" key={item} variant="secondary">
                    {item}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <ResumeCardProfileSnapshot snapshot={profileSnapshot} />

        <ResumeLibraryCardActions
          canCopyLink={canCopyLink}
          canCreateChat={canCreateChat}
          canCreateInterview={canCreateInterview}
          canDeleteResumeLibrary={canDeleteResumeLibrary}
          canUpdateResumeLibrary={canUpdateResumeLibrary}
          onCopyDetailLink={onCopyDetailLink}
          onDelete={onDelete}
          onEdit={onEdit}
          onLaunchChat={onLaunchChat}
          onLaunchInterview={onLaunchInterview}
          onOpenDetail={onOpenDetail}
          onPreviewResume={onPreviewResume}
          onTransition={onTransition}
          record={record}
        />
      </div>
    </article>
  );
}

export const ResumeLibraryCard = memo(
  ResumeLibraryCardComponent,
  (prev, next) =>
    prev.canCreateChat === next.canCreateChat &&
    prev.canCreateInterview === next.canCreateInterview &&
    prev.canDeleteResumeLibrary === next.canDeleteResumeLibrary &&
    prev.canUpdateResumeLibrary === next.canUpdateResumeLibrary &&
    prev.currentMemberRole === next.currentMemberRole &&
    prev.currentUserId === next.currentUserId &&
    prev.record === next.record &&
    prev.selected === next.selected,
);
