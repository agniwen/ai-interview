import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  formatLocalDateTime,
  formatResumeRecordDisplayId,
  getResumeLibraryJobDescriptionLabel,
} from "@/components/features/studio/resumes/resume-display";
import { PIPELINE_STAGE_TABS } from "@/components/features/studio/resumes/resume-library-filter-model";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import { fetchStudioResumes } from "@/lib/client/studio-resumes";
import { desktopWorkspaceKeys, resolveActiveWorkspace } from "@/lib/client/workspace";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import { cn } from "@arc/shared/utils";
import { useMeetingRecordingActions } from "./meeting-recording-context";
import { MeetingSetupComposer } from "./meeting-capture-status";
import { MeetingTranscriptIdleStage } from "./live-transcript-draft-panel";
import { MeetingRecordingSessionLayout } from "./meeting-recording-session-layout";

/** 默认拉取条数（在线搜索分页第一页）。 */
export const MEETING_RESUME_PICKER_PAGE_SIZE = 50;

const PIPELINE_STAGE_LABEL: Record<string, string> = Object.fromEntries(
  PIPELINE_STAGE_TABS.filter((tab) => tab.value !== "all").map((tab) => [tab.value, tab.label]),
);

// written_test is hidden from tabs but may still appear on records.
PIPELINE_STAGE_LABEL.written_test = "笔试";

function resumeToOption(record: ResumeLibraryListRecord): SearchableSelectOption {
  const displayId = formatResumeRecordDisplayId(record.id);
  const jobLabel = getResumeLibraryJobDescriptionLabel(record);
  return {
    description: jobLabel ? `${displayId} · ${jobLabel}` : displayId,
    label: record.candidateName,
    searchValue: [record.candidateName, record.candidateEmail, jobLabel, record.id, displayId]
      .filter(Boolean)
      .join(" "),
    value: record.id,
  };
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium text-foreground" title={value}>
        {value}
      </span>
    </div>
  );
}

function CreatorDetailRow({ record }: { record: ResumeLibraryListRecord }) {
  const creatorName = record.creatorName?.trim() || "—";
  const creatorInitial = record.creatorName?.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 text-sm">
      <span className="text-muted-foreground">创建人</span>
      <span
        className="flex min-w-0 items-center gap-1.5 font-medium text-foreground"
        title={creatorName}
      >
        <Avatar className="size-4!" size="sm">
          {record.creatorImage ? <AvatarImage alt={creatorName} src={record.creatorImage} /> : null}
          <AvatarFallback>{creatorInitial}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 truncate">{creatorName}</span>
      </span>
    </div>
  );
}

function SelectedResumeDetails({ record }: { record: ResumeLibraryListRecord }) {
  const jobLabel = getResumeLibraryJobDescriptionLabel(record) ?? "未绑定岗位";
  const stageLabel = PIPELINE_STAGE_LABEL[record.pipelineStage] ?? record.pipelineStage;

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-border bg-muted/30 px-3 py-3",
        "dark:bg-muted/15",
      )}
    >
      <p className="font-medium text-foreground text-sm">
        {record.candidateName}
        <span className="ml-1.5 font-normal text-muted-foreground text-xs">
          ({formatResumeRecordDisplayId(record.id)})
        </span>
      </p>
      <div className="space-y-1.5">
        <CreatorDetailRow record={record} />
        <DetailRow label="创建时间" value={formatLocalDateTime(record.createdAt)} />
        <DetailRow label="关联部门/岗位" value={jobLabel} />
        <DetailRow label="面试阶段" value={stageLabel} />
      </div>
    </div>
  );
}

function MeetingRecruitingLinkSection({
  deferredSearch,
  isWorkspaceMissing,
  listFetching,
  onSearch,
  onSelectChange,
  options,
  optionsWithSelected,
  selectedId,
  selectedRecord,
}: {
  deferredSearch: string;
  isWorkspaceMissing: boolean;
  listFetching: boolean;
  onSearch: (query: string) => void;
  onSelectChange: (nextId: string | null) => void;
  options: SearchableSelectOption[];
  optionsWithSelected: SearchableSelectOption[];
  selectedId: string | null;
  selectedRecord: ResumeLibraryListRecord | null;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="meeting-resume-select">关联招聘记录</Label>
        {isWorkspaceMissing ? (
          <p className="text-muted-foreground text-sm">
            未加入工作区，请先在网页端加入或创建工作区。
          </p>
        ) : (
          <SearchableSelect
            clearable
            emptyMessage={deferredSearch ? "没有匹配的招聘记录" : "当前工作区暂无招聘台记录"}
            id="meeting-resume-select"
            loading={listFetching && options.length === 0}
            onChange={onSelectChange}
            onSearch={onSearch}
            options={optionsWithSelected}
            placeholder="选择关联的招聘记录"
            searchPlaceholder="搜索候选人、邮箱、岗位、ID…"
            serverSideFilter
            value={selectedId}
          />
        )}
      </div>

      {selectedRecord ? <SelectedResumeDetails record={selectedRecord} /> : null}
    </div>
  );
}

