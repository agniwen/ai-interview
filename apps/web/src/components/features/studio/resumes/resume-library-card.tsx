import { IconBriefcase, IconInfoCircle, IconUpload } from "@tabler/icons-react";
import { memo, useRef } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { TimeDisplay } from "@/components/features/display/time-display";
import { ResumeDuplicateMatchBadge } from "@/components/features/resume/resume-duplicate-match-badge";
import { formatResumeRecordDisplayId } from "@/components/features/resume/resume-record-display-id";
import { JobDescriptionHoverCard } from "@/components/features/studio/job-descriptions/job-description-hover-card";
import { ResumeLifecycleBadge } from "@/components/features/studio/resumes/resume-lifecycle-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CandidateAvatar } from "@/components/features/studio/candidate-avatar-image";
import { Card, CardPanel } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { INITIAL_INTERVIEW_STATUS_LABELS } from "@app/shared/human-initial-interview";
import {
  describeResumeProgress,
  getHumanInterviewProgressForStage,
} from "@app/shared/studio-resumes";
import type {
  ResumeLibraryListRecord,
  ResumeLibraryProfileSnapshot,
  ResumeLibraryProfileSnapshotLine,
} from "@app/shared/studio-resumes";
import { cn } from "@app/shared/utils";
import {
  StudioListCardAvatarWithVerdict,
  StudioListCardProfileSnapshotSkeleton,
} from "@/components/features/studio/studio-list-card-evaluation";
import {
  STUDIO_LIST_CARD_ACTIONS_CELL_CLASS,
  STUDIO_LIST_CARD_BODY_GRID_CLASS,
  STUDIO_LIST_CARD_META_ROW_CLASS,
  STUDIO_LIST_CARD_NAME_CLASS,
  STUDIO_LIST_CARD_PROFILE_CELL_CLASS,
  STUDIO_LIST_CARD_TITLE_ROW_CLASS,
  StudioListCardProfileColumn,
  StudioListCardProfileStrip,
  StudioListCardProfileStripSkeleton,
} from "@/components/features/studio/studio-list-card-profile";
import { ResumeLibraryCardActions } from "./resume-library-card-actions";
import {
  ResumeLibraryEvaluationSummary,
  ResumeLibraryReviewAttemptBadge,
  ResumeLibraryReviewBadge,
} from "./resume-library-evaluation-summary";
import type { ResumeDetailDefaultTab, ResumeLibraryCardProps } from "./resume-library-card.types";

export type { ResumeDetailDefaultTab, ResumeLibraryCardProps } from "./resume-library-card.types";

function lifecycleTargetTab(record: ResumeLibraryListRecord): ResumeDetailDefaultTab {
  if (record.pipelineStage === "ai_interview") {
    return "rounds";
  }
  if (record.pipelineStage === "second_interview" || record.pipelineStage === "final_interview") {
    return "human-interview";
  }
  if (record.pipelineStage === "offer") {
    return "offer";
  }
  return "overview";
}

function InitialInterviewStatusBadge({
  record,
  onOpen,
}: {
  record: ResumeLibraryListRecord;
  onOpen: () => void;
}) {
  const initial = record.stageProgress.initialInterview;
  if (!initial || record.pipelineStage === "ai_interview") {
    return null;
  }
  return (
    <button
      type="button"
      className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
      onClick={onOpen}
    >
      人工初面 · {INITIAL_INTERVIEW_STATUS_LABELS[initial.latestStatus]}
    </button>
  );
}

