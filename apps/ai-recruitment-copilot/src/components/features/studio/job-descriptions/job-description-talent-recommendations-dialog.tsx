"use client";

import type {
  JobDescriptionListRecord,
  JobDescriptionTalentRecommendation,
  JobDescriptionTalentRecommendationResult,
} from "@arc/shared/job-descriptions";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { StudioPersonDetailDialog } from "@/components/features/studio/studio-person-detail-dialog";
import {
  BriefcaseBusinessIcon,
  Building2Icon,
  FileSearchIcon,
  FolderGit2Icon,
  GraduationCapIcon,
  UserCheckIcon,
} from "@/components/icons/hugeicons";
import { ResumeEducationDisplayLine } from "@/components/features/resume/resume-education-line";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

interface TalentRecommendationsDialogProps {
  jobDescription: Pick<JobDescriptionListRecord, "id" | "name"> | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const EMPTY_RESULT: JobDescriptionTalentRecommendationResult = {
  candidates: [],
  diagnostics: { vectorHitCount: 0 },
  jobDescription: { id: "", name: "" },
  status: "ready",
};

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number") {
    return "—";
  }
  return `${Math.round(value * 100)}%`;
}

function notesPreview(value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length > 120 ? `${trimmed.slice(0, 119)}…` : trimmed;
}

function formatCandidateTitle(candidate: JobDescriptionTalentRecommendation) {
  const candidateName = candidate.candidateName || "未命名候选人";
  const targetRole = candidate.targetRole?.trim();
  if (candidate.resumeParseStatus !== "ready" || !targetRole) {
    return candidateName;
  }
  if (candidate.workYears !== null) {
    return `${targetRole}-${candidate.workYears}年-${candidateName}`;
  }
  return `${targetRole}-${candidateName}`;
}

function CandidateHighlight({
  children,
  icon: Icon,
  label,
}: {
  children: React.ReactNode;
  icon: typeof BriefcaseBusinessIcon;
  label: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-muted/60 bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-1 line-clamp-2 break-words text-foreground text-xs leading-5">
        {children}
      </div>
    </div>
  );
}

function CandidateEducationHighlight({
  candidate,
}: {
  candidate: JobDescriptionTalentRecommendation;
}) {
  const { educationItems, educationLines, schools } = candidate.profileHighlights;
  const fallback = educationLines.length > 0 ? educationLines : schools;
  if (educationItems.length === 0 && fallback.length === 0) {
    return null;
  }
  return (
    <CandidateHighlight icon={GraduationCapIcon} label="教育经历">
      {educationItems.length > 0 ? (
        <span className="block truncate">
          <ResumeEducationDisplayLine item={educationItems[0]} />
        </span>
      ) : (
        fallback.join(" / ")
      )}
    </CandidateHighlight>
  );
}

