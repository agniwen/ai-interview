"use client";

import { IconChevronDown, IconLoader2 } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import {
  fetchPublishedResumePoolJobDescriptions,
  fetchResumePoolJobMatch,
  fetchResumePoolJobRecommendations,
} from "@/lib/client/api";

import { RESUME_POOL_JOB_RECOMMENDATION_LIMIT } from "./resume-pool-recommendations-panel";

interface ResumePoolJobBindingMenuContentProps {
  bound: boolean;
  currentJobDescriptionId: string | null;
  onSelect: (jobDescriptionId: string) => void;
  recordId: string;
  slug: string;
}

/* oxlint-disable complexity -- preserves the persisted-match, generated-recommendation, and published-job fallback order. */
function ResumePoolJobBindingMenuContent({
  bound,
  currentJobDescriptionId,
  onSelect,
  recordId,
  slug,
}: ResumePoolJobBindingMenuContentProps) {
  const matchQuery = useQuery({
    queryFn: () => fetchResumePoolJobMatch(slug, recordId),
    queryKey: ["resume-pool", "job-match", slug, recordId] as const,
    staleTime: 60 * 1000,
  });
  const matchedJobDescriptions = (matchQuery.data?.candidates ?? []).filter(
    (candidate) => candidate.available && (!bound || !candidate.isCurrent),
  );
  const hasAvailablePersistedCandidate = Boolean(
    matchQuery.data?.candidates.some((candidate) => candidate.available),
  );
  const hasPersistedAlternative = Boolean(
    matchQuery.data?.candidates.some((candidate) => candidate.available && !candidate.isCurrent),
  );
  const needsGeneratedRecommendations = matchQuery.isSuccess && !bound && !matchQuery.data;
  const recommendationsQuery = useQuery({
    enabled: needsGeneratedRecommendations,
    queryFn: () =>
      fetchResumePoolJobRecommendations(slug, recordId, RESUME_POOL_JOB_RECOMMENDATION_LIMIT),
    queryKey: ["resume-pool", "jd-recommendations", slug, recordId] as const,
    staleTime: 60 * 1000,
  });
  const needsPublishedJobFallback =
    matchQuery.isSuccess &&
    (bound
      ? !matchQuery.data || !hasPersistedAlternative
      : Boolean(matchQuery.data && !hasAvailablePersistedCandidate));
  const publishedJobsQuery = useQuery({
    enabled: needsPublishedJobFallback,
    queryFn: () => fetchPublishedResumePoolJobDescriptions(slug),
    queryKey: ["job-descriptions", "recruiting", slug] as const,
    staleTime: 60 * 1000,
  });
  const fallbackJobDescriptions = (publishedJobsQuery.data ?? []).filter(
    (jobDescription) => jobDescription.id !== currentJobDescriptionId,
  );
  const generatedJobDescriptions =
    recommendationsQuery.data?.status === "ready"
      ? recommendationsQuery.data.recommendations.map((recommendation) => ({
          departmentName: recommendation.departmentName,
          description:
            recommendation.description?.trim() ||
            recommendation.reasons[0]?.trim() ||
            "暂无岗位描述。",
          id: recommendation.id,
          name: recommendation.name,
        }))
      : [];
  let availableJobDescriptions = fallbackJobDescriptions.map((jobDescription) => ({
    departmentName: jobDescription.departmentName,
    description: jobDescription.description?.trim() || "暂无岗位描述。",
    id: jobDescription.id,
    name: jobDescription.name,
  }));
  if (generatedJobDescriptions.length > 0) {
    availableJobDescriptions = generatedJobDescriptions;
  }
  if (matchedJobDescriptions.length > 0) {
    availableJobDescriptions = matchedJobDescriptions.map((jobDescription) => ({
      departmentName: jobDescription.departmentName,
      description: jobDescription.aiReason?.trim() || "该岗位由明确投递线索或向量排序选出。",
      id: jobDescription.id,
      name: jobDescription.name,
    }));
  }
  availableJobDescriptions = availableJobDescriptions.slice(
    0,
    RESUME_POOL_JOB_RECOMMENDATION_LIMIT,
  );

  const isLoading =
    matchQuery.isLoading || recommendationsQuery.isLoading || publishedJobsQuery.isLoading;
  const isError = matchQuery.isError || recommendationsQuery.isError || publishedJobsQuery.isError;
  let content: ReactNode;
  if (isLoading) {
    content = <DropdownMenuItem disabled>正在加载匹配岗位…</DropdownMenuItem>;
  } else if (isError) {
    content = <DropdownMenuItem disabled>岗位加载失败，请刷新页面</DropdownMenuItem>;
  } else if (availableJobDescriptions.length === 0) {
    let emptyLabel = bound ? "暂无其他在招岗位" : "暂无合适岗位";
    if (recommendationsQuery.data?.status === "disabled") {
      emptyLabel = "岗位推荐暂不可用";
    } else if (recommendationsQuery.data?.status === "indexing") {
      emptyLabel = "推荐准备中，请稍后再试";
    } else if (recommendationsQuery.data?.status === "already_matched") {
      emptyLabel = "该简历已绑定岗位，请刷新页面";
    }
    content = <DropdownMenuItem disabled>{emptyLabel}</DropdownMenuItem>;
  } else {
    content = availableJobDescriptions.map((jobDescription) => (
      <DropdownMenuItem
        className="items-start py-2"
        key={jobDescription.id}
        onClick={() => onSelect(jobDescription.id)}
      >
        <ItemContent>
          <ItemTitle>{jobDescription.name}</ItemTitle>
          <ItemDescription>
            {jobDescription.departmentName
              ? `${jobDescription.departmentName} · ${jobDescription.description}`
              : jobDescription.description}
          </ItemDescription>
        </ItemContent>
      </DropdownMenuItem>
    ));
  }

  return <DropdownMenuGroup>{content}</DropdownMenuGroup>;
}
/* oxlint-enable complexity */

export function ResumePoolJobBindingMenu({
  binding,
  currentJobDescriptionId,
  onSelect,
  recordId,
  slug,
}: {
  binding: boolean;
  currentJobDescriptionId: string | null;
  onSelect: (jobDescriptionId: string) => void;
  recordId: string;
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const bound = Boolean(currentJobDescriptionId);

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={bound ? "更换绑定岗位" : "推荐岗位"}
            className="h-5 shrink-0 px-1.5 text-xs"
            disabled={binding}
            size="xs"
            type="button"
            variant={bound ? "outline" : "secondary"}
          >
            {binding ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
            {bound ? "更换" : "推荐岗位"}
            <IconChevronDown data-icon="inline-end" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        {open ? (
          <ResumePoolJobBindingMenuContent
            bound={bound}
            currentJobDescriptionId={currentJobDescriptionId}
            onSelect={onSelect}
            recordId={recordId}
            slug={slug}
          />
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