function describeCompactAiLifecycle(record: ResumeLibraryListRecord): string {
  const initial = record.stageProgress.initialInterview;
  if (initial) {
    return `人工初面 · ${initial.latestStatus === "ready" ? "已生成待决策" : INITIAL_INTERVIEW_STATUS_LABELS[initial.latestStatus]}`;
  }
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

function describeCompactHumanLifecycle(
  record: ResumeLibraryListRecord,
  stage: "second_interview" | "final_interview",
): string {
  const progress = getHumanInterviewProgressForStage(record.stageProgress.humanInterview, stage);
  if (!progress || progress.totalRounds === 0) {
    return "未安排";
  }
  if (!progress.activeRound) {
    return `${progress.passedRounds}/${progress.totalRounds}通过${progress.inconclusiveRounds ? ` · ${progress.inconclusiveRounds}待定` : ""}待决策`;
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
      return `${version}接受待结束`;
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
  if (record.pipelineStage === "closed") {
    return fallback;
  }
  if (record.nodeStatus === "completed" && record.nodeResult === "pass") {
    return "已通过待推进";
  }
  if (record.pipelineStage === "ai_interview") {
    return describeCompactAiLifecycle(record);
  }
  if (record.pipelineStage === "second_interview" || record.pipelineStage === "final_interview") {
    return describeCompactHumanLifecycle(record, record.pipelineStage);
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

const AI_INTERVIEW_BADGE_CLASS = "bg-purple-tint text-purple-ink hover:bg-purple-line";

function getLifecycleBadgeStageClass(stage: ResumeLibraryListRecord["pipelineStage"]) {
  return stage === "ai_interview" ? AI_INTERVIEW_BADGE_CLASS : undefined;
}

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
  return (
    <ResumeDuplicateMatchBadge
      duplicateMatch={record.duplicateMatch}
      onClick={onClick}
      sourceCreatedAt={record.createdAt}
    />
  );
}

function getCandidateAvatarSeed(candidateName: string) {
  return candidateName.trim() || "未命名候选人";
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
      <span aria-hidden className="inline-flex shrink-0 items-center text-muted-foreground">
        {icon}
      </span>
      <span className="sr-only">{label}</span>
      <span className="min-w-0 flex-1 truncate text-foreground">{children}</span>
    </div>
  );
}

function ResumeCardCreatorMeta({ image, name }: { image: string | null; name: string | null }) {
  const displayName = textOrDash(name);

  return (
    <span className="flex h-6 w-full min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
      <IconUpload aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0">上传人</span>
      <Avatar
        className="size-4! shrink-0"
        label={`${displayName}的头像`}
        seed={`recruiter:${displayName}`}
        size="sm"
      >
        {image ? <AvatarImage alt={displayName} src={image} /> : null}
        <AvatarFallback>{getCreatorInitial(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-foreground">{displayName}</span>
    </span>
  );
}

function renderResumeCardProfileSnapshotMoreRow(key: string) {
  return (
    <p className="flex min-w-0 items-center text-muted-foreground text-sm" key={key}>
      {"..."}
    </p>
  );
}

function renderResumeCardProfileHoverLine(line: ResumeLibraryProfileSnapshotLine) {
  return (
    <p
      className="flex min-w-0 items-baseline gap-2"
      key={`${line.primary}-${line.secondary ?? ""}-${line.period ?? ""}`}
    >
      {line.period ? (
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{line.period}</span>
      ) : null}
      <span className="min-w-0 wrap-break-word text-foreground text-sm">
        {[line.primary, line.secondary].filter(Boolean).join(" · ")}
      </span>
    </p>
  );
}

function getResumeCardProfileSnapshotGroups(snapshot: ResumeLibraryProfileSnapshot) {
  const workLines = snapshot.work.slice(0, snapshot.workHasMore ? 3 : 4);
  const educationLines = snapshot.education.slice(0, 3);

  return {
    educationHasMore:
      snapshot.educationHasMore || snapshot.education.length > educationLines.length,
    educationLines,
    hasEducationGroup: educationLines.length > 0 || snapshot.educationHasMore,
    hasWorkGroup: workLines.length > 0 || snapshot.workHasMore,
    workLines,
  };
}

function ResumeCardProfileSnapshotHoverCard({
  snapshot,
}: {
  snapshot: ResumeLibraryProfileSnapshot;
}) {
  const { educationHasMore, educationLines, hasEducationGroup, hasWorkGroup, workLines } =
    getResumeCardProfileSnapshotGroups(snapshot);

  if (!(hasWorkGroup || hasEducationGroup)) {
    return null;
  }

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <button
            aria-label="更多工作与教育经历"
            className="inline-flex min-h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xs text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            type="button"
          >
            <IconInfoCircle aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <span>更多</span>
          </button>
        }
      />
      <HoverCardContent
        align="start"
        className="w-[28rem] max-w-[calc(100vw-1.5rem)] p-3"
        side="bottom"
        sideOffset={8}
      >
        <div className="flex min-w-0 flex-col gap-3">
          {hasWorkGroup ? (
            <section className="min-w-0">
              <h4 className="mb-1.5 font-medium text-xs">工作经历</h4>
              <div className="grid min-w-0 gap-1">
                {workLines.map(renderResumeCardProfileHoverLine)}
                {snapshot.workHasMore
                  ? renderResumeCardProfileSnapshotMoreRow("compact-work-more")
                  : null}
              </div>
            </section>
          ) : null}
          {hasEducationGroup ? (
            <section className="min-w-0">
              <h4 className="mb-1.5 font-medium text-xs">教育经历</h4>
              <div className="grid min-w-0 gap-1">
                {educationLines.map(renderResumeCardProfileHoverLine)}
                {educationHasMore
                  ? renderResumeCardProfileSnapshotMoreRow("compact-education-more")
                  : null}
              </div>
            </section>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function ResumeLibraryCardComponent({
  canCreateInterview,
  canDeleteResumeLibrary,
  canForceReparse,
  canRetryResumeParse,
  canUpdateResumeLibrary,
  currentMemberRole,
  currentUserId,
  onCopyDetailLink,
  onDelete,
  onEdit,
  onForceReparse,
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
  const summary = record.resumeSummary;
  const canCopyLink = canCopyResumeDetailLink({ currentMemberRole, currentUserId, record });
  const { jobDescriptionId } = record;
  const jobDescriptionTextClass =
    "block w-full max-w-full min-w-0 truncate text-left underline decoration-transparent underline-offset-2 transition-colors hover:decoration-foreground/40";
  const toggleSelected = () => onSelectChange(record.id, !selected);
  const isRejected = record.outcome === "rejected";
  const isParsing =
    record.resumeParseStatus === "queued" || record.resumeParseStatus === "processing";
  const pointerGestureRef = useRef<{
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <Card
      className="group/list-card h-full overflow-hidden rounded-lg border-0 bg-transparent shadow-none transition-colors hover:bg-component/60"
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
        className="absolute inset-y-0 left-0 z-10 w-12 rounded-l-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        data-resume-card-interactive="true"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleSelected();
        }}
        type="button"
      />
      <CardPanel className="flex h-full min-h-0 gap-3 p-4">
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
        <div className={STUDIO_LIST_CARD_BODY_GRID_CLASS}>
          <div className="flex min-w-0 items-center gap-3 xl:col-span-2">
            <StudioListCardAvatarWithVerdict
              avatar={
                <CandidateAvatar
                  className="size-12"
                  label={record.candidateName}
                  muted={isRejected}
                  recordId={record.id}
                  seed={getCandidateAvatarSeed(record.candidateName)}
                  source="resumes"
                  version={record.candidateAvatarVersion}
                />
              }
              verdict={<ResumeLibraryReviewBadge compact muted={isRejected} record={record} />}
            />
            <div className={STUDIO_LIST_CARD_TITLE_ROW_CLASS}>
              <button
                className={STUDIO_LIST_CARD_NAME_CLASS}
                onClick={() => onOpenDetail(record, "overview")}
                type="button"
              >
                <span className={cn(isRejected && "text-muted-foreground line-through")}>
                  {record.candidateName}
                </span>{" "}
                <span className="font-normal text-muted-foreground text-xs">
                  ({formatResumeRecordDisplayId(record.id)})
                </span>
              </button>
              <ResumeLibraryReviewAttemptBadge record={record} />
              <ResumeLifecycleBadge
                className={cn("shrink-0", getLifecycleBadgeStageClass(record.pipelineStage))}
                detailLabel={lifecycle.detailLabel}
                fullLabel={lifecycle.fullLabel}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDetail(record, lifecycleTargetTab(record));
                }}
                stage={record.pipelineStage}
                stageLabel={lifecycle.stageLabel}
                tone={lifecycle.tone}
              />
              <InitialInterviewStatusBadge
                record={record}
                onOpen={() => onOpenDetail(record, "rounds")}
              />
              {duplicateMatchBadge(record, () => onShowDuplicateMatches(record))}
            </div>
          </div>

          <div className="min-w-0">
            <div className={STUDIO_LIST_CARD_META_ROW_CLASS}>
              <ResumeCardMetaItem
                className="w-auto max-w-full shrink"
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
              <div className="hidden max-w-36 min-w-0 shrink-0 sm:block">
                <ResumeCardCreatorMeta image={record.creatorImage} name={record.creatorName} />
              </div>
              <span className="inline-flex h-6 shrink-0 items-center text-muted-foreground text-xs">
                <TimeDisplay as="span" emptyText="—" value={record.createdAt} />
              </span>
              <ResumeCardProfileSnapshotHoverCard snapshot={profileSnapshot} />
            </div>

            {isParsing ? (
              <StudioListCardProfileStripSkeleton className="mt-3 hidden md:grid xl:hidden" />
            ) : (
              <StudioListCardProfileStrip
                className={cn("mt-3 hidden md:grid xl:hidden", isRejected && "line-through")}
                snapshot={profileSnapshot}
              />
            )}

            <ResumeLibraryEvaluationSummary
              className={cn(isRejected && "line-through")}
              muted={isRejected}
              onOpenDetail={onOpenDetail}
              record={record}
              summary={summary}
            />
          </div>

          <div className={cn(STUDIO_LIST_CARD_PROFILE_CELL_CLASS, isRejected && "line-through")}>
            {isParsing ? (
              <StudioListCardProfileSnapshotSkeleton />
            ) : (
              <StudioListCardProfileColumn snapshot={profileSnapshot} />
            )}
          </div>

          <div className={STUDIO_LIST_CARD_ACTIONS_CELL_CLASS}>
            <ResumeLibraryCardActions
              canCopyLink={canCopyLink}
              canCreateInterview={canCreateInterview}
              canDeleteResumeLibrary={canDeleteResumeLibrary}
              canForceReparse={canForceReparse}
              canRetryResumeParse={canRetryResumeParse}
              canUpdateResumeLibrary={canUpdateResumeLibrary}
              onCopyDetailLink={onCopyDetailLink}
              onDelete={onDelete}
              onEdit={onEdit}
              onForceReparse={onForceReparse}
              onLaunchInterview={onLaunchInterview}
              onPreviewResume={onPreviewResume}
              onRetryParse={onRetryParse}
              onTransition={onTransition}
              record={record}
              retrying={retrying}
            />
          </div>
        </div>
      </CardPanel>
    </Card>
  );
}

export const ResumeLibraryCard = memo(ResumeLibraryCardComponent);
