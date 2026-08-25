"use client";
/**
 * 简历疑似重复风险提示 overlay / 详情弹窗。
 * Resume duplicate-risk overlay and the "view suspected duplicates" dialog.
 *
 * - ResumeDuplicateMatchesDialog: 招聘台 / 人才库点击「疑似重复」后打开，
 *   左侧当前候选人，右侧疑似列表；优先 PC 对照阅读。
 * - ResumeDedupOverlay: 上传解析后命中查重时的决策面板。
 */

import { IconLoader2 } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Suspense, lazy, useState } from "react";
import type { DedupMatchRecord, DedupSourceCandidate } from "@/lib/client/api";
import { formatDate } from "@arc/shared/utils/time";
import { cn } from "@arc/shared/utils";
import { ResumeProfileSnapshotView } from "@/components/features/resume/resume-profile-snapshot";
import { EmptyValue } from "@/components/features/display/empty-value";
import { formatResumeCandidateTitle } from "@/components/features/resume/resume-record-display-id";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import type { ResumeDedupCompareMode } from "./resume-dedup-compare-dialog";
import { getResumeComparisonDocumentKind } from "./resume-dedup-compare-model";
import { CreatedAtRelativeLabel } from "./resume-created-at-relative";

const ResumeDedupCompareDialog = lazy(async () => {
  const mod = await import("./resume-dedup-compare-dialog");
  return { default: mod.ResumeDedupCompareDialog };
});

interface ResumeDedupComparisonProps {
  match: DedupMatchRecord;
  mode: ResumeDedupCompareMode;
  onOpenChange: (open: boolean) => void;
  source: DedupSourceCandidate;
}

export interface ResumeDedupMatchListDependencies {
  renderComparison: (props: ResumeDedupComparisonProps) => ReactNode;
}

const defaultResumeDedupMatchListDependencies: ResumeDedupMatchListDependencies = {
  renderComparison: ({ match, mode, onOpenChange, source }) => (
    <Suspense fallback={null}>
      <ResumeDedupCompareDialog
        match={match}
        mode={mode}
        onOpenChange={onOpenChange}
        open
        source={source}
      />
    </Suspense>
  ),
};

const LEVEL_META = {
  high: { label: "相似度", variant: "danger" },
  low: { label: "相似度", variant: "secondary" },
  medium: { label: "相似度", variant: "warning" },
} satisfies Record<
  NonNullable<DedupMatchRecord["level"]>,
  { label: string; variant: "danger" | "secondary" | "warning" }
>;

const SKILLS_PREVIEW_LIMIT = 8;

function formatCreatedAt(value: string) {
  return formatDate(value);
}

function formatSimilarity(value: number | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  return `${Math.round(value * 100)}%`;
}

function similarityEvidence(match: DedupMatchRecord): { label: string; value: string }[] {
  return [
    { label: "工作/项目", value: formatSimilarity(match.similarity?.workProject) },
    { label: "整体画像", value: formatSimilarity(match.similarity?.resumeOverview) },
    { label: "技能岗位", value: formatSimilarity(match.similarity?.skillRole) },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));
}

function sourceTypeLabel(match: Pick<DedupMatchRecord, "sourceType">) {
  return match.sourceType === "resume_pool_item" ? "私有简历" : "招聘台";
}

function textOrNull(value: string | null | undefined) {
  const text = value?.trim();
  return text || null;
}

function MetaText({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p className={cn("min-w-0 text-muted-foreground text-xs leading-5", className)}>{children}</p>
  );
}

function FieldLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] gap-x-2 text-xs leading-5">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all text-foreground">{value}</span>
    </div>
  );
}

function RoleText({
  targetRole,
  jobDescriptionName,
}: {
  targetRole: string | null | undefined;
  jobDescriptionName: string | null | undefined;
}) {
  return (
    <MetaText>
      {textOrNull(targetRole) ?? "未填目标岗位"}
      {textOrNull(jobDescriptionName) ? ` · ${jobDescriptionName}` : ""}
    </MetaText>
  );
}

