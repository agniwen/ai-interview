"use client";

import { IconFileSearch, IconLoader2 } from "@tabler/icons-react";
import type {
  JobDescriptionListRecord,
  JobDescriptionRecommendation,
  JobDescriptionRecommendationResult,
} from "@arc/shared/job-descriptions";
import type {
  ResumePoolDetail,
  ResumePoolJobMatchCandidate,
  ResumePoolJobMatchResult,
} from "@arc/shared/resume-pool";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  bindResumePoolItem,
  fetchPublishedResumePoolJobDescriptions,
  fetchResumePoolJobMatch,
  fetchResumePoolJobRecommendations,
  isApiError,
} from "@/lib/client/api";

export const RESUME_POOL_JOB_RECOMMENDATION_LIMIT = 5;

function RecommendationsSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((item) => (
        <div className="rounded-lg border border-border p-4" key={item}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-8 w-16" />
          </div>
          <Skeleton className="mt-4 h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

function JobDescriptionRecommendationCard({
  disabled,
  matching,
  onMatch,
  recommendation,
}: {
  disabled: boolean;
  matching: boolean;
  onMatch: (jobDescriptionId: string) => void;
  recommendation: JobDescriptionRecommendation;
}) {
  return (
    <Card className="min-w-0 overflow-hidden rounded-md py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-border/70 border-b px-3 py-3">
        <div className="min-w-0">
          <CardTitle className="truncate text-sm leading-5">{recommendation.name}</CardTitle>
          {recommendation.departmentName ? (
            <p className="mt-1 truncate text-muted-foreground text-xs">
              {recommendation.departmentName}
            </p>
          ) : null}
        </div>
        <Badge variant="outline">{recommendation.score}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-3 py-3 text-xs">
        <Progress value={recommendation.score} />
        {recommendation.description ? (
          <p className="line-clamp-3 wrap-break-word text-muted-foreground leading-5">
            {recommendation.description}
          </p>
        ) : null}
        {recommendation.reasons.length > 0 ? (
          <ul className="flex flex-col gap-1.5 leading-5">
            {recommendation.reasons.map((reason) => (
              <li className="flex min-w-0 gap-2" key={reason}>
                <span className="mt-2 size-1 shrink-0 rounded-full bg-primary/70" />
                <span className="min-w-0 wrap-break-word">{reason}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">暂无明确推荐理由</p>
        )}
      </CardContent>
      <CardFooter className="border-muted/60 border-t px-3 py-3">
        <Button
          className="w-full"
          disabled={disabled}
          onClick={() => onMatch(recommendation.id)}
          size="sm"
          type="button"
          variant="outline"
        >
          {matching ? <IconLoader2 className="size-4 animate-spin" /> : null}
          匹配到此岗位
        </Button>
      </CardFooter>
    </Card>
  );
}

function PersistedJobMatchCandidateCard({
  candidate,
  disabled,
  matching,
  onMatch,
}: {
  candidate: ResumePoolJobMatchCandidate;
  disabled: boolean;
  matching: boolean;
  onMatch: (jobDescriptionId: string) => void;
}) {
  let actionLabel = "岗位已停止招聘";
  if (candidate.isCurrent) {
    actionLabel = "当前关联岗位";
  } else if (candidate.available) {
    actionLabel = "改绑到此岗位";
  }
  return (
    <Card className="min-w-0 overflow-hidden rounded-md py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-border/70 border-b px-3 py-3">
        <div className="min-w-0">
          <CardTitle className="truncate text-sm leading-5">{candidate.name}</CardTitle>
          {candidate.departmentName ? (
            <p className="mt-1 truncate text-muted-foreground text-xs">
              {candidate.departmentName}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {candidate.aiRank ? <Badge variant="outline">AI #{candidate.aiRank}</Badge> : null}
          {candidate.aiScore === null ? null : (
            <Badge variant="secondary">AI 分 {candidate.aiScore}</Badge>
          )}
          {candidate.vectorScore === null ? null : (
            <Badge variant="outline">向量分 {candidate.vectorScore}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-3 py-3 text-xs">
        <p className="wrap-break-word text-muted-foreground leading-5">
          {candidate.aiReason ?? "该岗位由明确投递线索或向量排序选出。"}
        </p>
      </CardContent>
      <CardFooter className="border-muted/60 border-t px-3 py-3">
        <Button
          className="w-full"
          disabled={disabled || candidate.isCurrent || !candidate.available}
          onClick={() => onMatch(candidate.id)}
          size="sm"
          type="button"
          variant={candidate.isCurrent ? "secondary" : "outline"}
        >
          {matching ? <IconLoader2 className="size-4 animate-spin" /> : null}
          {actionLabel}
        </Button>
      </CardFooter>
    </Card>
  );
}

function PublishedJobCard({
  actionLabel,
  disabled,
  jobDescription,
  matching,
  onMatch,
}: {
  actionLabel: string;
  disabled: boolean;
  jobDescription: JobDescriptionListRecord;
  matching: boolean;
  onMatch: (jobDescriptionId: string) => void;
}) {
  return (
    <Card className="min-w-0 overflow-hidden rounded-md py-0">
      <CardHeader className="border-border/70 border-b px-3 py-3">
        <CardTitle className="truncate text-sm leading-5">{jobDescription.name}</CardTitle>
        {jobDescription.departmentName ? (
          <p className="truncate text-muted-foreground text-xs">{jobDescription.departmentName}</p>
        ) : null}
      </CardHeader>
      <CardFooter className="px-3 py-3">
        <Button
          className="w-full"
          disabled={disabled}
          onClick={() => onMatch(jobDescription.id)}
          size="sm"
          type="button"
          variant="outline"
        >
          {matching ? <IconLoader2 className="size-4 animate-spin" /> : null}
          {actionLabel}
        </Button>
      </CardFooter>
    </Card>
  );
}

export interface ResumePoolRecommendationsDependencies {
  bindResumePoolItem: typeof bindResumePoolItem;
  fetchMatchResult: (
    slug: string,
    resumePoolItemId: string,
  ) => Promise<ResumePoolJobMatchResult | null>;
  fetchPublishedJobs: (slug: string) => Promise<JobDescriptionListRecord[]>;
  fetchRecommendations: (
    slug: string,
    resumePoolItemId: string,
  ) => Promise<JobDescriptionRecommendationResult>;
  isConflictError: (error: Error) => boolean;
  notifyError: (message: string) => void;
}

const defaultDependencies: ResumePoolRecommendationsDependencies = {
  bindResumePoolItem,
  fetchMatchResult: fetchResumePoolJobMatch,
  fetchPublishedJobs: fetchPublishedResumePoolJobDescriptions,
  fetchRecommendations: (slug, resumePoolItemId) =>
    fetchResumePoolJobRecommendations(slug, resumePoolItemId, RESUME_POOL_JOB_RECOMMENDATION_LIMIT),
  isConflictError: (error) => isApiError(error) && error.status === 409,
  notifyError: (message) => toast.error(message),
};

/* oxlint-disable complexity -- this panel coordinates dependent persisted-match, published-job fallback, recommendation, and bind states. */
export function ResumePoolRecommendationsPanel({
  detail,
  dependencies = defaultDependencies,
  onBound,
  slug,
}: {
  detail: ResumePoolDetail;
  dependencies?: ResumePoolRecommendationsDependencies;
  onBound?: () => void;
  slug: string;
}) {
  const bound = Boolean(detail.jobDescriptionId);
  const queryClient = useQueryClient();
  const matchQuery = useQuery({
    queryFn: () => dependencies.fetchMatchResult(slug, detail.id),
    queryKey: ["resume-pool", "job-match", slug, detail.id] as const,
    staleTime: 60 * 1000,
  });
  const query = useQuery({
    enabled: matchQuery.isSuccess && !matchQuery.data && !bound,
    queryFn: () => dependencies.fetchRecommendations(slug, detail.id),
    queryKey: ["resume-pool", "jd-recommendations", slug, detail.id] as const,
    staleTime: 60 * 1000,
  });
  const hasPersistedAlternative = Boolean(
    matchQuery.data?.candidates.some((candidate) => candidate.available && !candidate.isCurrent),
  );
  const hasAvailablePersistedCandidate = Boolean(
    matchQuery.data?.candidates.some((candidate) => candidate.available),
  );
  const needsPublishedJobFallback =
    matchQuery.isSuccess &&
    (bound
      ? !matchQuery.data || !hasPersistedAlternative
      : Boolean(matchQuery.data && !hasAvailablePersistedCandidate));
  const publishedJobsQuery = useQuery({
    enabled: needsPublishedJobFallback,
    queryFn: () => dependencies.fetchPublishedJobs(slug),
    queryKey: ["job-descriptions", "recruiting", slug] as const,
    staleTime: 60 * 1000,
  });

  const bindMutation = useMutation({
    mutationFn: (jobDescriptionId: string) =>
      dependencies.bindResumePoolItem(slug, detail.id, jobDescriptionId),
    onError: (error) => {
      if (dependencies.isConflictError(error)) {
        dependencies.notifyError("该简历已绑定岗位");
        void queryClient.invalidateQueries({
          queryKey: ["resume-pool", "detail", slug, detail.id],
        });
        return;
      }
      dependencies.notifyError("绑定失败");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resume-pool", "detail", slug, detail.id] });
      void queryClient.invalidateQueries({ queryKey: ["resume-pool", slug] });
      void queryClient.invalidateQueries({
        queryKey: ["resume-pool", "job-match", slug, detail.id],
      });
      // 直接通知父级关闭弹窗，不依赖详情 refetch 翻转 bound（refetch 慢/失败时也能关）。
      onBound?.();
    },
  });

  if (matchQuery.isLoading || query.isLoading || publishedJobsQuery.isLoading) {
    return <RecommendationsSkeleton />;
  }

  if (matchQuery.isError || query.isError || publishedJobsQuery.isError) {
    return (
      <Empty className="border-border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconFileSearch className="size-5" />
          </EmptyMedia>
          <EmptyTitle>推荐加载失败</EmptyTitle>
          <EmptyDescription>请稍后重试。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (matchQuery.data && (bound ? hasPersistedAlternative : hasAvailablePersistedCandidate)) {
    return (
      <div className="space-y-3">
        {matchQuery.data.candidates
          .slice(0, RESUME_POOL_JOB_RECOMMENDATION_LIMIT)
          .map((candidate) => (
            <PersistedJobMatchCandidateCard
              candidate={candidate}
              disabled={bindMutation.isPending}
              key={candidate.id}
              matching={bindMutation.isPending && bindMutation.variables === candidate.id}
              onMatch={(jobDescriptionId) => bindMutation.mutate(jobDescriptionId)}
            />
          ))}
      </div>
    );
  }

  if (needsPublishedJobFallback) {
    const availablePublishedJobs = (publishedJobsQuery.data ?? [])
      .filter((jobDescription) => jobDescription.id !== detail.jobDescriptionId)
      .slice(0, RESUME_POOL_JOB_RECOMMENDATION_LIMIT);
    if (availablePublishedJobs.length === 0) {
      return (
        <Empty className="border-border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconFileSearch className="size-5" />
            </EmptyMedia>
            <EmptyTitle>{bound ? "暂无其他发布岗位" : "暂无发布岗位"}</EmptyTitle>
            <EmptyDescription>
              {bound ? "当前没有可用于改绑的其他在招岗位。" : "当前没有可用于绑定的在招岗位。"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }
    return (
      <div className="space-y-3">
        {availablePublishedJobs.map((jobDescription) => (
          <PublishedJobCard
            actionLabel={bound ? "改绑到此岗位" : "绑定到此岗位"}
            disabled={bindMutation.isPending}
            jobDescription={jobDescription}
            key={jobDescription.id}
            matching={bindMutation.isPending && bindMutation.variables === jobDescription.id}
            onMatch={(jobDescriptionId) => bindMutation.mutate(jobDescriptionId)}
          />
        ))}
      </div>
    );
  }

  const { data } = query;
  if (!data || data.status === "already_matched") {
    return null;
  }

  if (data.status === "disabled") {
    return (
      <Empty className="border-border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconFileSearch className="size-5" />
          </EmptyMedia>
          <EmptyTitle>岗位推荐暂不可用</EmptyTitle>
          <EmptyDescription>请联系管理员检查推荐服务配置。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (data.status === "indexing") {
    return (
      <Empty className="border-border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconLoader2 className="size-5 animate-spin" />
          </EmptyMedia>
          <EmptyTitle>推荐准备中</EmptyTitle>
          <EmptyDescription>请稍后重试。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (data.recommendations.length === 0) {
    const { vectorHitCount, aboveThresholdCount } = data.diagnostics;
    let emptyTitle: string;
    let emptyDescription: string;
    if (vectorHitCount === 0) {
      emptyTitle = "暂无命中";
      emptyDescription = "暂未找到匹配岗位。";
    } else if (aboveThresholdCount === 0) {
      emptyTitle = "暂无合适岗位";
      emptyDescription = "暂未找到足够匹配的岗位。";
    } else {
      emptyTitle = "岗位已下架";
      emptyDescription = "匹配到的岗位已被删除或下架。";
    }
    return (
      <Empty className="border-border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconFileSearch className="size-5" />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {data.recommendations.slice(0, RESUME_POOL_JOB_RECOMMENDATION_LIMIT).map((recommendation) => (
        <JobDescriptionRecommendationCard
          disabled={bindMutation.isPending}
          key={recommendation.id}
          matching={bindMutation.isPending && bindMutation.variables === recommendation.id}
          onMatch={(jobDescriptionId) => bindMutation.mutate(jobDescriptionId)}
          recommendation={recommendation}
        />
      ))}
    </div>
  );
}
/* oxlint-enable complexity */
