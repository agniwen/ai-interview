"use client";

import {
  IconBriefcase,
  IconBuilding,
  IconFileDescription,
  IconLoader2,
  IconRefresh,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import type { ResumePoolListRecord } from "@arc/shared/resume-pool";
import { useSyncExternalStore } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { formatResumeRecordDisplayId } from "@/components/features/resume/resume-record-display-id";
import { ResumeDocumentPreviewAction } from "@/components/features/resume/resume-document-preview-action";
import { JobDescriptionHoverCard } from "@/components/features/studio/job-descriptions/job-description-hover-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";

import {
  getCandidateTitle,
  getResumePoolImportActionState,
  duplicateMatchBadge,
  resumeParseStatusBadge,
  resumeRecruitingStatusBadge,
  sourceLabel,
  uploaderMetaLabel,
  uploaderMetaSegments,
} from "./resume-pool-page-model";
import { ResumePoolJobBindingMenu } from "./resume-pool-job-binding-menu";

const RESUME_POOL_CARD_HEIGHTS = {
  base: 356,
  lg: 246,
  md: 286,
  sm: 308,
  xl: 220,
  xxl: 218,
} as const;
const RESUME_POOL_CARD_MEDIA_QUERIES = [640, 768, 1024, 1280, 1536].map(
  (width) => `(min-width: ${width}px)`,
);
const RESUME_POOL_CARD_SKILL_LIMIT = 6;
type ResumePoolProfileSnapshotLine = ResumePoolListRecord["resumeProfileSnapshot"]["work"][number];

export function getResumePoolCardHeight(viewportWidth: number) {
  if (viewportWidth >= 1536) {
    return RESUME_POOL_CARD_HEIGHTS.xxl;
  }
  if (viewportWidth >= 1280) {
    return RESUME_POOL_CARD_HEIGHTS.xl;
  }
  if (viewportWidth >= 1024) {
    return RESUME_POOL_CARD_HEIGHTS.lg;
  }
  if (viewportWidth >= 768) {
    return RESUME_POOL_CARD_HEIGHTS.md;
  }
  if (viewportWidth >= 640) {
    return RESUME_POOL_CARD_HEIGHTS.sm;
  }
  return RESUME_POOL_CARD_HEIGHTS.base;
}

function subscribeToResumePoolCardWidth(onStoreChange: () => void) {
  const mediaQueries = RESUME_POOL_CARD_MEDIA_QUERIES.map((query) => window.matchMedia(query));
  for (const mediaQuery of mediaQueries) {
    mediaQuery.addEventListener("change", onStoreChange);
  }
  return () => {
    for (const mediaQuery of mediaQueries) {
      mediaQuery.removeEventListener("change", onStoreChange);
    }
  };
}

function getViewportCardHeight() {
  return getResumePoolCardHeight(window.innerWidth);
}

function getServerCardHeight() {
  return RESUME_POOL_CARD_HEIGHTS.lg;
}

export function useResumePoolCardHeight() {
  return useSyncExternalStore(
    subscribeToResumePoolCardWidth,
    getViewportCardHeight,
    getServerCardHeight,
  );
}

function isInteractiveCardClick(event: ReactMouseEvent<HTMLElement>) {
  return event.target instanceof Element
    ? Boolean(
        event.target.closest(
          "a,button,input,label,[role='button'],[role='menuitem'],[data-resume-document-preview-disabled]",
        ),
      )
    : false;
}

function isTextSelectionClick() {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

function getCandidateInitial(record: ResumePoolListRecord) {
  return (record.candidateName || record.candidateEmail || "?").trim().slice(0, 1).toUpperCase();
}

function ResumePoolCardMeta({
  action,
  icon,
  label,
  value,
  valueContent,
}: {
  action?: ReactNode;
  icon: ReactNode;
  label: string;
  value: string;
  valueContent?: ReactNode;
}) {
  return (
    <span className="flex min-h-6 min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
      <span className="shrink-0 text-muted-foreground/70">{icon}</span>
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 truncate text-foreground/80" title={value}>
        {valueContent ?? value}
      </span>
      {action}
    </span>
  );
}

function ResumePoolUploaderMeta({ record }: { record: ResumePoolListRecord }) {
  const segments = uploaderMetaSegments(record);

  return (
    <span className="flex min-h-6 min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
      <span className="shrink-0 text-muted-foreground/70">
        <IconUpload className="size-3.5" />
      </span>
      <span className="shrink-0">{sourceLabel(record)}</span>
      <span
        className="inline-flex min-w-0 items-center gap-1 overflow-hidden text-foreground/80"
        title={uploaderMetaLabel(record)}
      >
        {segments.leadingText ? <span className="shrink-0">{segments.leadingText}</span> : null}
        <Avatar className="size-4">
          {record.uploaderImage ? (
            <AvatarImage alt={`${segments.userName}的头像`} src={record.uploaderImage} />
          ) : null}
          <AvatarFallback className="text-[9px]">
            {segments.userName.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="shrink-0">{segments.userName}</span>
        <span className="min-w-0 truncate">{segments.trailingText}</span>
      </span>
    </span>
  );
}

function ResumePoolProfileLine({ line }: { line: ResumePoolProfileSnapshotLine }) {
  return (
    <p
      className="flex min-w-0 items-baseline gap-2"
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

function ResumePoolProfileSnapshot({ record }: { record: ResumePoolListRecord }) {
  const work = record.resumeProfileSnapshot.work.slice(0, 2);
  const education = record.resumeProfileSnapshot.education.slice(0, 2);
  if (work.length === 0 && education.length === 0) {
    return null;
  }

  return (
    <div className="hidden min-w-0 border-border/60 border-l border-dashed pl-8 xl:block">
      <div className="grid min-w-0 content-start gap-1 xl:max-w-sm">
        {work.map((line) => (
          <ResumePoolProfileLine key={`work-${line.primary}-${line.period ?? ""}`} line={line} />
        ))}
        {work.length > 0 && education.length > 0 ? (
          <div className="my-0.5 border-border/60 border-t" />
        ) : null}
        {education.map((line) => (
          <ResumePoolProfileLine
            key={`education-${line.primary}-${line.period ?? ""}`}
            line={line}
          />
        ))}
      </div>
    </div>
  );
}

function ResumePoolCardActions({
  canDelete,
  canEnterRecruiting,
  canRetryParse,
  deleting,
  enteringRecruiting,
  onDelete,
  onEnterRecruiting,
  onOpenDetail,
  onPreviewResume,
  onRetryParse,
  record,
  retrying,
}: {
  canDelete: boolean;
  canEnterRecruiting: boolean;
  canRetryParse: boolean;
  deleting: boolean;
  enteringRecruiting: boolean;
  onDelete: (record: ResumePoolListRecord) => void;
  onEnterRecruiting: (record: ResumePoolListRecord) => void;
  onOpenDetail: (record: ResumePoolListRecord) => void;
  onPreviewResume: (record: ResumePoolListRecord) => void;
  onRetryParse: (record: ResumePoolListRecord) => void;
  record: ResumePoolListRecord;
  retrying: boolean;
}) {
  const importActionState = getResumePoolImportActionState(record);
  const enterDisabled =
    !canEnterRecruiting ||
    enteringRecruiting ||
    (!record.importedResumeRecordId && importActionState.disabled);
  const actionClass = "h-8 gap-1 px-2 text-xs";

  return (
    <div className="flex items-center justify-end gap-1.5 lg:flex-col lg:items-stretch">
      <ResumeDocumentPreviewAction
        fileName={record.resumeFileName}
        hasResumeFile={Boolean(record.resumeStorageKey)}
        onPreview={() => onPreviewResume(record)}
      />
      <Button
        aria-label="查看人才详情"
        className={actionClass}
        data-resume-pool-card-action="详情"
        onClick={(event) => {
          event.stopPropagation();
          onOpenDetail(record);
        }}
        size="sm"
        type="button"
        variant="ghost"
      >
        <IconFileDescription data-icon="inline-start" />
        详情
      </Button>
      {canRetryParse && record.resumeParseStatus === "failed" ? (
        <Button
          aria-label="重新解析简历"
          className={actionClass}
          data-resume-pool-card-action="重新解析"
          disabled={retrying}
          onClick={(event) => {
            event.stopPropagation();
            onRetryParse(record);
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {retrying ? (
            <IconLoader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <IconRefresh data-icon="inline-start" />
          )}
          {retrying ? "加入队列中…" : "重新解析"}
        </Button>
      ) : null}
      <Button
        aria-label="进入招聘"
        className={actionClass}
        data-resume-pool-card-action="进入招聘"
        disabled={enterDisabled}
        onClick={(event) => {
          event.stopPropagation();
          onEnterRecruiting(record);
        }}
        size="sm"
        title={record.importedResumeRecordId ? "打开招聘记录" : importActionState.label}
        type="button"
        variant="ghost"
      >
        {enteringRecruiting || importActionState.loading ? (
          <IconLoader2 className="animate-spin" data-icon="inline-start" />
        ) : (
          <IconBriefcase data-icon="inline-start" />
        )}
        进入招聘
      </Button>
      {canDelete ? (
        <Button
          aria-label="删除人才记录"
          className={`${actionClass} text-destructive hover:text-destructive`}
          data-resume-pool-card-action="删除"
          disabled={deleting}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(record);
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {deleting ? (
            <IconLoader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <IconTrash data-icon="inline-start" />
          )}
          删除
        </Button>
      ) : null}
    </div>
  );
}

export function ResumePoolCard({
  bindingJobDescription,
  canDelete,
  canEnterRecruiting,
  canRecommend,
  canRetryParse,
  deleting,
  enteringRecruiting,
  onBindJobDescription,
  onDelete,
  onEnterRecruiting,
  onOpenDetail,
  onOpenDuplicateMatches,
  onPreviewResume,
  onRetryParse,
  record,
  retrying,
  slug,
}: {
  bindingJobDescription: boolean;
  canDelete: boolean;
  canEnterRecruiting: boolean;
  canRecommend: boolean;
  canRetryParse: boolean;
  deleting: boolean;
  enteringRecruiting: boolean;
  onBindJobDescription: (record: ResumePoolListRecord, jobDescriptionId: string) => void;
  onDelete: (record: ResumePoolListRecord) => void;
  onEnterRecruiting: (record: ResumePoolListRecord) => void;
  onOpenDetail: (record: ResumePoolListRecord) => void;
  onOpenDuplicateMatches: (record: ResumePoolListRecord) => void;
  onPreviewResume: (record: ResumePoolListRecord) => void;
  onRetryParse: (record: ResumePoolListRecord) => void;
  record: ResumePoolListRecord;
  retrying: boolean;
  slug: string;
}) {
  const title = getCandidateTitle(record);
  const skills = record.masteredSkills.slice(0, RESUME_POOL_CARD_SKILL_LIMIT);
  const summary =
    record.qualitativeResumeSummary?.trim() ||
    record.profileHighlights.personalStrengths
      .map((strength) => strength.trim().replace(/[;；。]+$/u, ""))
      .filter(Boolean)
      .join("；") ||
    "暂无主要亮点。";
  const targetRole = record.targetRole?.trim() || "未填写目标岗位";
  const boundJobName = record.jobDescriptionName?.trim();
  const boundJob = boundJobName || "未绑定岗位";

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <Card
      className="h-full overflow-hidden rounded-xl transition-colors hover:border-border hover:bg-muted/30 dark:bg-background dark:hover:bg-input/30"
      onClick={(event) => {
        if (isInteractiveCardClick(event) || isTextSelectionClick()) {
          return;
        }
        onOpenDetail(record);
      }}
      render={<article />}
    >
      <CardPanel className="grid h-full min-h-0 gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-4">
        <div className="flex min-h-0 min-w-0 gap-3">
          <Avatar
            className="mt-0.5 size-12 shrink-0"
            generatedSize={48}
            label={`${title}的头像`}
            seed={title}
          >
            <AvatarFallback>{getCandidateInitial(record)}</AvatarFallback>
          </Avatar>

          <div className="min-h-0 min-w-0 flex-1">
            <div className="grid min-w-0 gap-x-8 gap-y-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.7fr)]">
              <div className="flex min-w-0 flex-wrap items-center gap-2 xl:col-span-2">
                <button
                  className="min-w-0 truncate text-left font-semibold text-base underline decoration-transparent underline-offset-4 transition-colors hover:decoration-foreground/40"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenDetail(record);
                  }}
                  type="button"
                >
                  <span>{title}</span>{" "}
                  <span className="font-normal text-muted-foreground/60 text-xs">
                    ({formatResumeRecordDisplayId(record.id)})
                  </span>
                </button>
                {resumeParseStatusBadge(record)}
                {duplicateMatchBadge(record, () => onOpenDuplicateMatches(record))}
                {resumeRecruitingStatusBadge(record)}
                {record.sourceChannel === "referral" ? (
                  <Badge variant="secondary">内推</Badge>
                ) : null}
              </div>

              <div className="min-h-0 min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
                  <ResumePoolCardMeta
                    icon={<IconBriefcase className="size-3.5" />}
                    label="目标岗位"
                    value={targetRole}
                  />
                  <ResumePoolCardMeta
                    action={
                      canRecommend ? (
                        <ResumePoolJobBindingMenu
                          binding={bindingJobDescription}
                          currentJobDescriptionId={record.jobDescriptionId}
                          onSelect={(jobDescriptionId) =>
                            onBindJobDescription(record, jobDescriptionId)
                          }
                          recordId={record.id}
                          slug={slug}
                        />
                      ) : undefined
                    }
                    icon={<IconBuilding className="size-3.5" />}
                    label="绑定岗位"
                    value={boundJob}
                    valueContent={
                      record.jobDescriptionId && boundJobName ? (
                        <JobDescriptionHoverCard
                          className="min-w-0 truncate text-foreground/80 underline decoration-transparent underline-offset-2 transition-colors hover:decoration-foreground/40"
                          jobDescriptionId={record.jobDescriptionId}
                          name={boundJobName}
                        />
                      ) : undefined
                    }
                  />
                  <ResumePoolUploaderMeta record={record} />
                </div>

                <p
                  className="mt-3 line-clamp-3 text-[13px] text-muted-foreground leading-[19px]"
                  title={summary}
                >
                  {summary}
                </p>

                {skills.length > 0 ? (
                  <div className="mt-3 flex flex-nowrap gap-1.5 overflow-hidden [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]">
                    {skills.map((skill) => (
                      <Badge className="max-w-52 truncate" key={skill} variant="outline">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>

              <ResumePoolProfileSnapshot record={record} />
            </div>
          </div>
        </div>

        <ResumePoolCardActions
          canDelete={canDelete}
          canEnterRecruiting={canEnterRecruiting}
          canRetryParse={canRetryParse}
          deleting={deleting}
          enteringRecruiting={enteringRecruiting}
          onDelete={onDelete}
          onEnterRecruiting={onEnterRecruiting}
          onOpenDetail={onOpenDetail}
          onPreviewResume={onPreviewResume}
          onRetryParse={onRetryParse}
          record={record}
          retrying={retrying}
        />
      </CardPanel>
    </Card>
  );
}