function SkillsLine({ skills }: { skills: string[] | null | undefined }) {
  if (!skills || skills.length === 0) {
    return null;
  }
  const visible = skills.slice(0, SKILLS_PREVIEW_LIMIT);
  const hiddenCount = skills.length - visible.length;
  return (
    <FieldLine
      label="技能"
      value={
        <span className="line-clamp-2">
          {visible.join("、")}
          {hiddenCount > 0 ? ` 等 ${skills.length} 项` : ""}
        </span>
      }
    />
  );
}

function ContactFields({
  email,
  phone,
  createdAt,
  createdAtReference,
}: {
  email: string | null | undefined;
  phone: string | null | undefined;
  createdAt?: string | null;
  createdAtReference?: string | null;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <FieldLine label="邮箱" value={textOrNull(email) ?? <EmptyValue />} />
      <FieldLine label="手机" value={textOrNull(phone) ?? <EmptyValue />} />
      {createdAt ? (
        <FieldLine
          label="创建"
          value={
            <>
              {formatCreatedAt(createdAt)}
              {createdAtReference ? (
                <CreatedAtRelativeLabel
                  createdAt={createdAt}
                  referenceCreatedAt={createdAtReference}
                />
              ) : null}
            </>
          }
        />
      ) : null}
    </div>
  );
}

function UploaderMeta({
  image,
  name,
}: {
  image: string | null | undefined;
  name: string | null | undefined;
}) {
  const displayName = textOrNull(name) ?? "未知上传人";
  return (
    <div className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] gap-x-2 text-xs leading-5">
      <span className="shrink-0 text-muted-foreground">上传人</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <Avatar
          className="size-4 shrink-0"
          generatedSize={16}
          label={`${displayName}的头像`}
          seed={`uploader:${displayName}`}
        >
          {image ? <AvatarImage alt={displayName} src={image} /> : null}
          <AvatarFallback className="text-[8px]">
            {textOrNull(name)?.charAt(0).toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 truncate text-foreground">{displayName}</span>
      </div>
    </div>
  );
}

function JudgmentLines({ match }: { match: DedupMatchRecord }) {
  const evidence = similarityEvidence(match);
  const reasons = match.semanticReasons ?? [];
  const conflicts = match.conflictingSignals ?? [];
  if (reasons.length === 0 && evidence.length === 0 && conflicts.length === 0) {
    return null;
  }

  const similarityText = evidence.map((item) => `${item.label} ${item.value}`).join(" · ");

  return (
    <div className="min-w-0 space-y-1 text-xs leading-5">
      {reasons.length > 0 ? (
        <FieldLine
          label="依据"
          value={<span className="line-clamp-2">{reasons.join("；")}</span>}
        />
      ) : null}
      {similarityText ? <FieldLine label="相似" value={similarityText} /> : null}
      {conflicts.length > 0 ? (
        <FieldLine
          label="差异"
          value={<span className="text-amber-800 dark:text-amber-200">{conflicts.join("、")}</span>}
        />
      ) : null}
    </div>
  );
}

function CandidateIdentity({
  name,
  id,
  trailing,
}: {
  name: string;
  id: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <h3 className="min-w-0 truncate font-medium text-sm leading-6">
        {formatResumeCandidateTitle(name, id)}
      </h3>
      {trailing}
    </div>
  );
}

function CandidateBody({
  targetRole,
  jobDescriptionName,
  email,
  phone,
  createdAt,
  createdAtReference,
  skills,
  snapshot,
  uploaderImage,
  uploaderName,
  footer,
}: {
  targetRole: string | null | undefined;
  jobDescriptionName: string | null | undefined;
  email: string | null | undefined;
  phone: string | null | undefined;
  createdAt?: string | null;
  createdAtReference?: string | null;
  skills: string[] | null | undefined;
  snapshot: DedupMatchRecord["resumeProfileSnapshot"];
  uploaderImage: string | null | undefined;
  uploaderName: string | null | undefined;
  footer?: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2.5">
      <RoleText jobDescriptionName={jobDescriptionName} targetRole={targetRole} />
      <UploaderMeta image={uploaderImage} name={uploaderName} />
      <ContactFields
        createdAt={createdAt}
        createdAtReference={createdAtReference}
        email={email}
        phone={phone}
      />
      <ResumeProfileSnapshotView showLabels snapshot={snapshot} />
      <SkillsLine skills={skills} />
      {footer}
    </div>
  );
}

