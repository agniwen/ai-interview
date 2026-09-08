import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { MeetingAccessRole } from "@app/shared/meeting-recording";
import {
  INITIAL_INTERVIEW_OVERWRITE_DESCRIPTION,
  INITIAL_INTERVIEW_STATUS_LABELS,
  initialInterviewKeys,
  isInitialInterviewProcessing,
} from "@app/shared/human-initial-interview";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { fetchMeetingRecruitingContextCandidates } from "@/lib/client/meetings";
import {
  createInitialInterview,
  fetchInitialInterviews,
  recruitingInitialInterviewUrl,
  resumeInitialInterview,
} from "@/lib/client/initial-interviews";
import { useDebouncedMeetingRecruitingSearch } from "./meeting-recruiting-context-panel";

function useInitialInterviewGeneration(slug: string, meetingId: string) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [recordId, setRecordId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [checking, setChecking] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    documentId: string;
  } | null>(null);
  const debounced = useDebouncedMeetingRecruitingSearch(search);
  const candidates = useQuery({
    enabled: open,
    queryFn: ({ signal }) =>
      fetchMeetingRecruitingContextCandidates(
        slug,
        meetingId,
        debounced,
        signal,
        "initial-interview",
      ),
    queryKey: ["initial-interview-candidates", slug, meetingId, debounced],
  });
  const list = useQuery({
    enabled: open && Boolean(recordId),
    queryFn: () => fetchInitialInterviews(slug, recordId ?? ""),
    queryKey: initialInterviewKeys.list(slug, recordId ?? ""),
    refetchInterval: (query) =>
      createdId &&
      query.state.data?.records.some(
        (record) =>
          record.id === createdId && isInitialInterviewProcessing(record.latestVersion.status),
      )
        ? 3000
        : false,
  });
  const current = list.data?.records.find((record) => record.id === createdId);
  const mutation = useMutation({
    mutationFn: async (input: { documentId: string | null }) => {
      if (!recordId) {
        throw new Error("请选择招聘记录");
      }
      if (current) {
        return await resumeInitialInterview(slug, recordId, current.latestVersion.id, {
          overwriteDocumentId: input.documentId,
        });
      }
      return await createInitialInterview(slug, recordId, {
        meetingId,
        overwriteDocumentId: input.documentId,
        requestId,
      });
    },
    onError: (error) => toast.error(error.message),
    onSuccess: async (result) => {
      setCreatedId(current?.id ?? result.id);
      setConfirmation(null);
      await queryClient.invalidateQueries({
        queryKey: initialInterviewKeys.list(slug, recordId ?? ""),
      });
      toast.success("资料快照已保存，评价表将在后台生成");
    },
  });
  async function begin() {
    if (checking || mutation.isPending) {
      return;
    }
    setChecking(true);
    try {
      const fresh = await list.refetch();
      if (fresh.error) {
        toast.error(fresh.error.message);
        return;
      }
      if (!current && (fresh.data?.document || fresh.data?.records.length)) {
        toast.error("该招聘记录已有评价表或人工初面生成记录，请在招聘台查看或继续处理。");
        await queryClient.invalidateQueries({
          queryKey: ["initial-interview-candidates", slug, meetingId],
        });
        return;
      }
      const documentId = fresh.data?.document?.documentId ?? null;
      if (documentId && current?.latestVersion.overwriteDocumentId !== documentId) {
        setConfirmation({ documentId });
        return;
      }
      mutation.mutate({ documentId });
    } finally {
      setChecking(false);
    }
  }
  return {
    begin,
    candidates,
    checking,
    confirmation,
    createdId,
    current,
    list,
    mutation,
    open,
    recordId,
    setConfirmation,
    setOpen,
    setRecordId,
    setRequestId,
    setSearch,
  };
}

