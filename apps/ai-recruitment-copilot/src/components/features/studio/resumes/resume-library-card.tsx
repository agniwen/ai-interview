import { IconBriefcase, IconSparkles, IconUpload } from "@tabler/icons-react";
import AvvvatarsModule from "avvvatars-react";
import { memo, useRef } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { TimeDisplay } from "@/components/features/display/time-display";
import { ResumeDuplicateMatchBadge } from "@/components/features/resume/resume-duplicate-match-badge";
import { formatResumeRecordDisplayId } from "@/components/features/resume/resume-record-display-id";
import { JobDescriptionHoverCard } from "@/components/features/studio/job-descriptions/job-description-hover-card";
import { ResumeLifecycleBadge } from "@/components/features/studio/resumes/resume-lifecycle-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardPanel } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { describeResumeLibraryReviewCard } from "@arc/shared/resume-review";
import type { ResumeReviewActionTone } from "@arc/shared/resume-review";
import { describeResumeProgress } from "@arc/shared/studio-resumes";
import type {
  ResumeLibraryListRecord,
  ResumeLibraryProfileSnapshot,
  ResumeLibraryProfileSnapshotLine,
} from "@arc/shared/studio-resumes";
import { cn } from "@arc/shared/utils";
import { ResumeLibraryCardActions } from "./resume-library-card-actions";
import type { ResumeDetailDefaultTab, ResumeLibraryCardProps } from "./resume-library-card.types";

export type { ResumeDetailDefaultTab, ResumeLibraryCardProps } from "./resume-library-card.types";

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

const REVIEW_ACTION_TONE_CLASS: Record<ResumeReviewActionTone, string> = {
  danger: "text-rose-700 dark:text-rose-300",
  muted: "text-muted-foreground",
  success: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-700 dark:text-amber-300",
};

function isResumeCardInteractiveClick(event: ReactMouseEvent<HTMLElement>) {
  const { target } = event;
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      [
        "a",
        "button",
        "input",
        "label",
        "select",
        "textarea",
        "[role='button']",
        "[role='menuitem']",
        "[data-resume-card-interactive='true']",
        // HoverCard 内容经 Portal 挂到 body，DOM 上不在卡片内，但 React 合成事件仍会冒泡到卡片。
        "[data-slot='hover-card-trigger']",
        "[data-slot='hover-card-content']",
      ].join(","),
    ),
  );
}

/** True when the user dragged to select text rather than issuing a plain click. */
function isResumeCardTextSelectionClick() {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

const CARD_CLICK_MOVE_THRESHOLD_PX = 6;

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
  return <ResumeDuplicateMatchBadge duplicateMatch={record.duplicateMatch} onClick={onClick} />;
}

function getResumeAvatarValue(record: ResumeLibraryListRecord) {
  return [record.candidateName, record.candidateEmail].filter(Boolean).join(" ") || record.id;
}

function describeStructuredReviewCard(record: ResumeLibraryListRecord): {
  label: string;
  tone: ResumeReviewActionTone;
} {
  if (record.resumeEvaluationStatus === "pass") {
    return { label: "HR 已通过", tone: "success" };
  }
  if (record.resumeEvaluationStatus === "fail") {
    return { label: "HR 未通过", tone: "danger" };
  }
  if (record.resumeReviewStatus === "queued" || record.resumeReviewStatus === "processing") {
    return { label: "AI 评估中", tone: "muted" };
  }
  if (record.structuredGateStatus === "failed") {
    return {
      label:
        record.structuredCompositeScore === null
          ? "未通过门槛"
          : `未通过门槛 · ${record.structuredCompositeScore} 分`,
      tone: "danger",
    };
  }
  if (record.structuredGateStatus === "needs_verification") {
    return { label: "门槛待核实", tone: "warning" };
  }
  if (record.structuredCompositeScore !== null) {
    const gradeLabel = {
      matched: "匹配",
      recommended: "推荐",
      unmatched: "不匹配",
    }[record.structuredScoreGrade ?? "unmatched"];
    let tone: ResumeReviewActionTone = "danger";
    if (record.structuredScoreGrade === "recommended") {
      tone = "success";
    } else if (record.structuredScoreGrade === "matched") {
      tone = "warning";
    }
    return {
      label: `${gradeLabel} · ${record.structuredCompositeScore} 分`,
      tone,
    };
  }
  return { label: "待 AI 评估", tone: "muted" };
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
        "flex min-h-6 w-full min-w-0 items-center gap-1.5 text-muted-foreground text-xs",
        className,
      )}
    >
      <span aria-hidden className="inline-flex shrink-0 items-center text-muted-foreground/70">
        {icon}
      </span>
      <span className="sr-only">{label}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </div>
  );
}

