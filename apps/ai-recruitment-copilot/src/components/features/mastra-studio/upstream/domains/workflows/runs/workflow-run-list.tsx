import { AlertDialog } from "@mastra/playground-ui/components/AlertDialog";
import { Skeleton } from "@mastra/playground-ui/components/Skeleton";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import {
  ThreadList,
  ThreadListEmpty,
  ThreadListItem,
  ThreadListItems,
} from "@mastra/playground-ui/components/ThreadList";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { useState } from "react";
import { WorkflowRunStatusIcon } from "../components/workflow-run-status-icon";
import { usePermissions } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-permissions";
import {
  useDeleteWorkflowRun,
  useWorkflowRuns,
} from "@/components/features/mastra-studio/upstream/hooks/use-workflow-runs";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export interface WorkflowRecentRunsProps {
  workflowId: string;
  runId?: string;
}

function formatRunInput(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const input = (snapshot as { context?: { input?: unknown } }).context?.input;
  if (input === undefined || input === null) {
    return null;
  }

  if (typeof input === "string") {
    return input;
  }

  const inputValue =
    typeof input === "object" && input !== null && "output" in input
      ? (input as { output: unknown }).output
      : input;

  try {
    return JSON.stringify(inputValue);
  } catch {
    return null;
  }
}

interface DeleteRunDialogProps {
  open: boolean;
  onOpenChange: (n: boolean) => void;
  onDelete: () => void;
}
const DeleteRunDialog = ({ open, onOpenChange, onDelete }: DeleteRunDialogProps) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>确定要删除吗？</AlertDialog.Title>
        <AlertDialog.Description>
          此操作无法撤销。工作流运行记录将从服务器中永久删除。
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>取消</AlertDialog.Cancel>
        <AlertDialog.Action onClick={onDelete}>继续</AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog>
);

export const WorkflowRecentRuns = ({ workflowId, runId }: WorkflowRecentRunsProps) => {
  const [deleteRunId, setDeleteRunId] = useState<string | null>(null);
  const { canDelete } = usePermissions();

  const canDeleteRun = canDelete("workflows");

  const { Link, paths, navigate } = useLinkComponent();
  const {
    isLoading,
    data: runs,
    setEndOfListElement,
    isFetchingNextPage,
  } = useWorkflowRuns(workflowId);
  const { mutateAsync: deleteRun } = useDeleteWorkflowRun(workflowId);

  const handleDelete = async (targetRunId: string) => {
    try {
      await deleteRun({ runId: targetRunId });
      setDeleteRunId(null);
      navigate(paths.workflowLink(workflowId));
    } catch {
      setDeleteRunId(null);
    }
  };

  const actualRuns = runs || [];

  return (
    <>
      {isLoading ? (
        <div className="p-4">
          <Skeleton className="h-32" />
        </div>
      ) : (
        <div>
          <div className="px-5 pb-2 pt-3 text-left">
            <Txt as="h2" variant="ui-md" className="text-neutral3">
              最近运行记录
            </Txt>
          </div>
          <ThreadList aria-label="工作流运行记录" embedded>
            {actualRuns.length === 0 ? (
              <ThreadListEmpty>运行工作流后，运行记录将显示在这里</ThreadListEmpty>
            ) : (
              <ThreadListItems>
                {actualRuns.map((run) => {
                  const isActiveRun = run.runId === runId;
                  const runInput = isActiveRun ? formatRunInput(run.snapshot) : null;

                  return (
                    <ThreadListItem
                      key={`run-${run.runId}`}
                      as={Link}
                      to={paths.workflowRunLink(workflowId, run.runId)}
                      isActive={isActiveRun}
                      onDelete={canDeleteRun ? () => setDeleteRunId(run.runId) : undefined}
                      deleteLabel="删除运行记录"
                      className="h-auto min-h-0 items-stretch py-1"
                    >
                      <span className="flex w-full min-w-0 items-center gap-2.5 px-1 text-left">
                        {run?.snapshot && typeof run.snapshot === "object" && (
                          <span className="shrink-0">
                            <WorkflowRunStatusIcon status={run.snapshot.status} />
                          </span>
                        )}
                        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                          <span className="flex w-full min-w-0 items-center gap-2 text-xs">
                            <span
                              className="min-w-0 flex-1 truncate font-medium text-neutral5"
                              title={run.runId}
                            >
                              {run.runId}
                            </span>
                            {run?.snapshot &&
                              typeof run.snapshot === "object" &&
                              run.snapshot.timestamp && (
                                <span className="shrink-0 text-neutral3">
                                  {new Intl.DateTimeFormat("zh-CN", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  }).format(run.snapshot.timestamp)}
                                </span>
                              )}
                          </span>
                          {runInput && (
                            <span className="block w-full min-w-0 truncate text-xs text-neutral3">
                              {runInput}
                            </span>
                          )}
                        </span>
                      </span>
                    </ThreadListItem>
                  );
                })}

                {isFetchingNextPage && (
                  <li className="flex justify-center items-center py-2">
                    <Icon>
                      <Spinner />
                    </Icon>
                  </li>
                )}
                <li>
                  <div ref={setEndOfListElement} />
                </li>
              </ThreadListItems>
            )}
          </ThreadList>
        </div>
      )}

      <DeleteRunDialog
        open={!!deleteRunId}
        onOpenChange={() => setDeleteRunId(null)}
        onDelete={() => {
          if (deleteRunId) {
            void handleDelete(deleteRunId);
          }
        }}
      />
    </>
  );
};