/**
 * 新建会议录制初始化页。仅当 URL 带 `resumeRecordId`（从招聘台跳入）时展示关联招聘记录。
 * Init page for a new meeting recording. Recruiting link UI only when `resumeRecordId` is in the URL.
 */
export function NewMeetingRecordingPage({
  linkRecruiting = false,
  preselectedResumeId,
  preselectedResumeRecord,
}: {
  /** 是否展示「关联招聘记录」——由路由 search 是否含 resumeRecordId 决定。 */
  linkRecruiting?: boolean;
  preselectedResumeId?: string | null;
  preselectedResumeRecord?: ResumeLibraryListRecord | null;
}) {
  const navigate = useNavigate();
  const { startRecording } = useMeetingRecordingActions();
  const [selectedId, setSelectedId] = useState<string | null>(
    linkRecruiting ? (preselectedResumeId ?? preselectedResumeRecord?.id ?? null) : null,
  );
  const [selectedRecord, setSelectedRecord] = useState<ResumeLibraryListRecord | null>(
    linkRecruiting ? (preselectedResumeRecord ?? null) : null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const deferredSearch = useDeferredValue(searchQuery.trim());

  const workspaceQuery = useQuery({
    queryFn: resolveActiveWorkspace,
    queryKey: desktopWorkspaceKeys.active,
    staleTime: 60_000,
  });
  const slug = workspaceQuery.data?.slug ?? null;

  useEffect(() => {
    if (!linkRecruiting) {
      setSelectedId(null);
      setSelectedRecord(null);
      setSearchQuery("");
      setStartError(null);
      return;
    }
    const nextId = preselectedResumeId ?? preselectedResumeRecord?.id ?? null;
    setSelectedId(nextId);
    setSelectedRecord(preselectedResumeRecord ?? null);
    setSearchQuery("");
    setStartError(null);
  }, [linkRecruiting, preselectedResumeId, preselectedResumeRecord]);

  const listQuery = useQuery({
    enabled: linkRecruiting && Boolean(slug),
    placeholderData: (previous) => previous,
    queryFn: () =>
      fetchStudioResumes(slug as string, {
        page: 1,
        pageSize: MEETING_RESUME_PICKER_PAGE_SIZE,
        search: deferredSearch || undefined,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
    queryKey: [
      "studio-resumes",
      slug,
      "meeting-picker",
      { pageSize: MEETING_RESUME_PICKER_PAGE_SIZE, search: deferredSearch },
    ],
    staleTime: 15_000,
  });

  const recordsById = useMemo(() => {
    const map = new Map<string, ResumeLibraryListRecord>();
    for (const record of listQuery.data?.records ?? []) {
      map.set(record.id, record);
    }
    if (preselectedResumeRecord) {
      map.set(preselectedResumeRecord.id, preselectedResumeRecord);
    }
    if (selectedRecord) {
      map.set(selectedRecord.id, selectedRecord);
    }
    return map;
  }, [listQuery.data?.records, preselectedResumeRecord, selectedRecord]);

  const options = useMemo(() => {
    const records = listQuery.data?.records ?? [];
    return records.map(resumeToOption);
  }, [listQuery.data?.records]);

  const optionsWithSelected = useMemo(() => {
    if (!selectedId) {
      return options;
    }
    if (options.some((option) => option.value === selectedId)) {
      return options;
    }
    const known = recordsById.get(selectedId);
    if (known) {
      return [resumeToOption(known), ...options];
    }
    return [
      {
        description: formatResumeRecordDisplayId(selectedId),
        label: "已选招聘记录",
        value: selectedId,
      },
      ...options,
    ];
  }, [options, recordsById, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    const known = recordsById.get(selectedId);
    if (known && known.id !== selectedRecord?.id) {
      setSelectedRecord(known);
    }
  }, [recordsById, selectedId, selectedRecord?.id]);

  const handleSelectChange = (nextId: string | null) => {
    setSelectedId(nextId);
    if (!nextId) {
      setSelectedRecord(null);
      return;
    }
    setSelectedRecord(recordsById.get(nextId) ?? null);
  };

  const isWorkspaceMissing = !workspaceQuery.isPending && !slug;

  const handleConfirm = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const { captureId } = await startRecording(linkRecruiting ? selectedId : null);
      await navigate({
        params: { meetingId: captureId },
        replace: true,
        to: "/meetings/$meetingId",
      });
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "无法开始会议录制");
    } finally {
      setStarting(false);
    }
  };

  return (
    <MeetingRecordingSessionLayout
      composer={
        <MeetingSetupComposer
          disabled={starting || (linkRecruiting && isWorkspaceMissing)}
          error={startError}
          onStart={() => void handleConfirm()}
          starting={starting}
        />
      }
      main={
        <MeetingTranscriptIdleStage>
          {linkRecruiting ? (
            <MeetingRecruitingLinkSection
              deferredSearch={deferredSearch}
              isWorkspaceMissing={isWorkspaceMissing}
              listFetching={listQuery.isFetching}
              onSearch={setSearchQuery}
              onSelectChange={handleSelectChange}
              options={options}
              optionsWithSelected={optionsWithSelected}
              selectedId={selectedId}
              selectedRecord={selectedRecord}
            />
          ) : null}
        </MeetingTranscriptIdleStage>
      }
    />
  );
}
