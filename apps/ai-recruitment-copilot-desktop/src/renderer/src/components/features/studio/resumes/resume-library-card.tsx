import { memo } from "react";
import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { describeResumeLibraryReviewCard } from "@arc/shared/resume-review";
import type { ResumeReviewActionTone } from "@arc/shared/resume-review";
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

const REVIEW_ACTION_TONE_CLASS: Record<ResumeReviewActionTone, string> = {
  danger: "text-rose-700 dark:text-rose-300",
  muted: "text-muted-foreground",
  success: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-700 dark:text-amber-300",
};

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

function getCandidateInitials(name: string) {
  const source = name.trim();
  if (!source) {
    return "U";
  }
  return source.slice(0, 2).toUpperCase();
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

/**
 * Read-only resume library card for desktop (no actions / checkbox / detail nav).
 * Layout mirrors web `ResumeLibraryCard` content columns for breakpoint heights.
 */
function ResumeLibraryCardComponent({ record }: { record: ResumeLibraryListRecord }) {
  const jobDescriptionLabel = getResumeLibraryJobDescriptionLabel(record);
  const lifecycle = describeLifecycleCell(record);
  const profileSnapshot = record.resumeProfileSnapshot;
  const skills = record.resumeSkills;
  const summary = record.resumeSummary;
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
    ? { ...baseReviewCard, label: `旧版本结果 · ${baseReviewCard.label}` }
    : baseReviewCard;
  // Profile (work / education) only at xl+ as a side column. On narrow /
  // min-width layouts it stacks and bloats the card — hide it entirely.
  const showProfile = hasProfileSnapshotContent(profileSnapshot);

  return (
    <article
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card",
        "transition-colors hover:border-border hover:bg-muted/30",
        "dark:bg-background dark:hover:bg-input/30",
      )}
    >
      <div className="flex gap-3 p-4">
        <Avatar className="mt-0.5 size-12 shrink-0 rounded-full" size="default">
          <AvatarFallback className="rounded-full text-sm">
            {getCandidateInitials(record.candidateName)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "grid min-w-0 gap-x-4 gap-y-3",
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
                <span>{record.candidateName}</span>{" "}
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
              <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 2xl:grid-cols-3">
                <ResumeCardMetaItem
                  className="sm:col-span-2 2xl:col-span-1"
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

                <span className="flex h-6 w-full min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
                  <Icon
                    className="size-3.5 shrink-0 text-muted-foreground/70"
                    icon="ph:upload-simple"
                  />
                  <span className="shrink-0">上传人</span>
                  <Avatar className="size-4! shrink-0" size="sm">
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

                <ResumeCardMetaItem
                  icon={
                    <span className={REVIEW_ACTION_TONE_CLASS[reviewCard.tone]}>
                      <Icon className="size-3.5" icon="ph:sparkle" />
                    </span>
                  }
                  label="下一步建议"
                >
                  <span
                    className={cn(
                      "min-w-0 truncate font-medium",
                      REVIEW_ACTION_TONE_CLASS[reviewCard.tone],
                    )}
                  >
                    {reviewCard.label}
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
                    <span
                      className="inline-flex max-w-52 truncate rounded-md border border-border px-2 py-0.5 text-xs"
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
    </article>
  );
}

export const ResumeLibraryCard = memo(ResumeLibraryCardComponent);
