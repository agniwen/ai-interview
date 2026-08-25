/* oxlint-disable max-lines -- resume-pool detail dialogs and panels remain co-located in this feature module. */
"use client";
import { IconLoader2 } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type {
  ResumePoolDetail,
  ResumePoolJobBindingMode,
  ResumePoolListRecord,
} from "@arc/shared/resume-pool";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { TimeDisplay } from "@/components/features/display/time-display";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fetchResumePoolItem } from "@/lib/client/api";

import {
  duplicateMatchBadge,
  getCandidateTitleWithId,
  resumeParseStatusBadge,
  sourceActorLabel,
  sourceLabel,
  uploaderUserLabel,
} from "./resume-pool-page-model";
import { ResumePoolRecommendationsPanel } from "./resume-pool-recommendations-panel";

function textOrDash(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return String(value);
}

function JobBindingModeBadge({ mode }: { mode: ResumePoolJobBindingMode | null }) {
  if (!mode || mode === "automatic") {
    return null;
  }
  return <span className="shrink-0 text-[10px] text-muted-foreground/70 leading-4">手动绑定</span>;
}

function DetailSummaryItem({ children, label }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 min-w-0 wrap-break-word font-medium text-sm leading-6">{children}</dd>
    </div>
  );
}

type ResumePoolDetailLike = ResumePoolDetail | ResumePoolListRecord;
type ResumePoolProfile = ResumePoolDetail["resumeProfile"];

