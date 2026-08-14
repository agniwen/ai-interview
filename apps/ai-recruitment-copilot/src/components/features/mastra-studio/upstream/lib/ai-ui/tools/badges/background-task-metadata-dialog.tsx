import { Button } from "@mastra/playground-ui/components/Button";
import { CodeEditor } from "@mastra/playground-ui/components/CodeEditor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@mastra/playground-ui/components/Dialog";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { toSigFigs } from "@mastra/playground-ui/utils/number";
import { Loader2Icon, Share2 } from "lucide-react";
import { useState } from "react";
import { useTimeDiff } from "../../hooks/use-time-diff";
import {
  useGetBackgroundTaskById,
  useBackgroundTaskStream,
} from "@/components/features/mastra-studio/upstream/hooks/use-background-tasks";

interface BackgroundTaskMetadataProps {
  backgroundTaskTaskId: string;
  backgroundTaskStartedAt: Date;
  backgroundTaskCompletedAt?: Date;
  backgroundTaskSuspendedAt?: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getEndedAt = (completedAt?: Date, suspendedAt?: Date) => {
  if (completedAt) {
    return new Date(completedAt).getTime();
  }
  return suspendedAt ? new Date(suspendedAt).getTime() : undefined;
};

const BackgroundTaskMetadata = ({
  backgroundTaskTaskId,
  backgroundTaskStartedAt,
  backgroundTaskCompletedAt,
  backgroundTaskSuspendedAt,
  open,
  onOpenChange,
}: BackgroundTaskMetadataProps) => {
  const { data: task } = useGetBackgroundTaskById(
    backgroundTaskTaskId,
    !!backgroundTaskCompletedAt || !!backgroundTaskSuspendedAt,
  );
  const { tasks } = useBackgroundTaskStream({
    enabled: !backgroundTaskCompletedAt && !backgroundTaskSuspendedAt,
    taskId: backgroundTaskTaskId,
  });

  const timeDiff = useTimeDiff({
    endedAt: getEndedAt(backgroundTaskCompletedAt, backgroundTaskSuspendedAt),
    startedAt: new Date(backgroundTaskStartedAt).getTime(),
  });

  const backgroundTask = task || tasks[backgroundTaskTaskId];

  const args = backgroundTask?.args;
  const result = backgroundTask?.result;
  const suspendPayload = backgroundTask?.suspendPayload;

  let argSlot = null;

  try {
    const {
      __mastraMetadata: _,
      _background,
      ...formattedArgs
    } = typeof args === "object" ? args : JSON.parse(args);
    argSlot = <CodeEditor data={formattedArgs} />;
  } catch {
    argSlot = (
      <pre className="whitespace-pre bg-surface4 p-4 rounded-md overflow-x-auto">
        {args as unknown as string}
      </pre>
    );
  }

  const resultSlot =
    typeof result === "string" ? (
      <pre className="whitespace-pre bg-surface4 p-4 rounded-md overflow-x-auto">{result}</pre>
    ) : (
      <CodeEditor
        data={result as Record<string, unknown> | Record<string, unknown>[] | undefined}
      />
    );

  const suspendPayloadSlot =
    typeof suspendPayload === "string" ? (
      <pre className="whitespace-pre bg-surface4 p-4 rounded-md overflow-x-auto">
        {suspendPayload}
      </pre>
    ) : (
      <CodeEditor
        data={suspendPayload as Record<string, unknown> | Record<string, unknown>[] | undefined}
      />
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>后台任务元数据</DialogTitle>
          <DialogDescription>查看后台任务的元数据。</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Txt className="text-neutral3">后台任务耗时</Txt>
            <Txt className="text-neutral6 text-ui-md">{toSigFigs(timeDiff, 3)}ms</Txt>
          </div>

          <div className="space-y-2">
            <Txt className="text-neutral3">后台任务参数</Txt>
            {argSlot}
          </div>

          {suspendPayloadSlot !== undefined && Boolean(suspendPayload) && (
            <div className="space-y-2">
              <Txt className="text-neutral3">后台任务挂起数据</Txt>
              {suspendPayloadSlot}
            </div>
          )}

          {resultSlot !== undefined && Boolean(result) && (
            <div className="space-y-2">
              <Txt className="text-neutral3">后台任务结果</Txt>
              {resultSlot}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};

export interface BackgroundTaskMetadataDialogTriggerProps {
  backgroundTask: {
    taskId: string;
    startedAt: Date;
    completedAt?: Date;
    suspendedAt?: Date;
  };
}

export const BackgroundTaskMetadataDialogTrigger = ({
  backgroundTask,
}: BackgroundTaskMetadataDialogTriggerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button
        variant="default"
        size="icon-md"
        tooltip="查看后台任务信息"
        onClick={() => setIsOpen((s) => !s)}
      >
        {backgroundTask.completedAt || backgroundTask.suspendedAt ? (
          <Share2 className="text-neutral3 size-5" />
        ) : (
          <Loader2Icon className="text-neutral3 size-5 animate-spin" />
        )}
      </Button>

      <BackgroundTaskMetadata
        backgroundTaskTaskId={backgroundTask.taskId}
        backgroundTaskStartedAt={backgroundTask.startedAt}
        backgroundTaskCompletedAt={backgroundTask.completedAt}
        backgroundTaskSuspendedAt={backgroundTask.suspendedAt}
        open={isOpen}
        onOpenChange={setIsOpen}
      />
    </>
  );
};
