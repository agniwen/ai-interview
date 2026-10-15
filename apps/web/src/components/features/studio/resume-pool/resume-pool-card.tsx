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
import type { ResumePoolListRecord } from "@app/shared/resume-pool";
import { cn } from "@app/shared/utils";
import { Link } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { formatResumeRecordDisplayId } from "@/components/features/resume/resume-record-display-id";
import { ResumeDocumentPreviewAction } from "@/components/features/resume/resume-document-preview-action";
import { JobDescriptionHoverCard } from "@/components/features/studio/job-descriptions/job-description-hover-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { STUDIO_LIST_CARD_ACTIONS_CLASS } from "@/components/features/studio/studio-list-card-actions";
import {
  QUALITATIVE_RECOMMENDATION_LABEL,
  STUDIO_LIST_CARD_EVALUATION_TEXT_CLASS,
  StudioListCardEvaluation,
  StudioListCardEvaluationFocus,
  StudioListCardEvaluationFocusPlaceholder,
  StudioListCardEvaluationSkeleton,
  StudioListCardProfileSnapshotSkeleton,
  QUALITATIVE_RECOMMENDATION_VERDICT_TONE,
  StudioListCardAiVerdictBadge,
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
import { RESUME_EMAIL_INGEST_SECTION_ID } from "@/components/features/studio/profile/profile-anchors";
import { useWorkspaceCan } from "@/lib/client/workspace-context";
import { ResumePoolAiEvaluationHoverCard } from "@/components/features/studio/resumes/resume-ai-score-hover-card";

/** 卡片按固定槽位排版（见 studio-list-card-profile），各断点高度由布局决定，与招聘台一致。 */
const RESUME_POOL_CARD_HEIGHTS = {
  base: 418,
  lg: 502,
  md: 502,
  sm: 418,
  xl: 368,
  xxl: 368,
} as const;
const RESUME_POOL_CARD_MEDIA_QUERIES = [640, 768, 1024, 1280, 1536].map(
  (width) => `(min-width: ${width}px)`,
);

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

function isResumePoolRecordParsing(record: ResumePoolListRecord) {
  return record.resumeParseStatus === "queued" || record.resumeParseStatus === "processing";
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
    <span
      className="flex h-6 min-w-0 shrink items-center gap-1.5 text-muted-foreground text-xs"
      title={`${label}：${value}`}
    >
      <span aria-hidden className="shrink-0 text-muted-foreground">
        {icon}
      </span>
      <span className="sr-only shrink-0 2xl:not-sr-only">{label}</span>
      <span className="min-w-0 truncate text-foreground" title={value}>
        {valueContent ?? value}
      </span>
      {action}
    </span>
  );
}