export function ResumePoolDetailSummaryPanel({
  detail,
  isError,
  isLoading,
  onOpenDuplicateMatches,
  onRequestRecommendations,
  resumeProfile,
  slug,
}: {
  detail: ResumePoolDetailLike;
  isError: boolean;
  isLoading: boolean;
  onOpenDuplicateMatches?: () => void;
  onRequestRecommendations?: () => void;
  resumeProfile: ResumePoolProfile;
  slug: string;
}) {
  const skills = resumeProfile?.skills.slice(0, 8) ?? detail.skillsNormalized.slice(0, 8);
  const strengths = resumeProfile?.personalStrengths.slice(0, 3) ?? [];
  const note = detail.notes?.trim();
  let summaryContent: ReactNode = (
    <p className="mt-2 text-muted-foreground text-sm leading-6">暂无简历评价。</p>
  );
  if (isError) {
    summaryContent = <p className="mt-2 text-destructive text-sm">完整简历详情加载失败。</p>;
  } else if (note) {
    summaryContent = <MarkdownView className="mt-2 text-muted-foreground" content={note} />;
  }

  return (
    <section className="space-y-6 rounded-2xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-sm">候选人摘要</h3>
            {resumeParseStatusBadge(detail)}
            {duplicateMatchBadge(detail, onOpenDuplicateMatches)}
            {detail.importedResumeRecordId ? (
              <Badge variant="success">已创建招聘记录</Badge>
            ) : (
              <Badge variant="secondary">未创建招聘记录</Badge>
            )}
          </div>
          {summaryContent}
        </div>
        {isLoading ? (
          <span className="inline-flex shrink-0 items-center gap-2 text-muted-foreground text-xs">
            <IconLoader2 className="size-3.5 animate-spin" />
            正在加载完整详情
          </span>
        ) : null}
      </div>

      <dl className="grid gap-x-8 gap-y-4 md:grid-cols-3">
        <DetailSummaryItem label="目标岗位">{textOrDash(detail.targetRole)}</DetailSummaryItem>
        <DetailSummaryItem label="绑定岗位">
          {(() => {
            // 岗位名已按当前组织过滤：有名字=本组织可见的岗位，才做深链；
            // 有 jobDescriptionId 但无名字=岗位已不可见（删除/换岗等），仅提示不跳转。
            if (detail.jobDescriptionName) {
              return (
                <span className="inline-flex items-center gap-2">
                  <Link
                    className="underline decoration-muted-foreground/20 underline-offset-4 hover:decoration-muted-foreground/60"
                    params={{ slug }}
                    search={{ jobDescriptionId: detail.jobDescriptionId ?? undefined }}
                    to="/w/$slug/studio/job-descriptions"
                  >
                    {detail.jobDescriptionName}
                  </Link>
                  <JobBindingModeBadge mode={detail.jobBindingMode} />
                  {onRequestRecommendations ? (
                    <Button onClick={onRequestRecommendations} size="xs" variant="outline">
                      更换
                    </Button>
                  ) : null}
                </span>
              );
            }
            if (detail.jobDescriptionId) {
              return (
                <span className="inline-flex items-center gap-2 text-muted-foreground/60">
                  已绑定岗位
                  <JobBindingModeBadge mode={detail.jobBindingMode} />
                  {onRequestRecommendations ? (
                    <Button onClick={onRequestRecommendations} size="xs" variant="outline">
                      更换
                    </Button>
                  ) : null}
                </span>
              );
            }
            return onRequestRecommendations ? (
              <span className="inline-flex items-center gap-2">
                <span>—</span>
                <Button onClick={onRequestRecommendations} size="xs" variant="outline">
                  推荐
                </Button>
              </span>
            ) : (
              "—"
            );
          })()}
        </DetailSummaryItem>
        <DetailSummaryItem label="来源">{sourceLabel(detail)}</DetailSummaryItem>
        <DetailSummaryItem label={sourceActorLabel(detail)}>
          {uploaderUserLabel(detail)}
        </DetailSummaryItem>
        <DetailSummaryItem label="工作年限">
          {textOrDash(resumeProfile?.workYears ?? null)}
        </DetailSummaryItem>
        <DetailSummaryItem label="邮箱">
          {detail.candidateEmail ? (
            <a
              className="break-all underline decoration-muted-foreground/20 underline-offset-4 hover:decoration-muted-foreground/60"
              href={`mailto:${detail.candidateEmail}`}
            >
              {detail.candidateEmail}
            </a>
          ) : (
            "—"
          )}
        </DetailSummaryItem>
        <DetailSummaryItem label="电话">{textOrDash(detail.candidatePhone)}</DetailSummaryItem>
        <DetailSummaryItem label="创建时间">
          <TimeDisplay as="span" value={detail.createdAt} />
        </DetailSummaryItem>
      </dl>

      {skills.length > 0 || strengths.length > 0 ? (
        <div className="grid gap-5 border-border/50 border-t pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)]">
          {skills.length > 0 ? (
            <div>
              <p className="mb-2 text-muted-foreground text-xs">核心技能</p>
              <ul className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <li key={skill}>
                    <Badge variant="outline">{skill}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {strengths.length > 0 ? (
            <div>
              <p className="mb-2 text-muted-foreground text-xs">主要亮点</p>
              <ul className="space-y-2 text-sm">
                {strengths.map((strength) => (
                  <li className="line-clamp-2 text-muted-foreground leading-6" key={strength}>
                    {strength}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function ResumePoolStructuredInfoPanel({
  detail,
  isLoading,
  resumeProfile,
}: {
  detail: ResumePoolDetailLike;
  isLoading: boolean;
  resumeProfile: ResumePoolProfile;
}) {
  return (
    <section className="space-y-4 border-t border-border/50 pt-6">
      <h3 className="font-medium text-sm">结构化信息</h3>
      {detail.resumeParseStatus === "failed" && detail.resumeParseError ? (
        <p className="mt-2 text-destructive text-sm">{detail.resumeParseError}</p>
      ) : null}
      <div>
        {isLoading ? (
          <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
            <IconLoader2 className="size-4 animate-spin" />
            正在加载结构化简历
          </div>
        ) : (
          <ResumeProfileView profile={resumeProfile} />
        )}
      </div>
    </section>
  );
}

export function canManageResumePoolJobBinding(input: {
  canRecommend: boolean;
  currentUserId: string | null;
  detail: ResumePoolDetailLike | null;
}): boolean {
  return (
    input.canRecommend &&
    (input.detail?.scope !== "private" || input.detail.createdBy === input.currentUserId)
  );
}

export function ResumePoolRecommendationsDialog({
  canRecommend,
  currentUserId,
  onOpenChange,
  open,
  record,
  recordId,
  slug,
}: {
  canRecommend: boolean;
  currentUserId: string | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  record: ResumePoolDetail | ResumePoolListRecord | null;
  recordId?: string | null;
  slug: string;
}) {
  const itemId = record?.id ?? recordId ?? "";
  const detailQuery = useQuery({
    enabled: Boolean(itemId) && open,
    queryFn: async () => {
      if (!itemId) {
        return null;
      }
      return await fetchResumePoolItem(slug, itemId);
    },
    queryKey: ["resume-pool", "detail", slug, itemId],
  });
  const detail = detailQuery.data ?? record;
  const canManageJobBinding = canManageResumePoolJobBinding({
    canRecommend,
    currentUserId,
    detail,
  });

  return (
    <Modal
      onOpenChange={onOpenChange}
      open={open && canManageJobBinding}
      size="xl"
      title="推荐岗位"
    >
      {detailQuery.isLoading && (
        <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
          <IconLoader2 className="size-4 animate-spin" />
          正在加载人才信息…
        </div>
      )}
      {!detailQuery.isLoading && detailQuery.isError && (
        <p className="py-8 text-destructive text-sm">加载人才信息失败，请关闭后重试。</p>
      )}
      {!detailQuery.isLoading && !detailQuery.isError && detailQuery.data && (
        <ResumePoolRecommendationsPanel
          detail={detailQuery.data}
          onBound={() => onOpenChange(false)}
          slug={slug}
        />
      )}
    </Modal>
  );
}

export function ResumePoolDetailDialog({
  canRecommend,
  currentUserId,
  onOpenDuplicateMatches,
  onOpenChange,
  record,
  recordId,
  slug,
}: {
  canRecommend: boolean;
  currentUserId: string | null;
  record: ResumePoolListRecord | null;
  recordId?: string | null;
  slug: string;
  onOpenChange: (open: boolean) => void;
  onOpenDuplicateMatches?: (record: ResumePoolListRecord) => void;
}) {
  const itemId = record?.id ?? recordId ?? "";
  const detailQuery = useQuery({
    enabled: Boolean(itemId),
    queryFn: async () => {
      if (!itemId) {
        return null;
      }
      return await fetchResumePoolItem(slug, itemId);
    },
    queryKey: ["resume-pool", "detail", slug, itemId],
  });
  const detail: ResumePoolDetail | ResumePoolListRecord | null = detailQuery.data ?? record;
  const canManageJobBinding = canManageResumePoolJobBinding({
    canRecommend,
    currentUserId,
    detail,
  });
  const resumeProfile = detailQuery.data?.resumeProfile ?? null;
  const [recommendationsOpen, setRecommendationsOpen] = useState(false);
  // 切换到另一份简历时关闭推荐弹窗，避免状态残留
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- This effect intentionally synchronizes state with an external lifecycle.
    setRecommendationsOpen(false);
  }, [itemId]);
  return (
    <>
      <Modal
        description={detail?.resumeFileName ?? record?.resumeFileName ?? undefined}
        onOpenChange={onOpenChange}
        open={Boolean(itemId)}
        size="2xl"
        title={detail ? getCandidateTitleWithId(detail) : "候选人详情"}
      >
        {detail ? (
          <div className="space-y-8">
            <ResumePoolDetailSummaryPanel
              detail={detail}
              isError={detailQuery.isError}
              isLoading={detailQuery.isLoading}
              onOpenDuplicateMatches={
                record && onOpenDuplicateMatches ? () => onOpenDuplicateMatches(record) : undefined
              }
              onRequestRecommendations={
                canManageJobBinding ? () => setRecommendationsOpen(true) : undefined
              }
              resumeProfile={resumeProfile}
              slug={slug}
            />
            <ResumePoolStructuredInfoPanel
              detail={detail}
              isLoading={detailQuery.isLoading}
              resumeProfile={resumeProfile}
            />
          </div>
        ) : null}
      </Modal>
      <ResumePoolRecommendationsDialog
        canRecommend={canRecommend}
        currentUserId={currentUserId}
        onOpenChange={setRecommendationsOpen}
        open={canManageJobBinding && recommendationsOpen}
        record={detailQuery.data ?? null}
        recordId={itemId}
        slug={slug}
      />
    </>
  );
}
