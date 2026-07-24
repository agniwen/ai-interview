"use client";

/**
 * 简历疑似重复风险提示 overlay / 详情弹窗。
 * Resume duplicate-risk overlay and the "view suspected duplicates" dialog.
 *
 * - ResumeDuplicateMatchesDialog: 招聘台 / 人才库点击「疑似重复」后打开，
 *   左侧当前候选人，右侧疑似列表；优先 PC 对照阅读。
 * - ResumeDedupOverlay: 上传解析后命中查重时的决策面板。
 */

import { IconAlertTriangle, IconLoader2 } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import type { DedupMatchRecord, DedupSourceCandidate } from "@/lib/client/api";
import { formatDate } from "@arc/shared/utils/time";
import { cn } from "@arc/shared/utils";
import { StudioPersonDetailDialog } from "@/components/features/studio/studio-person-detail-dialog";
import { ResumeProfileSnapshotView } from "@/components/features/resume/resume-profile-snapshot";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import { EmptyValue } from "@/components/features/display/empty-value";
import { formatResumeCandidateTitle } from "@/components/features/resume/resume-record-display-id";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { fetchResumePoolItem } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

const LEVEL_META: Record<
  NonNullable<DedupMatchRecord["level"]>,
  { label: string; tone: string }
> = {
  high: { label: "高度疑似", tone: "border-red-200 bg-red-50 text-red-700" },
  low: { label: "低风险", tone: "border-slate-200 bg-slate-50 text-slate-700" },
  medium: { label: "可能重复", tone: "border-amber-200 bg-amber-50 text-amber-700" },
};

const SKILLS_PREVIEW_LIMIT = 8;

function formatCreatedAt(value: string) {
  return formatDate(value);
}

function formatSimilarity(value: number | undefined): string | null {
  if (typeof value !== "number") {
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
}: {
  email: string | null | undefined;
  phone: string | null | undefined;
  createdAt?: string | null;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <FieldLine label="邮箱" value={textOrNull(email) ?? <EmptyValue />} />
      <FieldLine label="手机" value={textOrNull(phone) ?? <EmptyValue />} />
      {createdAt ? <FieldLine label="创建" value={formatCreatedAt(createdAt)} /> : null}
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
        <Avatar className="size-4 shrink-0">
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
      <ContactFields createdAt={createdAt} email={email} phone={phone} />
      <ResumeProfileSnapshotView showLabels snapshot={snapshot} />
      <SkillsLine skills={skills} />
      {footer}
    </div>
  );
}

function ResumePoolMatchDetailDialog({
  onOpenChange,
  open,
  recordId,
}: {
  open: boolean;
  recordId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const slug = useWorkspaceSlug();
  const detailQuery = useQuery({
    enabled: open && Boolean(recordId),
    queryFn: () => (recordId ? fetchResumePoolItem(slug, recordId) : null),
    queryKey: ["resume-pool", "dedup-match-detail", slug, recordId],
  });
  const detail = detailQuery.data ?? null;
  let content: ReactNode = <p className="text-muted-foreground text-sm">未找到这份私有简历。</p>;
  if (detailQuery.isLoading) {
    content = (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <IconLoader2 className="size-4 animate-spin" />
        正在加载简历详情
      </div>
    );
  } else if (detail) {
    content = (
      <div className="space-y-5">
        <div className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">目标岗位</span>
            <p className="mt-1 font-medium">{detail.targetRole ?? <EmptyValue />}</p>
          </div>
          <div>
            <span className="text-muted-foreground">邮箱</span>
            <p className="mt-1 break-all font-medium">{detail.candidateEmail ?? <EmptyValue />}</p>
          </div>
          <div>
            <span className="text-muted-foreground">电话</span>
            <p className="mt-1 break-all font-medium">{detail.candidatePhone ?? <EmptyValue />}</p>
          </div>
          <div>
            <span className="text-muted-foreground">状态</span>
            <p className="mt-1 font-medium">{detail.status === "active" ? "有效" : "已归档"}</p>
          </div>
        </div>
        <ResumeProfileView profile={detail.resumeProfile ?? null} />
      </div>
    );
  }

  return (
    <Modal
      description={detail?.resumeFileName ?? undefined}
      onOpenChange={onOpenChange}
      open={open}
      size="2xl"
      title={detail ? formatResumeCandidateTitle(detail.candidateName, detail.id) : "私有简历详情"}
    >
      {content}
    </Modal>
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
  match,
  onOpenDetail,
}: {
  match: DedupMatchRecord;
  onOpenDetail: (match: DedupMatchRecord) => void;
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
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 font-medium text-[11px] leading-4",
                  LEVEL_META[match.level].tone,
                )}
              >
                {LEVEL_META[match.level].label}
                {typeof match.score === "number" ? ` ${match.score}%` : ""}
              </span>
            ) : null}
            <span className="text-muted-foreground text-[11px]">
              {sourceTypeLabel(match)} · {statusLabel}
            </span>
          </div>
        </div>
        <Button
          className="shrink-0"
          onClick={() => onOpenDetail(match)}
          size="sm"
          type="button"
          variant="ghost"
        >
          查看
        </Button>
      </div>

      <div className="mt-2 min-w-0">
        <CandidateBody
          createdAt={match.createdAt}
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
}: {
  matches: DedupMatchRecord[];
  className?: string;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const [poolDetailOpen, setPoolDetailOpen] = useState(false);
  const [poolDetailRecordId, setPoolDetailRecordId] = useState<string | null>(null);

  function openDetail(match: DedupMatchRecord) {
    if (match.sourceType === "resume_pool_item") {
      setPoolDetailRecordId(match.id);
      setPoolDetailOpen(true);
      return;
    }
    setDetailRecordId(match.id);
    setDetailOpen(true);
  }

  return (
    <>
      <div className={cn("min-h-0 divide-y overflow-y-auto", className)}>
        {matches.map((match) => (
          <MatchCandidateRow key={match.id} match={match} onOpenDetail={openDetail} />
        ))}
      </div>

      <StudioPersonDetailDialog
        mode="resume"
        onOpenChange={setDetailOpen}
        open={detailOpen}
        recordId={detailRecordId}
      />
      <ResumePoolMatchDetailDialog
        onOpenChange={(open) => {
          setPoolDetailOpen(open);
          if (!open) {
            setPoolDetailRecordId(null);
          }
        }}
        open={poolDetailOpen}
        recordId={poolDetailRecordId}
      />
    </>
  );
}

export function ResumeDuplicateMatchesDialog({
  isError = false,
  isLoading = false,
  matches,
  onOpenChange,
  open,
  source = null,
  title = "疑似重复简历",
}: {
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
            <ResumeDedupMatchList className="min-h-0 flex-1" matches={matches} />
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

interface ResumeDedupOverlayProps {
  matches: DedupMatchRecord[];
  onContinue: () => void;
  onCancel: () => void;
}

export function ResumeDedupOverlay({ matches, onContinue, onCancel }: ResumeDedupOverlayProps) {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        <IconAlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium text-sm">检测到 {matches.length} 条疑似重复的候选人记录</p>
          <p className="text-xs leading-normal opacity-80">
            系统会基于工作经历、项目经历、技能和岗位画像的语义相似度判断风险。
            请根据判断依据确认是否为同一候选人，再决定查看已有记录或继续创建。
          </p>
        </div>
      </div>

      <ResumeDedupMatchList className="max-h-[min(52vh,520px)]" matches={matches} />

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          取消上传
        </Button>
        <Button onClick={onContinue} type="button">
          仍然继续
        </Button>
      </div>
    </div>
  );
}