function CandidateRecommendationCard({
  candidate,
  onView,
}: {
  candidate: JobDescriptionTalentRecommendation;
  onView: (id: string) => void;
}) {
  const title = formatCandidateTitle(candidate);
  const note = notesPreview(candidate.notes);
  const skills = candidate.masteredSkills.slice(0, 8);
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <button
                className="line-clamp-2 text-left font-medium underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground/60"
                onClick={() => onView(candidate.id)}
                title="点击姓名查看详情"
                type="button"
              >
                {title}
              </button>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-muted-foreground text-xs">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <BriefcaseBusinessIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{candidate.targetRole || "未填写目标岗位"}</span>
                </span>
                {candidate.currentJobDescriptionName ? (
                  <Badge variant="outline">当前：{candidate.currentJobDescriptionName}</Badge>
                ) : (
                  <Badge variant="outline">未关联岗位</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <CandidateEducationHighlight candidate={candidate} />
            {candidate.profileHighlights.latestCompany ? (
              <CandidateHighlight icon={Building2Icon} label="最近公司">
                {candidate.profileHighlights.latestCompany}
              </CandidateHighlight>
            ) : null}
            {candidate.profileHighlights.latestProject ? (
              <CandidateHighlight icon={FolderGit2Icon} label="最近项目">
                {candidate.profileHighlights.latestProject}
              </CandidateHighlight>
            ) : null}
          </div>

          {skills.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {skills.map((skill) => (
                <Badge className="max-w-full truncate" key={skill} variant="outline">
                  {skill}
                </Badge>
              ))}
            </div>
          ) : null}

          {note ? (
            <p className="line-clamp-2 text-muted-foreground text-xs leading-5">{note}</p>
          ) : null}
        </div>

        <div className="flex flex-col justify-between gap-4 rounded-md border border-muted/60 bg-muted/20 p-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">推荐分</span>
              <span className="font-medium">{candidate.score}</span>
            </div>
            <Progress value={candidate.score} />
            <div className="mt-3 grid gap-1.5 text-muted-foreground text-xs">
              <span>技能画像 {formatPercent(candidate.similarity.skillRole)}</span>
              <span>项目职责 {formatPercent(candidate.similarity.workProject)}</span>
              <span>整体画像 {formatPercent(candidate.similarity.resumeOverview)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {candidate.reasons.map((reason) => (
                <Badge key={reason} variant="secondary">
                  {reason}
                </Badge>
              ))}
            </div>
            <Button
              className="w-full"
              onClick={() => onView(candidate.id)}
              size="sm"
              type="button"
              variant="outline"
            >
              查看简历
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecommendationsSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((item) => (
        <div className="rounded-lg border border-border p-4" key={item}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-8 w-28" />
          </div>
          <Skeleton className="mt-4 h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

export function JobDescriptionTalentRecommendationsDialog({
  jobDescription,
  onOpenChange,
  open,
}: TalentRecommendationsDialogProps) {
  const slug = useWorkspaceSlug();
  const navigate = useNavigate();
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);

  const recommendationsQuery = useQuery({
    enabled: open && jobDescription !== null,
    queryFn: async (): Promise<JobDescriptionTalentRecommendationResult> => {
      if (!jobDescription) {
        return EMPTY_RESULT;
      }
      return await rpcFetch<JobDescriptionTalentRecommendationResult>(
        rpc.api.w[":slug"].studio["job-descriptions"][":id"].recommendations.$post({
          json: {
            excludeAlreadyLinked: true,
            limit: 20,
          },
          param: { id: jobDescription.id, slug },
        }),
        "加载人才推荐失败",
      );
    },
    queryKey: ["job-description-recommendations", slug, jobDescription?.id ?? null] as const,
    staleTime: 60 * 1000,
  });

  const data = recommendationsQuery.data ?? EMPTY_RESULT;
  const isInitialLoading = recommendationsQuery.isFetching && !recommendationsQuery.data;

  return (
    <>
      <Modal
        bodyClassName="px-6 py-5"
        description="基于岗位 JD 与已索引简历的语义相似度生成。"
        onOpenChange={onOpenChange}
        open={open}
        size="2xl"
        title={jobDescription ? `岗位「${jobDescription.name}」的人才推荐` : "人才推荐"}
      >
        {isInitialLoading ? <RecommendationsSkeleton /> : null}

        {!isInitialLoading && recommendationsQuery.isError ? (
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileSearchIcon className="size-5" />
              </EmptyMedia>
              <EmptyTitle>推荐失败</EmptyTitle>
              <EmptyDescription>请稍后重试。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {!isInitialLoading && !recommendationsQuery.isError && data.status === "disabled" ? (
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileSearchIcon className="size-5" />
              </EmptyMedia>
              <EmptyTitle>语义推荐未启用</EmptyTitle>
              <EmptyDescription>需要完成 embedding 与 Qdrant 配置后才能生成推荐。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {!isInitialLoading &&
        !recommendationsQuery.isError &&
        data.status === "ready" &&
        data.candidates.length === 0 ? (
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserCheckIcon className="size-5" />
              </EmptyMedia>
              <EmptyTitle>暂无推荐人才</EmptyTitle>
              <EmptyDescription>当前没有足够匹配的已索引简历。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {!isInitialLoading && data.status === "ready" && data.candidates.length > 0 ? (
          <div className="space-y-3">
            {data.candidates.map((candidate) => (
              <CandidateRecommendationCard
                candidate={candidate}
                key={candidate.id}
                onView={setDetailRecordId}
              />
            ))}
          </div>
        ) : null}
      </Modal>

      <StudioPersonDetailDialog
        mode="resume"
        onEdit={(id) => {
          setDetailRecordId(null);
          void navigate({
            params: { slug },
            search: { recordId: id },
            to: "/w/$slug/studio/resumes",
          });
        }}
        onOpenChange={(next) => {
          if (!next) {
            setDetailRecordId(null);
          }
        }}
        open={detailRecordId !== null}
        recordId={detailRecordId}
      />
    </>
  );
}