function GenerationStatus({ state }: { state: ReturnType<typeof useInitialInterviewGeneration> }) {
  const { candidates, list, mutation, current, begin, checking } = state;
  return (
    <>
      {candidates.error || list.error ? (
        <p className="text-destructive text-sm">{(candidates.error ?? list.error)?.message}</p>
      ) : null}
      {list.data && !list.data.canGenerate ? (
        <p className="text-muted-foreground text-sm">
          你可以查看该招聘记录，但没有生成评价的权限。
        </p>
      ) : null}
      {mutation.isPending ? (
        <output className="text-muted-foreground text-sm">正在保存资料快照，请稍候…</output>
      ) : null}
      {current ? (
        <div className="flex items-center gap-2">
          <Badge variant="secondary">人工初面</Badge>
          <span className="text-sm">
            {INITIAL_INTERVIEW_STATUS_LABELS[current.latestVersion.status]}
          </span>
        </div>
      ) : null}
      {current?.latestVersion.error ? (
        <p className="text-destructive text-sm">{current.latestVersion.error}</p>
      ) : null}
      {current && ["needs_speakers", "failed"].includes(current.latestVersion.status) ? (
        <Button
          disabled={mutation.isPending || checking || !list.data?.canGenerate}
          onClick={() => {
            void begin();
          }}
        >
          重试生成
        </Button>
      ) : null}
    </>
  );
}

function OverwriteConfirmation({
  state,
}: {
  state: ReturnType<typeof useInitialInterviewGeneration>;
}) {
  const { open, confirmation, mutation, setConfirmation } = state;
  return (
    <Dialog
      open={open && Boolean(confirmation)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !mutation.isPending) {
          setConfirmation(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>覆盖现有 HR 初面内容？</DialogTitle>
          <DialogDescription>{INITIAL_INTERVIEW_OVERWRITE_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => setConfirmation(null)}
          >
            取消
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={() => {
              if (confirmation) {
                mutation.mutate(confirmation);
              }
            }}
          >
            {mutation.isPending ? <Spinner /> : null}
            {mutation.isPending ? "正在生成…" : "覆盖并生成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MeetingInitialInterviewAction({
  slug,
  meetingId,
  accessRole,
  ready,
  trigger,
}: {
  slug: string;
  meetingId: string;
  accessRole: MeetingAccessRole;
  ready: boolean;
  trigger?: (props: { disabled: boolean; onClick: () => void }) => ReactNode;
}) {
  const state = useInitialInterviewGeneration(slug, meetingId);
  const {
    open,
    checking,
    setOpen,
    candidates,
    recordId,
    setRecordId,
    setRequestId,
    createdId,
    confirmation,
    setConfirmation,
    list,
    mutation,
    begin,
    setSearch,
  } = state;
  const submitLabel = mutation.isPending ? "正在生成…" : "生成评价表";
  if (accessRole !== "owner" && accessRole !== "administrator") {
    return null;
  }
  return (
    <>
      {trigger ? (
        trigger({ disabled: !ready, onClick: () => setOpen(true) })
      ) : (
        <Button disabled={!ready} onClick={() => setOpen(true)} size="sm" variant="outline">
          生成面试评价表
        </Button>
      )}
      <Dialog open={open && !confirmation} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>根据录音生成人工初面评价</DialogTitle>
            <DialogDescription>
              仅可选择简历筛选或 AI 面试阶段、尚未生成评价表的招聘记录。简历筛选阶段会推进到 AI
              面试，以人工初面展示。资料将独立保存到招聘台。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <label className="text-sm font-medium" htmlFor="initial-interview-record">
              招聘记录
            </label>
            <SearchableSelect
              id="initial-interview-record"
              options={(candidates.data ?? []).map((candidate) => ({
                description: candidate.jobDescriptionName ?? candidate.targetRole ?? "未关联岗位",
                label: candidate.candidateName,
                value: candidate.id,
              }))}
              value={recordId}
              disabled={checking || mutation.isPending || Boolean(createdId)}
              placeholder="选择候选人和岗位"
              serverSideFilter
              onSearch={setSearch}
              loading={candidates.isFetching}
              searchPlaceholder="搜索候选人或岗位…"
              onChange={(id) => {
                setRecordId(id);
                setRequestId(crypto.randomUUID());
                setConfirmation(null);
              }}
            />
            <GenerationStatus state={state} />
          </div>
          <DialogFooter>
            {createdId && recordId ? (
              <Button
                nativeButton={false}
                render={
                  <a
                    aria-label="打开招聘台"
                    href={recruitingInitialInterviewUrl(slug, recordId)}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                打开招聘台
              </Button>
            ) : (
              <Button
                disabled={
                  !recordId ||
                  !list.data?.canGenerate ||
                  checking ||
                  mutation.isPending ||
                  list.isFetching ||
                  Boolean(confirmation)
                }
                onClick={() => {
                  void begin();
                }}
              >
                {checking || mutation.isPending ? <Spinner /> : null}
                {checking ? "正在检查…" : submitLabel}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OverwriteConfirmation state={state} />
    </>
  );
}
