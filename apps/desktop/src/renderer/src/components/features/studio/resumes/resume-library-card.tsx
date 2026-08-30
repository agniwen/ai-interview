import { ResumeLibraryEvaluationSummary } from "./resume-library-evaluation-summary";
import { m, useReducedMotion } from "motion/react";
import { memo, useCallback, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useMeetingRecordingActions } from "@/components/features/meeting/meeting-recording-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { describeResumeProgress } from "@arc/shared/studio-resumes";
import type {
  ResumeLibraryListRecord,
  ResumeLibraryProfileSnapshot,
  ResumeLibraryProfileSnapshotLine,
} from "@arc/shared/studio-resumes";
import { cn } from "@arc/shared/utils";
import {
  formatLocalDateTime,
  formatResumeRecordDisplayId,
  getResumeLibraryJobDescriptionLabel,
} from "./resume-display";

const LIFECYCLE_TONE_CLASS = {
  info: "border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  outline: "border-border bg-muted/50 text-muted-foreground",
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200",
} as const;

function textOrDash(value: string | null | undefined) {
  const text = value?.trim();
  return text || "—";
}

function getCreatorInitial(name: string | null | undefined) {
  return name?.trim().slice(0, 1).toUpperCase() || "?";
}

function getCandidateAvatarSeed(candidateName: string) {
  return candidateName.trim() || "未命名候选人";
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
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </div>
  );
}

