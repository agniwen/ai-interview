import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  formatLocalDateTime,
  formatResumeRecordDisplayId,
  getResumeLibraryJobDescriptionLabel,
} from "@/components/features/studio/resumes/resume-display";
import { PIPELINE_STAGE_TABS } from "@/components/features/studio/resumes/resume-library-filter-model";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import { fetchStudioResumes } from "@/lib/client/studio-resumes";
import { desktopWorkspaceKeys, resolveActiveWorkspace } from "@/lib/client/workspace";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import { cn } from "@arc/shared/utils";

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
    // Option secondary line: id first, then department/job when present.
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
        <DetailRow label="创建人" value={record.creatorName?.trim() || "—"} />
        <DetailRow label="创建时间" value={formatLocalDateTime(record.createdAt)} />
        <DetailRow label="关联部门/岗位" value={jobLabel} />
        <DetailRow label="面试阶段" value={stageLabel} />
      </div>
    </div>
  );
}

export function NewMeetingRecordingDialog({
  onOpenChange,
  open,
  preselectedResumeId,
  preselectedResumeRecord,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  preselectedResumeId?: string | null;
  /** Optional full record when opening from a card (for immediate detail preview). */
  preselectedResumeRecord?: ResumeLibraryListRecord | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<ResumeLibraryListRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearch = useDeferredValue(searchQuery.trim());

  const workspaceQuery = useQuery({
    enabled: open,
    queryFn: resolveActiveWorkspace,
    queryKey: desktopWorkspaceKeys.active,
    staleTime: 60_000,
  });
  const slug = workspaceQuery.data?.slug ?? null;

  // Reset selection when dialog opens / preselect changes.
  useEffect(() => {
    if (!open) {
      return;
    }
    const nextId = preselectedResumeId ?? preselectedResumeRecord?.id ?? null;
    setSelectedId(nextId);
    setSelectedRecord(preselectedResumeRecord ?? null);
    setSearchQuery("");
  }, [open, preselectedResumeId, preselectedResumeRecord]);

  const listQuery = useQuery({
    enabled: open && Boolean(slug),
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

  // Keep preselected / selected option visible even if not in the current page.
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

  // Hydrate details when list catches up with a bare selected id.
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

  const canSubmit = Boolean(selectedId);
  const isWorkspaceMissing = open && !workspaceQuery.isPending && !slug;

  const handleConfirm = () => {
    if (!selectedId) {
      return;
    }
    // Meeting capture flow is wired later — for now close with a selection.
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建会议录制</DialogTitle>
          <DialogDescription>
            选择要关联的招聘台候选人记录，录制内容将归集到该候选人。
          </DialogDescription>
        </DialogHeader>

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
                loading={listQuery.isFetching && options.length === 0}
                onChange={handleSelectChange}
                onSearch={setSearchQuery}
                options={optionsWithSelected}
                placeholder="选择关联的招聘记录"
                searchPlaceholder="搜索候选人、邮箱、岗位、ID…"
                serverSideFilter
                value={selectedId}
              />
            )}
            <p className="text-muted-foreground text-xs">
              默认展示最近 {MEETING_RESUME_PICKER_PAGE_SIZE} 条，输入关键词可在线搜索。
            </p>
          </div>

          {selectedRecord ? <SelectedResumeDetails record={selectedRecord} /> : null}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={!canSubmit} onClick={handleConfirm} type="button">
            开始录制
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
