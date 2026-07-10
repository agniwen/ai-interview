"use client";

import type { TablerIcon } from "@tabler/icons-react";
import {
  IconBriefcase2,
  IconBuilding,
  IconDatabase,
  IconGitBranch,
  IconLoader2,
  IconSchool,
  IconSend,
  IconTrash,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type { ResumePoolScope } from "@arc/db-schema/schema";
import type { ResumePoolDetail, ResumePoolListRecord } from "@arc/shared/resume-pool";

import type { ReactNode } from "react";
import { MemberCell } from "@/components/data-grid/cells/member-cell";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { fetchResumePoolItem } from "@/lib/client/api";

import {
  duplicateMatchBadge,
  getCandidateDisplayTitle,
  getCandidateTitleWithId,
  getResumePoolImportActionState,
  resumeParseStatusBadge,
  sourceActorLabel,
  sourceLabel,
  uploaderOrganizationLabel,
  uploaderUserLabel,
} from "./resume-pool-page-model";

const RESUME_POOL_CARD_SKILL_LIMIT = 18;

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

function DetailSummaryItem({ children, label }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 min-w-0 break-words font-medium text-sm leading-6">{children}</dd>
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
  resumeProfile,
}: {
  detail: ResumePoolDetailLike;
  isError: boolean;
  isLoading: boolean;
  onOpenDuplicateMatches?: () => void;
  resumeProfile: ResumePoolProfile;
}) {
  const skills = resumeProfile?.skills.slice(0, 8) ?? detail.skillsNormalized.slice(0, 8);
  const strengths = resumeProfile?.personalStrengths.slice(0, 3) ?? [];
  const note = detail.notes?.trim();

  return (
    <section className="space-y-6 rounded-2xl bg-muted/20 ">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-sm">候选人摘要</h3>
            {resumeParseStatusBadge(detail)}
            {duplicateMatchBadge(detail, onOpenDuplicateMatches)}
            {detail.importedResumeRecordId ? (
              <Badge variant="success">已入库</Badge>
            ) : (
              <Badge variant="secondary">未入库</Badge>
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
        <DetailSummaryItem label="来源">{sourceLabel(detail)}</DetailSummaryItem>
        <DetailSummaryItem label="上传组织">{uploaderOrganizationLabel(detail)}</DetailSummaryItem>
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
                  <li
                    className="rounded-full bg-background px-2.5 py-1 text-xs shadow-xs ring-1 ring-border/50"
                    key={skill}
                  >
                    {skill}
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
    <div className="rounded-md border-muted/60 border bg-muted/25 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-1 whitespace-pre-wrap break-words text-foreground leading-5">{value}</div>
    </div>
  );
}

export function ResumePoolCardHighlights({ record }: { record: ResumePoolListRecord }) {
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
            <ResumeEducationDisplayLine item={item} />
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
      value: profileHighlights.latestCompany ?? "",
      visible: Boolean(profileHighlights.latestCompany),
    },
    {
      icon: IconGitBranch,
      label: "最近项目",
      value: profileHighlights.latestProject ?? "",
      visible: Boolean(profileHighlights.latestProject),
    },
  ].filter((item) => item.visible);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5 border-border/70 border-t pt-3 text-xs">
      {rows.map((row) => (
        <ResumePoolHighlightRow
          icon={row.icon}
          key={row.label}
          label={row.label}
          value={row.value}
        />
      ))}
    </div>
  );
}

export function ResumePoolCardUploaderMeta({ record }: { record: ResumePoolListRecord }) {
  const actorLabel = sourceActorLabel(record);
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
      <div className="flex min-w-0 items-center gap-1.5">
        <IconBuilding className="size-3.5 shrink-0" />
        <span className="truncate">{uploaderOrganizationLabel(record)}</span>
      </div>
      <span className="shrink-0">{actorLabel}</span>
      <MemberCell
        avatarClassName="size-4"
        avatarFallbackClassName="text-[8px]"
        avatarSize="default"
        className="min-w-0 gap-1"
        email={record.uploaderEmail}
        emailClassName="hidden"
        image={record.uploaderImage}
        name={record.uploaderName}
        nameClassName="font-normal text-muted-foreground text-xs leading-none"
        placeholder="未知上传人"
      />
    </div>
  );
}

export function ResumePoolDetailDialog({
  onOpenDuplicateMatches,
  onOpenChange,
  record,
  slug,
}: {
  record: ResumePoolListRecord | null;
  slug: string;
  onOpenChange: (open: boolean) => void;
  onOpenDuplicateMatches?: (record: ResumePoolListRecord) => void;
}) {
  const itemId = record?.id ?? "";
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
  const resumeProfile = detailQuery.data?.resumeProfile ?? null;

  return (
    <Modal
      description={record?.resumeFileName ?? undefined}
      onOpenChange={onOpenChange}
      open={record !== null}
      size="2xl"
      title={record ? getCandidateTitleWithId(record) : "候选人详情"}
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
            resumeProfile={resumeProfile}
          />
          <ResumePoolStructuredInfoPanel
            detail={detail}
            isLoading={detailQuery.isLoading}
            resumeProfile={resumeProfile}
          />
        </div>
      ) : null}
    </Modal>
  );
}

export function ResumePoolCardActions({
  canDelete,
  canImport,
  canPublish,
  deleting,
  importActionState,
  onDelete,
  onImport,
  onPublish,
  publishing,
  record,
  scope,
}: {
  canDelete: boolean;
  canImport: boolean;
  canPublish: boolean;
  deleting: boolean;
  importActionState: ReturnType<typeof getResumePoolImportActionState>;
  publishing: boolean;
  record: ResumePoolListRecord;
  scope: ResumePoolScope;
  onDelete: (record: ResumePoolListRecord) => void;
  onImport: (record: ResumePoolListRecord) => void;
  onPublish: (record: ResumePoolListRecord) => void;
}) {
  const showPublishAction = scope === "private" && canPublish;
  if (!canImport && !showPublishAction && !canDelete) {
    return null;
  }

  return (
    <CardFooter className="flex items-center gap-2 px-3">
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
            <IconDatabase className="size-4" />
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
  deleting,
  onDelete,
  onOpenDuplicateMatches,
  onOpenDetail,
  onOpenPdf,
  onImport,
  onPublish,
  onSelectionChange,
  publishing,
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
  publishing: boolean;
  deleting: boolean;
  selected: boolean;
  selectionDisabled: boolean;
  onOpenDetail: (record: ResumePoolListRecord) => void;
  onOpenDuplicateMatches: (record: ResumePoolListRecord) => void;
  onOpenPdf: (record: ResumePoolListRecord) => void;
  onImport: (record: ResumePoolListRecord) => void;
  onPublish: (record: ResumePoolListRecord) => void;
  onDelete: (record: ResumePoolListRecord) => void;
  onSelectionChange: (record: ResumePoolListRecord, selected: boolean) => void;
}) {
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
    <Card className="w-full gap-3 rounded-md py-3">
      <CardHeader className="flex flex-row items-center gap-2 px-3">
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
      <CardContent className="flex flex-col gap-3 px-3 text-xs">
        <div className="flex flex-col gap-1.5 text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5">
            <IconBriefcase2 className="size-3.5 shrink-0" />
            <span className="truncate">{record.targetRole || "未填写目标岗位"}</span>
          </div>
          <ResumePoolCardUploaderMeta record={record} />
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
        deleting={deleting}
        importActionState={importActionState}
        onDelete={onDelete}
        onImport={onImport}
        onPublish={onPublish}
        publishing={publishing}
        record={record}
        scope={scope}
      />
    </Card>
  );
}