function SourceCandidatePanel({ source }: { source: DedupSourceCandidate }) {
  return (
    <aside className="min-h-0 min-w-0 overflow-y-auto">
      <div className="mb-3 text-muted-foreground text-xs">当前候选人</div>
      <CandidateIdentity id={source.id} name={source.candidateName} />
      <div className="mt-2">
        <CandidateBody
          createdAt={source.createdAt}
          email={source.candidateEmail}
          jobDescriptionName={source.jobDescriptionName}
          phone={source.candidatePhone}
          skills={source.skills}
          snapshot={source.resumeProfileSnapshot}
          targetRole={source.targetRole}
          uploaderImage={source.uploaderImage}
          uploaderName={source.uploaderName}
        />
      </div>
    </aside>
  );
}

function MatchCandidateRow({
  canCompareDetail,
  canCompareResume,
  match,
  onOpenDetail,
  onOpenResume,
  sourceCreatedAt,
}: {
  canCompareDetail: boolean;
  canCompareResume: boolean;
  match: DedupMatchRecord;
  onOpenDetail: (match: DedupMatchRecord) => void;
  onOpenResume: (match: DedupMatchRecord) => void;
  sourceCreatedAt?: string | null;
}) {
  const statusLabel = match.status === "active" ? "有效" : "已归档";
  return (
    <div className="min-w-0 py-4 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h3 className="min-w-0 truncate font-medium text-sm leading-6">
              {formatResumeCandidateTitle(match.candidateName, match.id)}
            </h3>
            {match.level ? (
              <Badge variant={LEVEL_META[match.level].variant}>
                {LEVEL_META[match.level].label}
                {match.score === null || match.score === undefined ? "" : ` ${match.score}%`}
              </Badge>
            ) : null}
            {match.pipelineStatus ? (
              <Badge variant={match.pipelineStatus.tone}>{match.pipelineStatus.label}</Badge>
            ) : null}
            <span className="text-muted-foreground text-[11px]">
              {sourceTypeLabel(match)}
              {match.pipelineStatus ? "" : ` · ${statusLabel}`}
            </span>
          </div>
        </div>
        {canCompareDetail || canCompareResume ? (
          <div className="hidden shrink-0 items-center gap-1 lg:flex">
            {canCompareDetail ? (
              <Button onClick={() => onOpenDetail(match)} size="sm" type="button" variant="ghost">
                详情
              </Button>
            ) : null}
            {canCompareResume ? (
              <Button onClick={() => onOpenResume(match)} size="sm" type="button" variant="ghost">
                简历
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-2 min-w-0">
        <CandidateBody
          createdAt={match.createdAt}
          createdAtReference={sourceCreatedAt}
          email={match.candidateEmail}
          footer={<JudgmentLines match={match} />}
          jobDescriptionName={match.jobDescriptionName}
          phone={match.candidatePhone}
          skills={match.skills}
          snapshot={match.resumeProfileSnapshot}
          targetRole={match.targetRole}
          uploaderImage={match.uploaderImage}
          uploaderName={match.uploaderName}
        />
      </div>
    </div>
  );
}

export function ResumeDedupMatchList({
  matches,
  className,
  dependencies = defaultResumeDedupMatchListDependencies,
  source = null,
}: {
  matches: DedupMatchRecord[];
  className?: string;
  dependencies?: ResumeDedupMatchListDependencies;
  source?: DedupSourceCandidate | null;
}) {
  // 查重对照忽略 resumeLibrary/resumePool 读权限配置（产品决策）：
  // 只要来源记录与疑似记录在疑似列表中可见，就允许打开详情/简历对照。
  // Dedup comparison ignores resume read permission config — any match
  // visible in the list can be opened for detail/resume comparison.
  const [comparison, setComparison] = useState<{
    match: DedupMatchRecord;
    mode: ResumeDedupCompareMode;
  } | null>(null);

  function openComparison(match: DedupMatchRecord, mode: ResumeDedupCompareMode) {
    setComparison({ match, mode });
  }

  const currentDocumentKind = getResumeComparisonDocumentKind(source?.resumeFileName);

  return (
    <>
      <div className={cn("min-h-0 divide-y overflow-y-auto", className)}>
        {matches.map((match) => (
          <MatchCandidateRow
            canCompareDetail={Boolean(
              source && !(match.sourceType === "resume_pool_item" && match.status === "archived"),
            )}
            canCompareResume={Boolean(
              source &&
              currentDocumentKind &&
              getResumeComparisonDocumentKind(match.resumeFileName) &&
              !(match.sourceType === "resume_pool_item" && match.status === "archived"),
            )}
            key={match.id}
            match={match}
            onOpenDetail={(selectedMatch) => openComparison(selectedMatch, "detail")}
            onOpenResume={(selectedMatch) => openComparison(selectedMatch, "resume")}
            sourceCreatedAt={source?.createdAt ?? null}
          />
        ))}
      </div>

      {comparison && source
        ? dependencies.renderComparison({
            match: comparison.match,
            mode: comparison.mode,
            onOpenChange: (open) => {
              if (!open) {
                setComparison(null);
              }
            },
            source,
          })
        : null}
    </>
  );
}

export function ResumeDuplicateMatchesDialog({
  dependencies = defaultResumeDedupMatchListDependencies,
  isError = false,
  isLoading = false,
  matches,
  onOpenChange,
  open,
  source = null,
  title = "疑似重复简历",
}: {
  dependencies?: ResumeDedupMatchListDependencies;
  open: boolean;
  matches: DedupMatchRecord[];
  isLoading?: boolean;
  isError?: boolean;
  source?: DedupSourceCandidate | null;
  title?: string;
  onOpenChange: (open: boolean) => void;
}) {
  let content: ReactNode = <p className="text-muted-foreground text-sm">暂无疑似重复简历。</p>;

  if (isLoading) {
    content = (
      <div className="flex h-[min(68vh,720px)] items-center justify-center gap-2 text-muted-foreground text-sm">
        <IconLoader2 className="size-4 animate-spin" />
        正在加载疑似重复简历
      </div>
    );
  } else if (isError) {
    content = <p className="py-8 text-center text-destructive text-sm">疑似重复简历加载失败。</p>;
  } else if (matches.length > 0 || source) {
    content = (
      <div className={cn("flex h-[min(68vh,720px)] min-h-0", source ? "gap-0" : null)}>
        {source ? (
          <div className="hidden w-2/5 shrink-0 border-border/70 border-r pr-5 lg:block">
            <SourceCandidatePanel source={source} />
          </div>
        ) : null}

        <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", source ? "lg:pl-5" : null)}>
          {source ? (
            <div className="mb-3 border-border/70 border-b pb-3 lg:hidden">
              <SourceCandidatePanel source={source} />
            </div>
          ) : null}

          <div className="mb-2 shrink-0 text-muted-foreground text-xs">
            疑似记录
            <span className="ml-1.5 text-foreground">{matches.length}</span>
          </div>

          {matches.length > 0 ? (
            <ResumeDedupMatchList
              className="min-h-0 flex-1"
              dependencies={dependencies}
              matches={matches}
              source={source}
            />
          ) : (
            <p className="py-10 text-center text-muted-foreground text-sm">暂无疑似重复简历</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Modal
      bodyClassName="overflow-hidden"
      description="对照当前候选人与疑似记录的联系方式、履历与技能，结合判断依据确认是否为同一人。"
      onOpenChange={onOpenChange}
      open={open}
      size="full"
      title={title}
    >
      {content}
    </Modal>
  );
}
