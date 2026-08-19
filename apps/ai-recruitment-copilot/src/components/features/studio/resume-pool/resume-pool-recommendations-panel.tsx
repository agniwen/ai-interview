"use client";

import { IconFileSearch, IconLoader2 } from "@tabler/icons-react";
import type {
  JobDescriptionRecommendation,
  JobDescriptionRecommendationResult,
} from "@arc/shared/job-descriptions";
import type { ResumePoolDetail } from "@arc/shared/resume-pool";
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
import { bindResumePoolItem, isApiError, rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

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

export interface ResumePoolRecommendationsDependencies {
  bindResumePoolItem: typeof bindResumePoolItem;
  fetchRecommendations: (
    slug: string,
    resumePoolItemId: string,
  ) => Promise<JobDescriptionRecommendationResult>;
  isConflictError: (error: Error) => boolean;
  notifyError: (message: string) => void;
}

const defaultDependencies: ResumePoolRecommendationsDependencies = {
  bindResumePoolItem,
  fetchRecommendations: (slug, resumePoolItemId) =>
    rpcFetch<JobDescriptionRecommendationResult>(
      rpc.api.w[":slug"].studio["resume-pool"][":id"].recommendations.$post({
        json: { topN: 10 },
        param: { id: resumePoolItemId, slug },
      }),
      "加载岗位推荐失败",
    ),
  isConflictError: (error) => isApiError(error) && error.status === 409,
  notifyError: (message) => toast.error(message),
};

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
  const query = useQuery({
    enabled: !bound,
    queryFn: () => dependencies.fetchRecommendations(slug, detail.id),
    queryKey: ["resume-pool", "jd-recommendations", slug, detail.id] as const,
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
      // 直接通知父级关闭弹窗，不依赖详情 refetch 翻转 bound（refetch 慢/失败时也能关）。
      onBound?.();
    },
  });

  if (bound) {
    return null;
  }

  if (query.isLoading) {
    return <RecommendationsSkeleton />;
  }

  if (query.isError) {
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
      {data.recommendations.map((recommendation) => (
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
