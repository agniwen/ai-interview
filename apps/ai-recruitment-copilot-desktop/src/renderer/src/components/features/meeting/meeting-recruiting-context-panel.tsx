import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type {
  MeetingAccessRole,
  MeetingRecruitingContextSettings,
  MeetingRecruitingRecordSummary,
} from "@arc/shared/meeting-recording";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  desktopMeetingKeys,
  fetchMeetingRecruitingContext,
  fetchMeetingRecruitingContextCandidates,
  updateMeetingRecruitingContext,
} from "@/lib/client/meetings";

export function canManageMeetingRecruitingContext(role: MeetingAccessRole): boolean {
  return role === "administrator" || role === "owner";
}

export const MEETING_RECRUITING_SEARCH_DEBOUNCE_MS = 250;

export function useDebouncedMeetingRecruitingSearch(search: string): string {
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search);
    }, MEETING_RECRUITING_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);
  return debounced;
}

function candidateDescription(candidate: MeetingRecruitingRecordSummary): string {
  return candidate.jobDescriptionName ?? candidate.targetRole ?? "未关联岗位";
}

export function MeetingRecruitingContextView({
  candidates,
  loadingCandidates = false,
  onSave,
  onSearch,
  onSelectedIdChange,
  saving = false,
  selectedId,
  settings,
}: {
  candidates: MeetingRecruitingRecordSummary[];
  loadingCandidates?: boolean;
  onSave: () => void;
  onSearch?: (search: string) => void;
  onSelectedIdChange: (id: string | null) => void;
  saving?: boolean;
  selectedId: string | null;
  settings: MeetingRecruitingContextSettings;
}) {
  const options = useMemo(() => {
    const records = settings.link
      ? [settings.link.record, ...candidates.filter((item) => item.id !== settings.link?.record.id)]
      : candidates;
    return records.map((candidate) => ({
      description: candidateDescription(candidate),
      label: candidate.candidateName,
      searchValue: `${candidate.candidateName} ${candidateDescription(candidate)}`,
      value: candidate.id,
    }));
  }, [candidates, settings.link]);
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-4">
        <h2 className="font-medium">招聘关联</h2>
        <p className="text-muted-foreground text-xs">
          可选关联零个或一个 Candidate Recruiting Record；移除关联不会删除会议或候选记录。
        </p>
      </div>
      {settings.link ? (
        <div className="mb-4 rounded-lg border bg-background p-3 text-sm">
          <p className="font-medium">{settings.link.record.candidateName}</p>
          <p className="text-muted-foreground text-xs">
            {candidateDescription(settings.link.record)}
          </p>
          <p className="mt-2 text-muted-foreground text-xs">
            建议使用 Recruiting Interview 模板；不会覆盖已有的 General Meeting intelligence
            revision。
          </p>
        </div>
      ) : (
        <p className="mb-4 text-muted-foreground text-sm">当前未关联招聘记录。</p>
      )}
      {settings.canManage ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs" htmlFor="meeting-recruiting-context">
              Candidate Recruiting Record
            </label>
            <SearchableSelect
              clearable
              emptyMessage="没有可访问的招聘记录"
              id="meeting-recruiting-context"
              loading={loadingCandidates}
              onChange={onSelectedIdChange}
              onSearch={onSearch}
              options={options}
              placeholder="不关联招聘记录"
              searchPlaceholder="搜索候选人或岗位…"
              serverSideFilter
              value={selectedId}
            />
          </div>
          <Button disabled={saving} onClick={onSave} type="button">
            {saving ? "正在保存…" : "保存关联"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function MeetingRecruitingContextPanel({
  accessRole,
  meetingId,
  slug,
}: {
  accessRole: MeetingAccessRole;
  meetingId: string;
  slug: string;
}) {
  const queryClient = useQueryClient();
  const contextKey = desktopMeetingKeys.recruitingContext(slug, meetingId);
  const contextQuery = useQuery({
    queryFn: () => fetchMeetingRecruitingContext(slug, meetingId),
    queryKey: contextKey,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDebouncedMeetingRecruitingSearch(search);
  const canManage =
    canManageMeetingRecruitingContext(accessRole) && Boolean(contextQuery.data?.canManage);
  const candidatesQuery = useQuery({
    enabled: canManage,
    queryFn: ({ signal }) =>
      fetchMeetingRecruitingContextCandidates(slug, meetingId, deferredSearch, signal),
    queryKey: desktopMeetingKeys.recruitingContextCandidates(slug, meetingId, deferredSearch),
  });
  useEffect(() => {
    setSelectedId(contextQuery.data?.link?.record.id ?? null);
  }, [contextQuery.data?.link?.record.id]);
  const mutation = useMutation({
    mutationFn: () => updateMeetingRecruitingContext(slug, meetingId, selectedId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: contextKey });
    },
  });
  if (contextQuery.isPending) {
    return null;
  }
  if (contextQuery.error) {
    return (
      <p className="text-destructive text-sm">
        {contextQuery.error instanceof Error ? contextQuery.error.message : "加载招聘关联失败"}
      </p>
    );
  }
  if (!contextQuery.data) {
    return null;
  }
  const error = candidatesQuery.error ?? mutation.error;
  return (
    <div>
      {error ? (
        <p className="mb-2 text-destructive text-sm">
          {error instanceof Error ? error.message : "加载招聘关联失败"}
        </p>
      ) : null}
      <MeetingRecruitingContextView
        candidates={candidatesQuery.data ?? []}
        loadingCandidates={candidatesQuery.isFetching}
        onSave={() => mutation.mutate()}
        onSearch={setSearch}
        onSelectedIdChange={setSelectedId}
        saving={mutation.isPending}
        selectedId={selectedId}
        settings={contextQuery.data}
      />
    </div>
  );
}
