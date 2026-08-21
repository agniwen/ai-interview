/* oxlint-disable max-lines -- resume-pool detail and card views remain co-located in this feature module. */
"use client";
import type { TablerIcon } from "@tabler/icons-react";
import {
  IconBriefcase2,
  IconBuilding,
  IconFileUpload,
  IconGitBranch,
  IconLink,
  IconLoader2,
  IconRefresh,
  IconSchool,
  IconSend,
  IconTrash,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ResumePoolScope } from "@arc/db-schema/schema";
import type {
  ResumePoolDetail,
  ResumePoolJobBindingMode,
  ResumePoolLatestExperienceDetail,
  ResumePoolListRecord,
} from "@arc/shared/resume-pool";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getMemberInitials } from "@/components/data-grid/cells/member-cell";
import { TimeDisplay } from "@/components/features/display/time-display";
import {
  ResumeDocumentFileIcon,
  getResumeDocumentFileIconKind,
} from "@/components/features/resume/resume-document-file-icon";
import { formatResumeRecordDisplayId } from "@/components/features/resume/resume-record-display-id";
import { ResumeEducationDisplayLine } from "@/components/features/resume/resume-education-line";
import {
  isPreviewableResumeDocumentInput,
  UnsupportedResumeDocumentPreviewTooltip,
} from "@/components/features/resume/resume-document-preview-button";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { Separator } from "@/components/ui/separator";
import { fetchResumePoolItem } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

import {
  duplicateMatchBadge,
  getCandidateDisplayTitle,
  getCandidateTitleWithId,
  getResumePoolImportActionState,
  resumeParseStatusBadge,
  sourceActorLabel,
  sourceLabel,
  uploaderMetaLabel,
  uploaderUserLabel,
} from "./resume-pool-page-model";
import { ResumePoolRecommendationsPanel } from "./resume-pool-recommendations-panel";

const RESUME_POOL_CARD_SKILL_LIMIT = 9;

function notesPreview(value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length > 120 ? `${trimmed.slice(0, 119)}…` : trimmed;
}

function textOrDash(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return String(value);
}

