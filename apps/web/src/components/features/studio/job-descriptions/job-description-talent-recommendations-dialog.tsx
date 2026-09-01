"use client";
import { recommendWorkspaceJobDescriptionCandidates } from "@/lib/client/backend-api";

import {
  IconBriefcase2,
  IconBuilding,
  IconFileSearch,
  IconGitBranch,
  IconSchool,
  IconUserCheck,
} from "@tabler/icons-react";
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
  ResumeDocumentFileIcon,
  getResumeDocumentFileIconKind,
} from "@/components/features/resume/resume-document-file-icon";

import { ResumeEducationDisplayLine } from "@/components/features/resume/resume-education-line";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
import { apiRequest } from "@/lib/client/api";

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
  if (value === undefined) {
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
  icon: typeof IconBriefcase2;
  label: string;
}) {
  return (
    <div className="min-w-0 rounded-md border-muted/60 border bg-muted/30 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-1 whitespace-pre-wrap wrap-break-word text-foreground leading-5">
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
    <CandidateHighlight icon={IconSchool} label="教育经历">
      {educationItems.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {educationItems.map((item) => (
            <li key={`${item.level ?? "education"}-${item.school}-${item.major ?? ""}`}>
              <ResumeEducationDisplayLine item={item} />
            </li>
          ))}
        </ul>
      ) : (
        fallback.join("\n")
      )}
    </CandidateHighlight>
  );
}

function CandidateRecommendationReasons({
  reasons,
}: {
  reasons: JobDescriptionTalentRecommendation["reasons"];
}) {
  return (
    <div className="min-w-0 rounded-md border-muted/60 border bg-background px-3 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <IconUserCheck className="size-3.5 shrink-0" />
        <span className="text-xs">推荐理由</span>
      </div>
      {reasons.length > 0 ? (
        <ul className="mt-2 flex min-w-0 flex-col gap-1.5 text-xs leading-5">
          {reasons.map((reason) => (
            <li className="flex min-w-0 gap-2" key={reason}>
              <span className="mt-2 size-1 shrink-0 rounded-full bg-primary/70" />
              <span className="min-w-0 wrap-break-word">{reason}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-muted-foreground text-xs leading-5">暂无明确推荐理由</p>
      )}
    </div>
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
  const documentKind = getResumeDocumentFileIconKind({ fileName: candidate.resumeFileName });
  return (
    <Card className="min-w-0 overflow-hidden rounded-md py-0">
      <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0">
          <CardHeader className="flex flex-row items-center gap-2 border-border/70 border-b px-3 py-3">
            <span
              aria-hidden="true"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md"
            >
              <ResumeDocumentFileIcon className="size-8" kind={documentKind} />
            </span>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-sm leading-5">
                <button
                  className="line-clamp-2 max-w-full wrap-break-word text-left font-medium underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground/60"
                  onClick={() => onView(candidate.id)}
                  title="点击姓名查看详情"
                  type="button"
                >
                  {title}
                </button>
              </CardTitle>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-3 px-0 py-3 text-xs">
            <div className="flex px-4 flex-col gap-1.5 text-muted-foreground">
              <div className="flex min-w-0 items-center gap-1.5">
                <IconBriefcase2 className="size-3.5 shrink-0" />
                <span className="truncate">{candidate.targetRole || "未填写目标岗位"}</span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <IconBuilding className="size-3.5 shrink-0" />
                <span className="truncate">
                  {candidate.currentJobDescriptionName
                    ? `当前：${candidate.currentJobDescriptionName}`
                    : "未关联岗位"}
                </span>
              </div>
            </div>

            <div className="flex px-3 flex-col gap-1.5 border-border/70 border-t pt-3">
              <CandidateEducationHighlight candidate={candidate} />
              {candidate.profileHighlights.latestCompany ? (
                <CandidateHighlight icon={IconBuilding} label="最近公司">
                  {candidate.profileHighlights.latestCompany}
                </CandidateHighlight>
              ) : null}
              {candidate.profileHighlights.latestProject ? (
                <CandidateHighlight icon={IconGitBranch} label="最近项目">
                  {candidate.profileHighlights.latestProject}
                </CandidateHighlight>
              ) : null}
            </div>

            {skills.length > 0 ? (
              <div className="flex px-3 flex-wrap gap-1">
                {skills.map((skill) => (
                  <Badge className="min-w-0 max-w-full truncate" key={skill} variant="outline">
                    {skill}
                  </Badge>
                ))}
              </div>
            ) : null}

            {note ? (
              <p className="line-clamp-3 px-3 wrap-break-word text-muted-foreground leading-5">
                {note}
              </p>
            ) : null}
          </CardContent>
        </div>

        <CardFooter className="flex min-w-0 flex-col items-stretch justify-between gap-4 border-muted/60 border-t bg-muted/20 px-3 py-3 lg:border-t-0 lg:border-l">
          <div className="min-w-0">
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

          <div className="flex min-w-0 flex-col gap-3">
            <CandidateRecommendationReasons reasons={candidate.reasons} />
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
        </CardFooter>
      </div>
    </Card>
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
      return await apiRequest(
        recommendWorkspaceJobDescriptionCandidates({
          body: { excludeAlreadyLinked: true, limit: 20 },
          path: { id: jobDescription.id, workspaceSlug: slug },
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
                <IconFileSearch className="size-5" />
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
                <IconFileSearch className="size-5" />
              </EmptyMedia>
              <EmptyTitle>人才推荐暂不可用</EmptyTitle>
              <EmptyDescription>请联系管理员检查推荐服务配置。</EmptyDescription>
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
                <IconUserCheck className="size-5" />
              </EmptyMedia>
              <EmptyTitle>暂无推荐人才</EmptyTitle>
              <EmptyDescription>当前没有足够匹配的简历。</EmptyDescription>
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
