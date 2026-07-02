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
import type { ReactNode } from "react";

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
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import {
  formatResumeEducationItem,
  sortResumeEducationExperiences,
} from "@arc/shared/resume-education";
import { cn } from "@arc/shared/utils";

export type ResumeDetailDefaultTab = "overview" | "rounds" | "human-interview" | "offer";

const RESUME_PROFILE_PLACEHOLDER = "未发现信息";
const RESUME_LIBRARY_ACTION_ICON_CLASS = "size-4";

const Avvvatars =
  typeof AvvvatarsModule === "function"
    ? AvvvatarsModule
    : (AvvvatarsModule as unknown as { default: typeof AvvvatarsModule }).default;

interface ResumeCardProfileSnapshotLine {
  period: string | null;
  primary: string;
  secondary: string | null;
}

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

function getResumeCardSkills(record: ResumeLibraryListRecord): string[] {
  const seen = new Set<string>();
  return (record.resumeProfile?.skills ?? [])
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function cleanResumeProfileText(value: string | null | undefined) {
  const text = value?.trim();
  return text && text !== RESUME_PROFILE_PLACEHOLDER ? text : null;
}

function formatResumeCardPeriod(value: string | null | undefined) {
  const text = cleanResumeProfileText(value);
  if (!text) {
    return null;
  }
  const dateTokens = [...text.matchAll(/(\d{4})\s*[./年-]\s*(\d{1,2})\s*月?/gu)]
    .map(([, year, rawMonth]) => {
      const month = Number(rawMonth);
      return month >= 1 && month <= 12 ? `${year}.${month.toString().padStart(2, "0")}` : null;
    })
    .filter((item): item is string => item !== null);

  if (dateTokens.length === 0) {
    const years = [...text.matchAll(/(?:^|[^\d])(\d{4})(?=$|[^\d])/gu)].map((match) => match[1]);
    if (years.length === 0) {
      return text;
    }
    if (years.length === 1 && /(至今|现在|目前|present|current)/iu.test(text)) {
      return `${years[0]} - 至今`;
    }
    return years.slice(0, 2).join(" - ");
  }

  if (dateTokens.length === 1 && /(至今|现在|目前|present|current)/iu.test(text)) {
    return `${dateTokens[0]} - 至今`;
  }
  return dateTokens.slice(0, 2).join(" - ");
}

function getLatestWorkLine(record: ResumeLibraryListRecord) {
  const work = (record.resumeProfile?.workExperiences ?? []).find(
    (item) => cleanResumeProfileText(item.company) || cleanResumeProfileText(item.role),
  );
  if (!work) {
    return null;
  }
  const company = cleanResumeProfileText(work.company);
  const role = cleanResumeProfileText(work.role);
  const primary = company ?? role;
  if (!primary) {
    return null;
  }
  return {
    period: formatResumeCardPeriod(work.period),
    primary,
    secondary: company ? role : null,
  };
}

function getLatestEducationLine(record: ResumeLibraryListRecord) {
  const [education] = sortResumeEducationExperiences(record.resumeProfile?.educationExperiences);
  if (education) {
    const item = formatResumeEducationItem(education);
    if (item) {
      return {
        period:
          formatResumeCardPeriod(education.period) ??
          formatResumeCardPeriod(education.graduationYear),
        primary: item.school,
        secondary: [item.major, item.level].filter(Boolean).join(" · ") || null,
      };
    }
  }
  const school = record.resumeProfile?.schools.map(cleanResumeProfileText).find(Boolean);
  return school ? { period: null, primary: school, secondary: null } : null;
}

function getResumeCardProfileSnapshot(record: ResumeLibraryListRecord) {
  return {
    education: getLatestEducationLine(record),
    work: getLatestWorkLine(record),
  };
}

function getResumeCardSummary(record: ResumeLibraryListRecord): string | null {
  return record.resumeReview?.overall.conclusion ?? record.notes?.trim() ?? null;
}

function ResumeCardMetaItem({
  children,
  icon,
  label,
}: {
  children: ReactNode;
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="flex h-6 min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
      <span aria-hidden className="inline-flex shrink-0 items-center text-muted-foreground/70">
        {icon}
      </span>
      <span className="sr-only">{label}</span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

function ResumeCardMetaSeparator() {
  return <span aria-hidden className="h-3 w-px shrink-0 bg-border" />;
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
    education: ResumeCardProfileSnapshotLine | null;
    work: ResumeCardProfileSnapshotLine | null;
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

export function ResumeLibraryCard({
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
  const profileSnapshot = getResumeCardProfileSnapshot(record);
  const skills = getResumeCardSkills(record);
  const summary = getResumeCardSummary(record);
  const canCopyLink = canCopyResumeDetailLink({ currentMemberRole, currentUserId, record });

  return (
    <article
      className={cn(
        "relative rounded-2xl border border-input bg-background bg-clip-padding p-4 shadow-xs/5 transition-colors before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:shadow-[0_1px_--theme(--color-black/4%)] hover:border-border/80 hover:bg-muted/10 dark:bg-input/30 dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
        selected && "border-primary/40 bg-primary/5 hover:bg-primary/5",
      )}
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

            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <ResumeCardMetaItem icon={<IconBriefcase className="size-3.5" />} label="关联岗位">
                <button
                  className={cn(
                    "min-w-0 truncate text-left underline decoration-foreground/15 underline-offset-4 hover:decoration-foreground/50",
                    !jobDescriptionLabel &&
                      "pointer-events-none text-muted-foreground no-underline",
                  )}
                  onClick={() => {
                    if (record.jobDescriptionId) {
                      onViewJobDescription(record.jobDescriptionId);
                    }
                  }}
                  type="button"
                >
                  关联岗位：{jobDescriptionLabel ?? "未绑定"}
                </button>
              </ResumeCardMetaItem>
              <ResumeCardMetaSeparator />
              <ResumeCardCreatorMeta image={record.creatorImage} name={record.creatorName} />
              <ResumeCardMetaSeparator />
              <span className="inline-flex h-6 items-center text-muted-foreground text-xs">
                <TimeDisplay as="span" emptyText="—" value={record.createdAt} />
              </span>
              <ResumeCardMetaSeparator />
              <ResumeCardMetaItem icon={<IconMail className="size-3.5" />} label="邮箱">
                {formatResumeCardContact(record.candidateEmail, "未填写邮箱")}
              </ResumeCardMetaItem>
              <ResumeCardMetaSeparator />
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