function JobBindingModeBadge({ mode }: { mode: ResumePoolJobBindingMode | null }) {
  if (!mode) {
    return null;
  }
  return (
    <span className="shrink-0 text-[10px] text-muted-foreground/70 leading-4">
      {mode === "automatic" ? "自动匹配" : "手动绑定"}
    </span>
  );
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

function ResumePoolDetailSummaryPanel({
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
          {isError ? (
            <p className="mt-2 text-destructive text-sm">完整简历详情加载失败。</p>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground text-sm leading-6">
              {note || "暂无简历评价。"}
            </p>
          )}
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

function ResumePoolStructuredInfoPanel({
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

function ResumePoolHighlightRow({
  icon: Icon,
  label,
  value,
}: {
  icon: TablerIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-1 whitespace-pre-wrap wrap-break-word text-foreground leading-5">
        {value}
      </div>
    </div>
  );
}

function ResumePoolLatestExperience({
  detail,
  title,
}: {
  detail: ResumePoolLatestExperienceDetail | null;
  title: string;
}) {
  const metadata = [detail?.role, detail?.period].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0">
      <p className="font-medium text-xs">{title}</p>
      {metadata ? <p className="mt-0.5 text-muted-foreground text-[11px]">{metadata}</p> : null}
      {detail?.summary ? (
        <p className="mt-1 line-clamp-2 text-muted-foreground text-[11px] leading-4">
          {detail.summary}
        </p>
      ) : null}
    </div>
  );
}

function ResumePoolCardHighlights({ record }: { record: ResumePoolListRecord }) {
  const { profileHighlights } = record;
  const { educationItems } = profileHighlights;
  const educationFallbackLines =
    profileHighlights.educationLines.length > 0
      ? profileHighlights.educationLines
      : profileHighlights.schools;
  const educationValue =
    educationItems.length > 0 ? (
      <ul className="flex flex-col gap-1">
        {educationItems.map((item) => (
          <li key={`${item.level ?? "education"}-${item.school}-${item.major ?? ""}`}>
            <ResumeEducationDisplayLine item={item} levelDisplay="suffix" />
          </li>
        ))}
      </ul>
    ) : (
      educationFallbackLines.join("\n")
    );
  const rows = [
    {
      icon: IconSchool,
      label: "教育经历",
      value: educationValue,
      visible: educationItems.length > 0 || educationFallbackLines.length > 0,
    },
    {
      icon: IconBuilding,
      label: "最近公司",
      value: (
        <ResumePoolLatestExperience
          detail={profileHighlights.latestCompanyDetail}
          title={profileHighlights.latestCompany ?? ""}
        />
      ),
      visible: Boolean(profileHighlights.latestCompany),
    },
    {
      icon: IconGitBranch,
      label: "最近项目",
      value: (
        <ResumePoolLatestExperience
          detail={profileHighlights.latestProjectDetail}
          title={profileHighlights.latestProject ?? ""}
        />
      ),
      visible: Boolean(profileHighlights.latestProject),
    },
  ].filter((item) => item.visible);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="text-xs">
      <Separator />
      {rows.map((row) => (
        <ResumePoolHighlightRow
          icon={row.icon}
          key={row.label}
          label={row.label}
          value={row.value}
        />
      ))}
      <Separator />
    </div>
  );
}

function ResumePoolCardUploaderMeta({ record }: { record: ResumePoolListRecord }) {
  const displayName = uploaderUserLabel(record);
  return (
    <div className="flex min-w-0 items-center gap-1 text-muted-foreground text-xs">
      <Avatar className="size-4" size="default">
        {record.uploaderImage ? <AvatarImage alt={displayName} src={record.uploaderImage} /> : null}
        <AvatarFallback className="text-[8px]">
          {getMemberInitials(record.uploaderName, record.uploaderEmail)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate font-normal leading-none">{uploaderMetaLabel(record)}</span>
    </div>
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

function ResumePoolCardActions({
  canDelete,
  canImport,
  canPublish,
  canRetryParse,
  deleting,
  importActionState,
  onDelete,
  onImport,
  onPublish,
  onRetryParse,
  publishing,
  retrying,
  record,
  scope,
}: {
  canDelete: boolean;
  canImport: boolean;
  canPublish: boolean;
  canRetryParse: boolean;
  deleting: boolean;
  importActionState: ReturnType<typeof getResumePoolImportActionState>;
  publishing: boolean;
  retrying: boolean;
  record: ResumePoolListRecord;
  scope: ResumePoolScope;
  onDelete: (record: ResumePoolListRecord) => void;
  onImport: (record: ResumePoolListRecord) => void;
  onPublish: (record: ResumePoolListRecord) => void;
  onRetryParse: (record: ResumePoolListRecord) => void;
}) {
  const showPublishAction = scope === "private" && canPublish;
  const showRetryAction =
    canRetryParse && record.resumeParseStatus === "failed" && record.resumeParseRetryable === true;
  if (!canImport && !showPublishAction && !canDelete && !showRetryAction) {
    return null;
  }

  return (
    <CardFooter className="flex items-center gap-2 p-3 pt-0">
      {showRetryAction ? (
        <Button
          className="min-w-0 flex-1 justify-center"
          disabled={retrying}
          onClick={() => onRetryParse(record)}
          variant="outline"
        >
          {retrying ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconRefresh className="size-4" />
          )}
          {retrying ? "加入队列中…" : "重新解析"}
        </Button>
      ) : null}
      {canImport ? (
        <Button
          aria-label={importActionState.label}
          className="min-w-0 flex-1 justify-center"
          disabled={importActionState.disabled}
          onClick={() => onImport(record)}
          title={importActionState.label}
          variant="outline"
        >
          {importActionState.loading ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconFileUpload className="size-4" />
          )}
          {importActionState.label}
        </Button>
      ) : null}
      {showPublishAction ? (
        <Button
          aria-label="推送到公共简历池"
          className="shrink-0"
          disabled={publishing}
          onClick={() => onPublish(record)}
          size="icon-sm"
          title="推送到公共简历池"
          variant="outline"
        >
          <IconSend className="size-4" />
        </Button>
      ) : null}
      {canDelete ? (
        <Button
          aria-label={scope === "private" ? "删除私有简历" : "删除简历"}
          className="shrink-0"
          disabled={deleting}
          onClick={() => onDelete(record)}
          size="icon-sm"
          title={scope === "private" ? "删除私有简历" : "删除简历"}
          variant="outline"
        >
          <IconTrash className="size-4" />
        </Button>
      ) : null}
    </CardFooter>
  );
}

export function ResumePoolCard({
  canDelete,
  canImport,
  canPublish,
  canRecommend,
  canRetryParse,
  deleting,
  onDelete,
  onOpenDuplicateMatches,
  onOpenDetail,
  onOpenPdf,
  onImport,
  onPublish,
  onRecommend,
  onRetryParse,
  onSelectionChange,
  publishing,
  retrying,
  record,
  selected,
  selectionDisabled,
  scope,
}: {
  record: ResumePoolListRecord;
  scope: ResumePoolScope;
  canDelete: boolean;
  canImport: boolean;
  canPublish: boolean;
  canRecommend: boolean;
  canRetryParse: boolean;
  publishing: boolean;
  retrying: boolean;
  deleting: boolean;
  selected: boolean;
  selectionDisabled: boolean;
  onOpenDetail: (record: ResumePoolListRecord) => void;
  onOpenDuplicateMatches: (record: ResumePoolListRecord) => void;
  onOpenPdf: (record: ResumePoolListRecord) => void;
  onImport: (record: ResumePoolListRecord) => void;
  onPublish: (record: ResumePoolListRecord) => void;
  onRecommend: (record: ResumePoolListRecord) => void;
  onRetryParse: (record: ResumePoolListRecord) => void;
  onDelete: (record: ResumePoolListRecord) => void;
  onSelectionChange: (record: ResumePoolListRecord, selected: boolean) => void;
}) {
  const slug = useWorkspaceSlug();
  const title = getCandidateDisplayTitle(record);
  const previewLabel = record.resumeFileName ?? "查看简历";
  const skills = record.masteredSkills.slice(0, RESUME_POOL_CARD_SKILL_LIMIT);
  const skillsOverflow = record.masteredSkills.length - skills.length;
  const note = notesPreview(record.notes);
  const documentKind = getResumeDocumentFileIconKind({ fileName: record.resumeFileName });
  const hasStoredResume = Boolean(record.resumeStorageKey);
  const previewable = isPreviewableResumeDocumentInput({ fileName: record.resumeFileName });
  const canPreview = hasStoredResume && previewable;
  const importActionState = getResumePoolImportActionState(record);
  let documentIcon = (
    <span
      aria-disabled="true"
      aria-label="暂无可预览简历"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md opacity-45 grayscale"
      title="暂无可预览简历"
    >
      <ResumeDocumentFileIcon className="size-8" kind={documentKind} />
    </span>
  );
  if (canPreview) {
    documentIcon = (
      <button
        aria-label={previewLabel}
        className="group/pdf inline-flex size-8 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpenPdf(record)}
        title={previewLabel}
        type="button"
      >
        <ResumeDocumentFileIcon
          className="size-8 transition-transform duration-200 group-hover/pdf:scale-105"
          kind={documentKind}
        />
      </button>
    );
  } else if (hasStoredResume) {
    documentIcon = (
      <UnsupportedResumeDocumentPreviewTooltip>
        <span
          aria-disabled="true"
          aria-label="该格式不支持预览"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md opacity-45 grayscale"
        >
          <ResumeDocumentFileIcon className="size-8" kind={documentKind} />
        </span>
      </UnsupportedResumeDocumentPreviewTooltip>
    );
  }

  return (
    <Card className="w-full rounded-md">
      <CardHeader className="flex flex-row items-center gap-2 p-3 pb-0">
        {documentIcon}
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm leading-5">
            <button
              className="line-clamp-2 text-left underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground/60"
              onClick={() => onOpenDetail(record)}
              title="点击姓名查看详情"
              type="button"
            >
              {title}
            </button>
          </CardTitle>
          <p className="mt-0.5 truncate text-muted-foreground/70 text-[11px] leading-4">
            {formatResumeRecordDisplayId(record.id)}
          </p>
        </div>
        {record.sourceChannel === "referral" ? <Badge variant="secondary">内推</Badge> : null}
        {duplicateMatchBadge(record, () => onOpenDuplicateMatches(record))}
        {scope === "private" && canDelete ? (
          <Checkbox
            aria-label={`选择 ${title}`}
            checked={selected}
            disabled={selectionDisabled}
            onCheckedChange={(checked) => onSelectionChange(record, checked === true)}
          />
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-3 text-xs">
        <div className="flex flex-col gap-0.5 text-muted-foreground">
          <div className="flex min-h-7 min-w-0 items-center gap-1.5">
            <IconBriefcase2 aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="shrink-0 text-muted-foreground/70">目标岗位：</span>
            <span className="truncate text-foreground/80">{record.targetRole || "未填写"}</span>
            <span aria-hidden="true" className="text-muted-foreground/50">
              ·
            </span>
            <span className="shrink-0 text-muted-foreground/70">工作年限：</span>
            <span className="shrink-0 text-foreground/80">
              {record.workYears === null ? "未填写" : `${record.workYears} 年`}
            </span>
          </div>
          <div className="flex min-h-7 min-w-0 items-center gap-1.5">
            <IconLink aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="shrink-0 text-muted-foreground/70">绑定岗位：</span>
            {(() => {
              if (record.jobDescriptionName) {
                return (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Link
                      className="truncate text-foreground/80 underline decoration-muted-foreground/20 underline-offset-4 hover:decoration-muted-foreground/60"
                      onClick={(event) => event.stopPropagation()}
                      params={{ slug }}
                      search={{ jobDescriptionId: record.jobDescriptionId ?? undefined }}
                      title={record.jobDescriptionName}
                      to="/w/$slug/studio/job-descriptions"
                    >
                      {record.jobDescriptionName}
                    </Link>
                    <JobBindingModeBadge mode={record.jobBindingMode} />
                    {canRecommend ? (
                      <Button
                        aria-label="更换绑定岗位"
                        className="h-5 shrink-0 px-1.5 text-xs"
                        onClick={() => onRecommend(record)}
                        size="xs"
                        variant="outline"
                      >
                        更换
                      </Button>
                    ) : null}
                  </span>
                );
              }
              if (record.jobDescriptionId) {
                return (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-muted-foreground/60">已绑定</span>
                    <JobBindingModeBadge mode={record.jobBindingMode} />
                    {canRecommend ? (
                      <Button
                        aria-label="更换绑定岗位"
                        className="h-5 shrink-0 px-1.5 text-xs"
                        onClick={() => onRecommend(record)}
                        size="xs"
                        variant="outline"
                      >
                        更换
                      </Button>
                    ) : null}
                  </span>
                );
              }
              return (
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-muted-foreground/60">未关联</span>
                  {canRecommend ? (
                    <Button
                      aria-label="推荐岗位"
                      className="h-5 shrink-0 px-1.5 text-xs"
                      onClick={() => onRecommend(record)}
                      size="xs"
                    >
                      推荐岗位
                    </Button>
                  ) : null}
                </span>
              );
            })()}
          </div>
          <div className="flex min-h-7 items-center">
            <ResumePoolCardUploaderMeta record={record} />
          </div>
        </div>

        <ResumePoolCardHighlights record={record} />

        {skills.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {skills.map((skill) => (
              <Badge className="max-w-full truncate" key={skill} variant="outline">
                {skill}
              </Badge>
            ))}
            {skillsOverflow > 0 ? (
              <Badge title={`还有 ${skillsOverflow} 项技能未展示`} variant="outline">
                +{skillsOverflow}
              </Badge>
            ) : null}
          </div>
        ) : null}

        {note ? <p className="line-clamp-3 text-muted-foreground leading-5">{note}</p> : null}
      </CardContent>
      <ResumePoolCardActions
        canDelete={canDelete}
        canImport={canImport}
        canPublish={canPublish}
        canRetryParse={canRetryParse}
        deleting={deleting}
        importActionState={importActionState}
        onDelete={onDelete}
        onImport={onImport}
        onPublish={onPublish}
        onRetryParse={onRetryParse}
        publishing={publishing}
        retrying={retrying}
        record={record}
        scope={scope}
      />
    </Card>
  );
}