function ResumePoolUploaderMeta({ record }: { record: ResumePoolListRecord }) {
  const segments = uploaderMetaSegments(record);

  return (
    <span className="hidden h-6 min-w-0 shrink items-center gap-1.5 text-muted-foreground text-xs md:flex xl:hidden 2xl:flex">
      <span className="shrink-0 text-muted-foreground">
        <IconUpload className="size-3.5" />
      </span>
      <span className="shrink-0">{sourceLabel(record)}</span>
      <span
        className="inline-flex min-w-0 items-center gap-1 overflow-hidden text-foreground"
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

function ResumePoolCardEvaluation({
  onOpenDetail,
  record,
  slug,
  summary,
}: {
  onOpenDetail: (record: ResumePoolListRecord) => void;
  record: ResumePoolListRecord;
  slug: string;
  summary: string;
}) {
  const canOpenProfile = useWorkspaceCan("page", "me");
  const canManageMailIngest = useWorkspaceCan("resumeEmailIngest", "read") && canOpenProfile;
  if (isResumePoolRecordParsing(record)) {
    return <StudioListCardEvaluationSkeleton />;
  }
  const level = record.qualitativeRecommendationLevel;
  const title = level ? `${QUALITATIVE_RECOMMENDATION_LABEL[level]} ${summary}` : summary;

  return (
    <StudioListCardEvaluation>
      {level ? (
        <p title={title}>
          <ResumePoolAiEvaluationHoverCard
            className={cn("block w-full", STUDIO_LIST_CARD_EVALUATION_TEXT_CLASS)}
            onClick={() => onOpenDetail(record)}
            recordId={record.id}
          >
            {summary}
          </ResumePoolAiEvaluationHoverCard>
        </p>
      ) : (
        <p className={STUDIO_LIST_CARD_EVALUATION_TEXT_CLASS} title={title}>
          {summary}
        </p>
      )}
      {level ? <StudioListCardEvaluationFocus focus={record.qualitativeResumeFocus} /> : null}
      {!level && !record.jobDescriptionId ? (
        <StudioListCardEvaluationFocusPlaceholder>
          <p className="text-foreground">未绑定岗位，还没有匹配依据和风险</p>
          <p className="mt-0.5 text-muted-foreground text-xs leading-5">
            绑定岗位后生成；接入简历邮箱后，收到的简历会自动匹配岗位
          </p>
          {canManageMailIngest ? (
            <Button
              className="mt-2 h-7 px-2.5 text-[13px]"
              nativeButton={false}
              render={
                <Link
                  hash={RESUME_EMAIL_INGEST_SECTION_ID}
                  params={{ slug }}
                  to="/w/$slug/studio/me"
                />
              }
              size="xs"
              variant="secondary"
            >
              去设置
            </Button>
          ) : null}
        </StudioListCardEvaluationFocusPlaceholder>
      ) : null}
    </StudioListCardEvaluation>
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
    <div className={STUDIO_LIST_CARD_ACTIONS_CLASS}>
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
      className="group/list-card h-full overflow-hidden rounded-lg border-0 bg-transparent transition-colors hover:bg-muted dark:hover:bg-input/30"
      onClick={(event) => {
        if (isInteractiveCardClick(event) || isTextSelectionClick()) {
          return;
        }
        onOpenDetail(record);
      }}
      render={<article />}
    >
      <CardPanel className="flex h-full min-h-0 p-4">
        <div className={STUDIO_LIST_CARD_BODY_GRID_CLASS}>
          <div className="flex min-w-0 items-center gap-3 xl:col-span-2">
            <Avatar
              className="size-10 shrink-0"
              generatedSize={40}
              label={`${title}的头像`}
              seed={title}
            >
              <AvatarFallback>{getCandidateInitial(record)}</AvatarFallback>
            </Avatar>
            <div className={STUDIO_LIST_CARD_TITLE_ROW_CLASS}>
              <button
                className={STUDIO_LIST_CARD_NAME_CLASS}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDetail(record);
                }}
                type="button"
              >
                <span>{title}</span>{" "}
                <span className="font-normal text-muted-foreground text-xs">
                  ({formatResumeRecordDisplayId(record.id)})
                </span>
              </button>
              {record.qualitativeRecommendationLevel && !isResumePoolRecordParsing(record) ? (
                <StudioListCardAiVerdictBadge
                  label={QUALITATIVE_RECOMMENDATION_LABEL[record.qualitativeRecommendationLevel]}
                  tone={
                    QUALITATIVE_RECOMMENDATION_VERDICT_TONE[record.qualitativeRecommendationLevel]
                  }
                />
              ) : null}
              {resumeParseStatusBadge(record)}
              {duplicateMatchBadge(record, () => onOpenDuplicateMatches(record))}
              {resumeRecruitingStatusBadge(record)}
              {record.sourceChannel === "referral" ? <Badge variant="secondary">内推</Badge> : null}
            </div>
          </div>

          <div className="min-w-0">
            <div className={STUDIO_LIST_CARD_META_ROW_CLASS}>
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
                      className="min-w-0 truncate text-foreground underline decoration-transparent underline-offset-2 transition-colors hover:decoration-foreground/40"
                      jobDescriptionId={record.jobDescriptionId}
                      name={boundJobName}
                    />
                  ) : undefined
                }
              />
              <ResumePoolUploaderMeta record={record} />
            </div>

            {isResumePoolRecordParsing(record) ? (
              <StudioListCardProfileStripSkeleton className="mt-3 hidden md:grid xl:hidden" />
            ) : (
              <StudioListCardProfileStrip
                className="mt-3 hidden md:grid xl:hidden"
                snapshot={record.resumeProfileSnapshot}
              />
            )}

            <ResumePoolCardEvaluation
              onOpenDetail={onOpenDetail}
              record={record}
              slug={slug}
              summary={summary}
            />
          </div>

          <div className={STUDIO_LIST_CARD_PROFILE_CELL_CLASS}>
            {isResumePoolRecordParsing(record) ? (
              <StudioListCardProfileSnapshotSkeleton />
            ) : (
              <StudioListCardProfileColumn snapshot={record.resumeProfileSnapshot} />
            )}
          </div>

          <div className={STUDIO_LIST_CARD_ACTIONS_CELL_CLASS}>
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
          </div>
        </div>
      </CardPanel>
    </Card>
  );
}
