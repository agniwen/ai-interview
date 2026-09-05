import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type {
  MeetingAccessRole,
  MeetingRecruitingContextSettings,
  MeetingRecruitingRecordSummary,
} from "@app/shared/meeting-recording";
import { SettingsRow } from "@/components/settings/settings-ui";
import { Skeleton } from "@/components/ui/skeleton";
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

/**
 * 0..1 Recruiting Record 关联编辑器；Picker 选项已经过服务端 Workspace 与招聘可见性过滤。
 * Editor for the optional single recruiting link; picker options are server-filtered by workspace and recruiting visibility.
 */
export function MeetingRecruitingContextView({
  candidates,
  error = null,
  loadingCandidates = false,
  onSearch,
  onSelectedIdChange,
  saving = false,
  selectedId,
  settings,
}: {
  candidates: MeetingRecruitingRecordSummary[];
  error?: unknown;
  loadingCandidates?: boolean;
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
    <SettingsRow
      description="选择候选人后自动保存"
      htmlFor="meeting-recruiting-context"
      label="招聘关联"
    >
      {settings.canManage ? (
        <div className="flex flex-col gap-1">
          <SearchableSelect
            clearable
            disabled={saving}
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
          {saving ? <p className="text-right text-muted-foreground text-xs">保存中…</p> : null}
          {error ? (
            <p className="text-right text-destructive text-xs">
              {error instanceof Error ? error.message : "保存招聘关联失败"}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="text-right text-sm">
          {settings.link ? (
            <>
              <p>{settings.link.record.candidateName}</p>
              <p className="text-muted-foreground text-xs">
                {candidateDescription(settings.link.record)}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">未关联</p>
          )}
        </div>
      )}
    </SettingsRow>
  );
}

/**
 * 招聘关联的数据协调器。客户端 canManage 只避免无效请求，DAO 在写入事务内重新验证对象权限。
 * Recruiting-link data coordinator; client canManage avoids useless requests while DAO revalidates object access on write.
 */
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
  const mutation = useMutation({
    mutationFn: (recruitingRecordId: string | null) =>
      updateMeetingRecruitingContext(slug, meetingId, recruitingRecordId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: contextKey });
    },
  });
  if (contextQuery.isPending) {
    return (
      <SettingsRow label="招聘关联">
        <Skeleton className="ml-auto h-9 w-full max-w-xs" />
      </SettingsRow>
    );
  }
  if (contextQuery.error) {
    return (
      <SettingsRow label="招聘关联">
        <p className="text-right text-destructive text-sm">
          {contextQuery.error instanceof Error ? contextQuery.error.message : "加载招聘关联失败"}
        </p>
      </SettingsRow>
    );
  }
  if (!contextQuery.data) {
    return null;
  }
  return (
    <MeetingRecruitingContextView
      candidates={candidatesQuery.data ?? []}
      error={candidatesQuery.error ?? mutation.error}
      loadingCandidates={candidatesQuery.isFetching}
      onSearch={setSearch}
      onSelectedIdChange={(id) => mutation.mutate(id)}
      saving={mutation.isPending}
      selectedId={
        mutation.isPending
          ? (mutation.variables ?? null)
          : (contextQuery.data.link?.record.id ?? null)
      }
      settings={contextQuery.data}
    />
  );
}
