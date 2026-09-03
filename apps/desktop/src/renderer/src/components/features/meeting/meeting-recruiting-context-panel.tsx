import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type {
  MeetingAccessRole,
  MeetingRecruitingContextSettings,
  MeetingRecruitingRecordSummary,
} from "@app/shared/meeting-recording";
import { Button } from "@/components/ui/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FrameHeading,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame";
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
  onSave,
  onSearch,
  onSelectedIdChange,
  saving = false,
  selectedId,
  settings,
}: {
  candidates: MeetingRecruitingRecordSummary[];
  error?: unknown;
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
    <Frame>
      <FrameHeader>
        <FrameHeading>
          <FrameTitle>招聘关联</FrameTitle>
          <FrameDescription>
            可选关联一位候选人；移除关联不会删除会议或候选人记录。
          </FrameDescription>
        </FrameHeading>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-4">
        {error ? (
          <p className="text-destructive text-sm">
            {error instanceof Error ? error.message : "加载招聘关联失败"}
          </p>
        ) : null}
        {settings.link ? (
          <div className="min-w-0">
            <p className="font-medium text-sm">{settings.link.record.candidateName}</p>
            <p className="mt-0.5 text-muted-foreground text-xs">
              {candidateDescription(settings.link.record)}
            </p>
            <p className="mt-2 text-muted-foreground text-xs">
              建议使用招聘面试模板；不会覆盖已有的通用会议洞察。
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">当前未关联招聘记录。</p>
        )}
        {settings.canManage ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs" htmlFor="meeting-recruiting-context">
                招聘记录
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
            <Button className="shrink-0" disabled={saving} onClick={onSave} type="button">
              {saving ? "正在保存…" : "保存关联"}
            </Button>
          </div>
        ) : null}
      </FramePanel>
    </Frame>
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
      <Frame>
        <FrameHeader>
          <FrameHeading>
            <FrameTitle>招聘关联</FrameTitle>
            <FrameDescription>
              可选关联一位候选人；移除关联不会删除会议或候选人记录。
            </FrameDescription>
          </FrameHeading>
        </FrameHeader>
        <FramePanel>
          <p className="text-destructive text-sm">
            {contextQuery.error instanceof Error ? contextQuery.error.message : "加载招聘关联失败"}
          </p>
        </FramePanel>
      </Frame>
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
      onSave={() => mutation.mutate()}
      onSearch={setSearch}
      onSelectedIdChange={setSelectedId}
      saving={mutation.isPending}
      selectedId={selectedId}
      settings={contextQuery.data}
    />
  );
}
