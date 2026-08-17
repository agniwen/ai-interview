"use client";

/**
 * PROTOTYPE — @-mention people from 招聘台 / 人才库 in the recruiting composer.
 * Flat list (no category drill-down): show 20 by default, search returns top 20 matches.
 */

import { useQuery } from "@tanstack/react-query";
import { unstable_defaultDirectiveFormatter } from "@assistant-ui/react";
import type { Unstable_TriggerItem, ComposerPrimitive } from "@assistant-ui/react";
import { useMemo } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { fetchResumePoolItems } from "@/lib/client/api";
import { fetchStudioResumes } from "@/lib/client/api/endpoints/studio-resumes";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { ComposerTriggerPopover } from "./composer-trigger-popover";

const MENTION_FETCH_PAGE_SIZE = 80;
const MENTION_VISIBLE_LIMIT = 20;

type TriggerAdapter = NonNullable<
  ComponentPropsWithoutRef<typeof ComposerPrimitive.Unstable_TriggerPopover>["adapter"]
>;

interface MentionPerson {
  description?: string;
  id: string;
  label: string;
  type: "resume_pool" | "resume_record";
}

function personLabel(name: string | null | undefined, fallback: string) {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function sourceLabel(type: MentionPerson["type"]): string {
  return type === "resume_record" ? "招聘台" : "人才库";
}

function personRoleLine(person: {
  jobDescriptionName?: string | null;
  targetRole?: string | null;
}): string {
  const jobOrRole =
    [person.jobDescriptionName, person.targetRole].find((value) => value?.trim())?.trim() ?? null;
  return jobOrRole ?? "未绑定岗位";
}

function toTriggerItem(person: MentionPerson): Unstable_TriggerItem {
  return {
    description: person.description,
    id: person.id,
    label: person.label,
    metadata: { source: person.type },
    type: person.type,
  };
}

function matchScore(person: MentionPerson, lower: string): number {
  if (!lower) {
    return 1;
  }
  const label = person.label.toLowerCase();
  const description = person.description?.toLowerCase() ?? "";
  if (label.startsWith(lower)) {
    return 3;
  }
  if (label.includes(lower)) {
    return 2;
  }
  if (description.includes(lower) || person.id.toLowerCase().includes(lower)) {
    return 1;
  }
  return 0;
}

interface RecruitingPersonPool {
  isLoading: boolean;
  people: MentionPerson[];
}

function useRecruitingPersonPool(): RecruitingPersonPool {
  const slug = useWorkspaceSlug();

  const studioQuery = useQuery({
    queryFn: () =>
      fetchStudioResumes(slug, {
        page: 1,
        pageSize: MENTION_FETCH_PAGE_SIZE,
        sortBy: "updatedAt",
        sortOrder: "desc",
      }),
    queryKey: ["recruiting-mention", "studio-resumes", slug],
    staleTime: 30_000,
  });

  const poolPublicQuery = useQuery({
    queryFn: () => fetchResumePoolItems(slug, "public"),
    queryKey: ["recruiting-mention", "resume-pool", slug, "public"],
    staleTime: 30_000,
  });

  const poolPrivateQuery = useQuery({
    queryFn: () => fetchResumePoolItems(slug, "private"),
    queryKey: ["recruiting-mention", "resume-pool", slug, "private"],
    staleTime: 30_000,
  });

  const people = useMemo((): MentionPerson[] => {
    const merged: MentionPerson[] = [];
    const seen = new Set<string>();

    for (const record of studioQuery.data?.records ?? []) {
      if (seen.has(record.id)) {
        continue;
      }
      seen.add(record.id);
      merged.push({
        description: `${sourceLabel("resume_record")} · ${personRoleLine(record)}`,
        id: record.id,
        label: personLabel(record.candidateName, "未命名候选人"),
        type: "resume_record",
      });
    }

    for (const record of [
      ...(poolPublicQuery.data?.records ?? []),
      ...(poolPrivateQuery.data?.records ?? []),
    ]) {
      const id = `pool:${record.id}`;
      if (seen.has(record.id) || seen.has(id)) {
        continue;
      }
      seen.add(id);
      merged.push({
        description: `${sourceLabel("resume_pool")} · ${personRoleLine(record)}`,
        id,
        label: personLabel(record.candidateName, "未命名简历"),
        type: "resume_pool",
      });
    }

    return merged;
  }, [poolPrivateQuery.data?.records, poolPublicQuery.data?.records, studioQuery.data?.records]);

  return {
    isLoading: studioQuery.isLoading || poolPublicQuery.isLoading || poolPrivateQuery.isLoading,
    people,
  };
}

function useFlatMentionAdapter(people: MentionPerson[]): TriggerAdapter {
  return useMemo(
    () => ({
      categories: () => [],
      categoryItems: () => [],
      search: (query) => {
        const lower = query.trim().toLowerCase();
        if (!lower) {
          return people.slice(0, MENTION_VISIBLE_LIMIT).map(toTriggerItem);
        }
        return people
          .flatMap((person) => {
            const score = matchScore(person, lower);
            return score > 0 ? [{ person, score }] : [];
          })
          .toSorted(
            (a, b) => b.score - a.score || a.person.label.localeCompare(b.person.label, "zh"),
          )
          .slice(0, MENTION_VISIBLE_LIMIT)
          .map((entry) => toTriggerItem(entry.person));
      },
    }),
    [people],
  );
}

export function RecruitingPersonMentionPopover() {
  "use no memo";
  const { isLoading, people } = useRecruitingPersonPool();
  const adapter = useFlatMentionAdapter(people);

  return (
    <ComposerTriggerPopover
      adapter={adapter}
      char="@"
      directive={{ formatter: unstable_defaultDirectiveFormatter }}
      emptyItemsLabel="没有匹配的候选人"
      isLoading={isLoading}
      loadingLabel="加载候选人…"
    />
  );
}