function renderProfileLine(line: ResumeLibraryProfileSnapshotLine) {
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

function hasProfileSnapshotContent(snapshot: ResumeLibraryProfileSnapshot | null | undefined) {
  if (!snapshot) {
    return false;
  }
  return (
    snapshot.work.length > 0 ||
    snapshot.education.length > 0 ||
    snapshot.workHasMore ||
    snapshot.educationHasMore
  );
}

function ResumeCardProfileSnapshot({ snapshot }: { snapshot: ResumeLibraryProfileSnapshot }) {
  const workLines = snapshot.work.slice(0, snapshot.workHasMore ? 2 : 3);
  const educationLines = snapshot.education.slice(0, snapshot.educationHasMore ? 2 : 3);
  const hasWorkGroup = workLines.length > 0 || snapshot.workHasMore;
  const hasEducationGroup = educationLines.length > 0 || snapshot.educationHasMore;

  return (
    <div className="min-w-0 xl:border-border/60 xl:border-l xl:border-dashed xl:pl-8">
      <div className="grid min-w-0 content-start gap-1 text-sm xl:max-w-sm">
        {workLines.map(renderProfileLine)}
        {snapshot.workHasMore ? (
          <p className="flex min-w-0 items-center text-muted-foreground text-sm">…</p>
        ) : null}
        {hasWorkGroup && hasEducationGroup ? (
          <div className="my-0.5 border-border/60 border-t" />
        ) : null}
        {educationLines.map(renderProfileLine)}
        {snapshot.educationHasMore ? (
          <p className="flex min-w-0 items-center text-muted-foreground text-sm">…</p>
        ) : null}
      </div>
    </div>
  );
}

/** Strong ease-out — snappy enter for hover UI (emil-design-eng). */
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const ACTION_SLIDE_PX = 12;
const ACTION_DURATION_S = 0.2;

function MeetingRecordingAction({ onStart, visible }: { onStart?: () => void; visible: boolean }) {
  const reduceMotion = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const shown = visible || focused;

  return (
    <m.div
      animate={{
        // Prefer full `transform` string over `x` for GPU-accelerated paint path.
        opacity: shown ? 1 : 0,
        transform: reduceMotion || shown ? "translateX(0px)" : `translateX(${ACTION_SLIDE_PX}px)`,
      }}
      className="absolute right-3 bottom-3 z-10"
      initial={false}
      onBlurCapture={() => setFocused(false)}
      onFocusCapture={() => setFocused(true)}
      style={{ pointerEvents: shown ? "auto" : "none" }}
      transition={{
        duration: reduceMotion ? 0.12 : ACTION_DURATION_S,
        ease: EASE_OUT,
      }}
    >
      <Button
        onClick={(event) => {
          event.stopPropagation();
          onStart?.();
        }}
        size="sm"
        type="button"
        variant="default"
      >
        <Icon className="size-4" icon="ph:record" />
        创建录制
      </Button>
    </m.div>
  );
}

/**
 * Desktop resume library card. Content layout mirrors web; hover reveals a
 * bottom-right 「新建录制」 action that opens the associate-resume modal.
 */
function ResumeLibraryCardComponent({
  onOpenDetail,
  record,
}: {
  onOpenDetail: (record: ResumeLibraryListRecord) => void;
  record: ResumeLibraryListRecord;
}) {
  const { openMeetingRecording } = useMeetingRecordingActions();
  const [hovered, setHovered] = useState(false);

  // Only fine-pointer hover (avoid sticky hover after tap on touch targets).
  const handlePointerEnter = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse") {
      setHovered(true);
    }
  }, []);
  const handlePointerLeave = useCallback(() => {
    setHovered(false);
  }, []);

  const openDetail = useCallback(() => {
    onOpenDetail(record);
  }, [onOpenDetail, record]);

  const jobDescriptionLabel = getResumeLibraryJobDescriptionLabel(record);
  const lifecycle = describeLifecycleCell(record);
  const profileSnapshot = record.resumeProfileSnapshot;
  const skills = record.resumeSkills;
  const showProfile = hasProfileSnapshotContent(profileSnapshot);

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <article
      className={cn(
        "relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card",
        "transition-colors hover:border-border hover:bg-muted/30",
        "dark:bg-background dark:hover:bg-input/30",
      )}
      onClick={openDetail}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <div className="flex gap-3 p-4">
        <Avatar
          className="mt-0.5 size-12"
          generatedSize={48}
          label={`${record.candidateName}的头像`}
          seed={getCandidateAvatarSeed(record.candidateName)}
        >
          <AvatarFallback>{record.candidateName.slice(0, 1)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "grid min-w-0 gap-x-4 gap-y-2",
              showProfile && "xl:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.7fr)] xl:gap-x-8",
            )}
          >
            <div
              className={cn(
                "flex min-w-0 flex-wrap items-center gap-2",
                showProfile && "xl:col-span-2",
              )}
            >
              <p className="min-w-0 truncate font-semibold text-base">
                <button
                  className="rounded-sm text-left hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={(event) => {
                    event.stopPropagation();
                    openDetail();
                  }}
                  type="button"
                >
                  {record.candidateName}
                </button>{" "}
                <span className="font-normal text-muted-foreground/60 text-xs">
                  ({formatResumeRecordDisplayId(record.id)})
                </span>
              </p>
              <span
                className={cn(
                  "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                  LIFECYCLE_TONE_CLASS[lifecycle.tone],
                )}
                title={lifecycle.fullLabel}
              >
                <span className="shrink-0">{lifecycle.stageLabel}</span>
                {lifecycle.detailLabel ? (
                  <>
                    <span aria-hidden className="shrink-0 opacity-45">
                      ·
                    </span>
                    <span className="min-w-0 truncate opacity-75">{lifecycle.detailLabel}</span>
                  </>
                ) : null}
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <ResumeCardMetaItem
                  className="max-w-full"
                  icon={<Icon className="size-3.5" icon="ph:briefcase" />}
                  label="关联岗位"
                >
                  <span
                    className={cn(
                      "block w-full max-w-full min-w-0 truncate text-left",
                      jobDescriptionLabel ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {jobDescriptionLabel ?? "未绑定岗位"}
                  </span>
                </ResumeCardMetaItem>

                <span className="flex h-6 min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
                  <Icon
                    className="size-3.5 shrink-0 text-muted-foreground/70"
                    icon="ph:upload-simple"
                  />
                  <span className="shrink-0">上传人</span>
                  <Avatar
                    className="size-4! shrink-0"
                    generatedSize={16}
                    label={`${textOrDash(record.creatorName)}的头像`}
                    seed={`recruiter:${textOrDash(record.creatorName)}`}
                    size="sm"
                  >
                    {record.creatorImage ? (
                      <AvatarImage alt={textOrDash(record.creatorName)} src={record.creatorImage} />
                    ) : null}
                    <AvatarFallback>{getCreatorInitial(record.creatorName)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate">{textOrDash(record.creatorName)}</span>
                </span>

                <span className="inline-flex min-h-6 min-w-0 items-center text-muted-foreground text-xs">
                  {formatLocalDateTime(record.createdAt)}
                </span>
                {showProfile && profileSnapshot ? (
                  <Popover>
                    <PopoverTrigger
                      aria-label="更多工作与教育经历"
                      className="inline-flex min-h-6 items-center gap-1 text-muted-foreground text-xs hover:text-foreground xl:hidden"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Icon icon="ph:info" className="size-3.5" />
                      更多
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[28rem] max-w-[calc(100vw-1.5rem)]"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <PopoverTitle className="mb-3">工作与教育经历</PopoverTitle>
                      <ResumeCardProfileSnapshot snapshot={profileSnapshot} />
                    </PopoverContent>
                  </Popover>
                ) : null}
              </div>
              <ResumeLibraryEvaluationSummary record={record} />

              {skills.length > 0 ? (
                <div className="mt-3 flex h-6 gap-1.5 overflow-hidden mask-[linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]">
                  {skills.map((item) => (
                    <span
                      className="inline-flex max-w-52 shrink-0 truncate rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs"
                      key={item}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {showProfile && profileSnapshot ? (
              <div className="hidden min-w-0 xl:block">
                <ResumeCardProfileSnapshot snapshot={profileSnapshot} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <MeetingRecordingAction
        onStart={() => openMeetingRecording({ resumeRecord: record, resumeRecordId: record.id })}
        visible={hovered}
      />
    </article>
  );
}

export const ResumeLibraryCard = memo(ResumeLibraryCardComponent);