function ResumeCardCreatorMeta({ image, name }: { image: string | null; name: string | null }) {
  const displayName = textOrDash(name);

  return (
    <span className="flex h-6 w-full min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
      <IconUpload aria-hidden className="size-3.5 shrink-0 text-muted-foreground/70" />
      <span className="shrink-0">上传人</span>
      <Avatar size="sm" className="size-4! shrink-0">
        {image ? <AvatarImage alt={displayName} src={image} /> : null}
        <AvatarFallback>{getCreatorInitial(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate">{displayName}</span>
    </span>
  );
}

function renderResumeCardProfileSnapshotLine(line: ResumeLibraryProfileSnapshotLine) {
  return (
    <p
      className="flex min-w-0 items-baseline gap-2"
      key={`${line.primary}-${line.secondary ?? ""}-${line.period ?? ""}`}
      title={[line.period, line.primary, line.secondary].filter(Boolean).join(" · ")}
    >
      {line.period ? (
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{line.period}</span>
      ) : null}
      <span className="min-w-0 truncate text-foreground text-sm">
        {[line.primary, line.secondary].filter(Boolean).join(" · ")}
      </span>
    </p>
  );
}

function renderResumeCardProfileSnapshotMoreRow(key: string) {
  return (
    <p className="flex min-w-0 items-center text-muted-foreground text-sm" key={key}>
      {"..."}
    </p>
  );
}

function ResumeCardProfileSnapshot({ snapshot }: { snapshot: ResumeLibraryProfileSnapshot }) {
  const workLines = snapshot.work.slice(0, snapshot.workHasMore ? 2 : 3);
  const educationLines = snapshot.education.slice(0, snapshot.educationHasMore ? 2 : 3);
  const hasWorkGroup = workLines.length > 0 || snapshot.workHasMore;
  const hasEducationGroup = educationLines.length > 0 || snapshot.educationHasMore;

  if (!(hasWorkGroup || hasEducationGroup)) {
    return null;
  }

  return (
    <div className="min-w-0 xl:border-border/60 xl:border-l xl:border-dashed xl:pl-8">
      <div className="grid min-w-0 content-start gap-1 text-sm xl:max-w-sm">
        {workLines.map(renderResumeCardProfileSnapshotLine)}
        {snapshot.workHasMore ? renderResumeCardProfileSnapshotMoreRow("work-more") : null}
        {hasWorkGroup && hasEducationGroup ? (
          <div className="my-0.5 border-border/60 border-t" />
        ) : null}
        {educationLines.map(renderResumeCardProfileSnapshotLine)}
        {snapshot.educationHasMore
          ? renderResumeCardProfileSnapshotMoreRow("education-more")
          : null}
      </div>
    </div>
  );
}

function ResumeLibraryCardComponent({
  canCreateInterview,
  canDeleteResumeLibrary,
  canRetryResumeParse,
  canUpdateResumeLibrary,
  currentMemberRole,
  currentUserId,
  onCopyDetailLink,
  onDelete,
  onEdit,
  onLaunchInterview,
  onOpenDetail,
  onPreviewResume,
  onRetryParse,
  onSelectChange,
  onShowDuplicateMatches,
  onTransition,
  record,
  retrying,
  selected,
}: ResumeLibraryCardProps) {
  const jobDescriptionLabel = getResumeLibraryJobDescriptionLabel(record);
  const lifecycle = describeLifecycleCell(record);
  const profileSnapshot = record.resumeProfileSnapshot;
  const skills = record.resumeSkills;
  const summary = record.resumeSummary;
  const canCopyLink = canCopyResumeDetailLink({ currentMemberRole, currentUserId, record });
  const { jobDescriptionId } = record;
  const artifactMode = record.resumeEvaluationArtifactMode ?? record.jobEvaluationMode;
  const hasRetainedLegacyReview =
    artifactMode === "legacy" && record.resumeReviewBaseScore !== null;
  const baseReviewCard =
    artifactMode === "structured"
      ? describeStructuredReviewCard(record)
      : describeResumeLibraryReviewCard({
          baseScore: record.resumeReviewBaseScore,
          nextStepAction: record.resumeReviewNextStepAction,
          status: hasRetainedLegacyReview ? "ready" : record.resumeReviewStatus,
        });
  const reviewCard = hasRetainedLegacyReview
    ? { ...baseReviewCard, label: `老版本结果 · ${baseReviewCard.label}` }
    : baseReviewCard;
  let replacementAttemptLabel: string | null = null;
  if (hasRetainedLegacyReview && record.resumeEvaluationAttemptMode === "structured") {
    if (record.resumeReviewStatus === "queued" || record.resumeReviewStatus === "processing") {
      replacementAttemptLabel = "新版重评中";
    } else if (record.resumeReviewStatus === "failed") {
      replacementAttemptLabel = "新版重评失败";
    }
  }
  const jobDescriptionTextClass =
    "block w-full max-w-full min-w-0 truncate text-left underline decoration-transparent underline-offset-2 transition-colors hover:decoration-foreground/40";
  const toggleSelected = () => onSelectChange(record.id, !selected);
  const pointerGestureRef = useRef<{
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <Card
      className={cn(
        "h-full overflow-hidden transition-colors hover:border-border hover:bg-muted/30",
        selected
          ? "border-primary/40 bg-primary/5 hover:border-primary/60 hover:bg-primary/5"
          : "dark:bg-background dark:hover:bg-input/30",
      )}
      onClick={(event) => {
        if (isResumeCardInteractiveClick(event)) {
          return;
        }
        if (pointerGestureRef.current?.moved || isResumeCardTextSelectionClick()) {
          return;
        }
        onOpenDetail(record, "overview");
      }}
      onPointerCancel={() => {
        pointerGestureRef.current = null;
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          pointerGestureRef.current = null;
          return;
        }
        pointerGestureRef.current = {
          moved: false,
          x: event.clientX,
          y: event.clientY,
        };
      }}
      onPointerMove={(event) => {
        const gesture = pointerGestureRef.current;
        if (!gesture || gesture.moved) {
          return;
        }
        const dx = Math.abs(event.clientX - gesture.x);
        const dy = Math.abs(event.clientY - gesture.y);
        if (dx > CARD_CLICK_MOVE_THRESHOLD_PX || dy > CARD_CLICK_MOVE_THRESHOLD_PX) {
          gesture.moved = true;
        }
      }}
      render={<article />}
    >
      <button
        aria-label={`${selected ? "取消选择" : "选择"} ${record.candidateName}`}
        aria-pressed={selected}
        className="absolute inset-y-0 left-0 z-10 w-12 rounded-l-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        data-resume-card-interactive="true"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleSelected();
        }}
        type="button"
      />
      <CardPanel className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="flex min-w-0 gap-3">
          <Checkbox
            aria-label={`选择 ${record.candidateName}`}
            checked={selected}
            className="relative z-20 mt-3"
            data-resume-card-interactive="true"
            onClick={(event) => {
              event.stopPropagation();
            }}
            onCheckedChange={(value) => onSelectChange(record.id, Boolean(value))}
          />
          <div className="mt-0.5 size-12 shrink-0 overflow-hidden rounded-full">
            <Avvvatars radius={48} size={48} style="shape" value={getResumeAvatarValue(record)} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="grid min-w-0 gap-x-4 gap-y-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.7fr)] xl:gap-x-8">
              <div className="flex min-w-0 flex-wrap items-center gap-2 xl:col-span-2">
                <button
                  className="min-w-0 truncate text-left font-semibold text-base underline decoration-transparent underline-offset-4 transition-colors hover:decoration-foreground/40"
                  onClick={() => onOpenDetail(record, "overview")}
                  type="button"
                >
                  <span>{record.candidateName}</span>{" "}
                  <span className="font-normal text-muted-foreground/60 text-xs">
                    ({formatResumeRecordDisplayId(record.id)})
                  </span>
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

              <div className="min-w-0">
                <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 2xl:grid-cols-3">
                  <ResumeCardMetaItem
                    className="sm:col-span-2 2xl:col-span-1"
                    icon={<IconBriefcase className="size-3.5" />}
                    label="关联岗位"
                  >
                    {jobDescriptionId && jobDescriptionLabel ? (
                      <JobDescriptionHoverCard
                        className={jobDescriptionTextClass}
                        jobDescriptionId={jobDescriptionId}
                        name={jobDescriptionLabel}
                      />
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
                  <ResumeCardMetaItem
                    icon={
                      <span className={REVIEW_ACTION_TONE_CLASS[reviewCard.tone]}>
                        <IconSparkles className="size-3.5" />
                      </span>
                    }
                    label="下一步建议"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={cn(
                          "min-w-0 truncate font-medium",
                          REVIEW_ACTION_TONE_CLASS[reviewCard.tone],
                        )}
                      >
                        {reviewCard.label}
                      </span>
                      {replacementAttemptLabel ? (
                        <span className="shrink-0 text-muted-foreground">
                          {replacementAttemptLabel}
                        </span>
                      ) : null}
                    </span>
                  </ResumeCardMetaItem>
                </div>

                {summary ? (
                  <p className="mt-3 line-clamp-2 text-muted-foreground text-sm leading-6">
                    {summary}
                  </p>
                ) : null}

                {skills.length > 0 ? (
                  <div className="mt-3 flex max-h-14 flex-wrap gap-1.5 overflow-hidden">
                    {skills.map((item) => (
                      <Badge className="max-w-52 truncate" key={item} variant="outline">
                        {item}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>

              <ResumeCardProfileSnapshot snapshot={profileSnapshot} />
            </div>
          </div>
        </div>

        <ResumeLibraryCardActions
          canCopyLink={canCopyLink}
          canCreateInterview={canCreateInterview}
          canDeleteResumeLibrary={canDeleteResumeLibrary}
          canRetryResumeParse={canRetryResumeParse}
          canUpdateResumeLibrary={canUpdateResumeLibrary}
          onCopyDetailLink={onCopyDetailLink}
          onDelete={onDelete}
          onEdit={onEdit}
          onLaunchInterview={onLaunchInterview}
          onPreviewResume={onPreviewResume}
          onRetryParse={onRetryParse}
          onTransition={onTransition}
          record={record}
          retrying={retrying}
        />
      </CardPanel>
    </Card>
  );
}

export const ResumeLibraryCard = memo(ResumeLibraryCardComponent);
