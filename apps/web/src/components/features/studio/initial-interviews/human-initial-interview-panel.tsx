import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  INITIAL_INTERVIEW_OVERWRITE_DESCRIPTION,
  initialInterviewKeys,
  isInitialInterviewProcessing,
} from "@app/shared/human-initial-interview";
import type {
  InitialInterviewRoles,
  InitialInterviewTurn,
} from "@app/shared/human-initial-interview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import {
  deleteInitialInterview,
  listInitialInterviews,
  regenerateInitialInterview,
  resumeInitialInterview,
} from "@/lib/client/initial-interviews";
import { InitialInterviewRecording } from "./initial-interview-recording";
import { HumanInitialInterviewCard } from "./human-initial-interview-card";

type GenerationAction =
  | {
      kind: "regenerate";
      snapshotId: string;
      requestId: string;
      turns?: InitialInterviewTurn[];
      roles?: InitialInterviewRoles;
    }
  | {
      kind: "resume";
      versionId: string;
      approvedDocumentId: string | null;
      roles?: InitialInterviewRoles;
    };
type Action = GenerationAction | { kind: "delete"; snapshotId: string };

export function HumanInitialInterviewPanel({
  slug,
  recordId,
  effectiveVersionId,
  canManage,
}: {
  slug: string;
  recordId: string;
  stage: string;
  pipelineVersion: number;
  effectiveVersionId?: string | null;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState<{
    action: Action;
    documentId: string | null;
  } | null>(null);
  const query = useQuery({
    queryFn: () => listInitialInterviews(slug, recordId),
    queryKey: initialInterviewKeys.list(slug, recordId),
    refetchInterval: (state) =>
      state.state.data?.records.some((record) =>
        isInitialInterviewProcessing(record.latestVersion.status),
      )
        ? 3000
        : false,
  });
  const statusKey = query.data?.records
    .map((record) => `${record.latestVersion.id}:${record.latestVersion.status}`)
    .join("|");
  useEffect(() => {
    if (statusKey) {
      void queryClient.invalidateQueries({ queryKey: ["studio-resumes", slug] });
    }
  }, [queryClient, slug, statusKey]);
  const canGenerate = canManage && Boolean(query.data?.canGenerate);
  const mutation = useMutation({
    mutationFn: async ({ action, documentId }: { action: Action; documentId: string | null }) => {
      if (action.kind === "delete") {
        return await deleteInitialInterview(slug, recordId, action.snapshotId);
      }
      if (action.kind === "resume") {
        return await resumeInitialInterview(slug, recordId, action.versionId, {
          overwriteDocumentId: documentId,
          roles: action.roles,
        });
      }
      return await regenerateInitialInterview(slug, recordId, action.snapshotId, {
        overwriteDocumentId: documentId,
        requestId: action.requestId,
        roles: action.roles,
        turns: action.turns,
      });
    },
    onError: (error) => toast.error(error.message),
    onSuccess: async (_result, { action }) => {
      setConfirmation(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: initialInterviewKeys.list(slug, recordId) }),
        queryClient.invalidateQueries({ queryKey: ["initial-interview-detail", slug, recordId] }),
        queryClient.invalidateQueries({ queryKey: ["studio-resumes", slug] }),
      ]);
      toast.success(action.kind === "delete" ? "已删除人工初面记录" : "已提交，评价表正在后台生成");
    },
  });
  async function prepare(action: GenerationAction) {
    const fresh = await query.refetch();
    if (fresh.error) {
      toast.error(fresh.error.message);
      return;
    }
    const documentId = fresh.data?.document?.documentId ?? null;
    if (documentId && (action.kind !== "resume" || action.approvedDocumentId !== documentId)) {
      setConfirmation({ action, documentId });
    } else {
      mutation.mutate({ action, documentId });
    }
  }
  const confirmationLabel = confirmation?.action.kind === "delete" ? "确认删除" : "覆盖并生成";
  return (
    <section className="flex flex-col gap-4" aria-label="人工初面">
      {query.isPending ? <Skeleton className="h-44 w-full rounded-lg" /> : null}
      {query.error ? (
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="text-destructive text-sm">
            {query.error.message}
          </p>
          <Button
            onClick={() => {
              void query.refetch();
            }}
            size="sm"
            variant="outline"
          >
            重试
          </Button>
        </div>
      ) : null}
      {query.data?.records.length === 0 ? (
        <Frame>
          <FrameHeader>
            <FrameTitle>人工初面</FrameTitle>
          </FrameHeader>
          <FramePanel>
            <Empty>
              <EmptyHeader>
                <EmptyDescription>
                  HR 电话沟通结束后，可在 Echo
                  中使用当前录音生成评价表。招聘台会独立保存录音和资料。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </FramePanel>
        </Frame>
      ) : null}
      {query.data?.records.map((record) => (
        <div key={record.id} className="flex min-w-0 flex-col gap-4">
          <HumanInitialInterviewCard
            record={record}
            canGenerate={canGenerate}
            canDelete={Boolean(query.data.canDelete)}
            pending={mutation.isPending}
            effective={effectiveVersionId === record.latestVersion.id}
            documentUrl={query.data.document?.documentUrl ?? null}
            onRegenerate={() => {
              void prepare({
                kind: "regenerate",
                requestId: crypto.randomUUID(),
                snapshotId: record.id,
              });
            }}
            onResume={() => {
              void prepare({
                approvedDocumentId: record.latestVersion.overwriteDocumentId,
                kind: "resume",
                versionId: record.latestVersion.id,
              });
            }}
            onDelete={() =>
              setConfirmation({
                action: { kind: "delete", snapshotId: record.id },
                documentId: null,
              })
            }
          />
          <InitialInterviewRecording slug={slug} recordId={recordId} snapshotId={record.id} />
        </div>
      ))}
      <Dialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) {
            setConfirmation(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmation?.action.kind === "delete"
                ? "删除人工初面记录？"
                : "覆盖现有 HR 初面内容？"}
            </DialogTitle>
            <DialogDescription>
              {confirmation?.action.kind === "delete"
                ? "删除此人工初面的资料与评价版本，并解除由其创建的飞书评价表关联。Echo 原录音和飞书原文档保留。"
                : INITIAL_INTERVIEW_OVERWRITE_DESCRIPTION}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={mutation.isPending}
              onClick={() => setConfirmation(null)}
              variant="outline"
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
              {mutation.isPending ? "处理中…" : confirmationLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
