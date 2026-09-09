import type { EchoProcessingStatus } from "../../../../../preload/echo-processing-api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { echoProcessingOwner, hasEchoProcessing } from "@/lib/client/echo-processing";
import { Button } from "@/components/ui/button";
import { Frame, FramePanel } from "@/components/ui/frame";
import type { MeetingAccessRole } from "@app/shared/meeting-recording";
import type { EchoTranscript } from "@app/shared/meeting-device-processing";
import type { MeetingTranscriptResult } from "@app/shared/meeting-transcription";
import { meetingTranscriptRevisionProviderSchema } from "@app/shared/meeting-transcription";

export function useEchoLocalProcessing(slug: string, meetingId: string, enabled = true) {
  const session = authClient.useSession();
  const accountId = session.data?.user.id;
  const native = hasEchoProcessing();
  return useQuery({
    enabled: native && enabled && Boolean(accountId),
    queryFn: async () => {
      const [status, results] = await Promise.all([
        window.api.echoProcessing.status(meetingId, accountId),
        window.api.echoProcessing.localResults(meetingId, accountId),
      ]);
      return { results, status };
    },
    queryKey: ["echo-local-processing", slug, meetingId, accountId],
    refetchInterval: 2000,
  });
}

export function localTranscriptResult(transcript: EchoTranscript): MeetingTranscriptResult {
  return {
    error: null,
    revision: {
      ...transcript,
      basedOnRevisionId: null,
      createdAt: new Date(0).toISOString(),
      createdBy: null,
      id: transcript.revisionId,
      kind: "final",
      provider: meetingTranscriptRevisionProviderSchema.parse(transcript.provider),
      revision: 1,
      turns: transcript.turns.map((turn, sequence) => ({
        ...turn,
        sequence,
        speakerDisplayName: turn.speakerDisplayName ?? null,
      })),
    },
    state: "ready",
  };
}

function processingTitle(state: string, waitingOnAnotherDevice = false): string {
  switch (state) {
    case "complete": {
      return "处理及云端同步已完成";
    }
    case "failed":
    case "paused": {
      return "处理已暂停，本地数据已保留";
    }
    case "deleting": {
      return "正在永久清理，Echo 会在后台继续";
    }
    case "deleted": {
      return "已永久清除";
    }
    case "unbound": {
      return waitingOnAnotherDevice ? "等待原处理设备继续" : "等待在此设备继续处理";
    }
    default: {
      return "Echo 正在后台处理";
    }
  }
}
function processingDescription(status: {
  audioReleased: boolean;
  state: string;
  tasks: { state: string }[];
}): string {
  if (status.audioReleased) {
    return "本地音频已释放，文字结果仍保留。";
  }
  if (status.state === "processing") {
    const done = status.tasks.filter((task) => task.state === "succeeded").length;
    return `${done}/${status.tasks.length} 项完成。关闭窗口后仍会继续；退出应用后暂停。`;
  }
  return "完成前保留本地音频及结果，完成后可手动释放音频。";
}

function EchoProcessingControls({
  status,
  pending,
  canAdopt,
  onAction,
}: {
  status: EchoProcessingStatus;
  pending: boolean;
  canAdopt: boolean;
  onAction: (kind: "adopt" | "retry" | "release") => void;
}) {
  return (
    <>
      {" "}
      {canAdopt ? (
        <Button disabled={pending} onClick={() => onAction("adopt")} size="sm">
          在此设备继续处理
        </Button>
      ) : null}
      {status.state === "failed" || status.state === "paused" ? (
        <Button disabled={pending} onClick={() => onAction("retry")} size="sm" variant="outline">
          重试未完成任务
        </Button>
      ) : null}
      {status.state === "complete" &&
      !status.audioReleased &&
      status.tasks.some((task) => task.kind === "backup") ? (
        <Button disabled={pending} onClick={() => onAction("release")} size="sm" variant="outline">
          释放本地音频
        </Button>
      ) : null}
    </>
  );
}

export function EchoProcessingPanel({
  slug,
  meetingId,
  accessRole,
}: {
  slug: string;
  meetingId: string;
  accessRole?: MeetingAccessRole;
}) {
  const queryClient = useQueryClient();
  const local = useEchoLocalProcessing(slug, meetingId);
  const native = hasEchoProcessing();
  const canManage = [undefined, "owner", "administrator"].includes(accessRole);
  const status = local.data?.status;
  const context = useQuery({
    enabled:
      native &&
      Boolean(slug) &&
      canManage &&
      ["unbound", "failed", "paused"].includes(status?.state ?? ""),
    queryFn: async () =>
      window.api.echoProcessing.context({ ...(await echoProcessingOwner(slug)), meetingId }),
    queryKey: ["echo-processing-location", slug, meetingId],
    retry: false,
  });
  const action = useMutation({
    mutationFn: async (kind: "adopt" | "retry" | "release") => {
      if (kind === "adopt") {
        await window.api.echoProcessing.adopt({ ...(await echoProcessingOwner(slug)), meetingId });
      } else if (kind === "retry") {
        await window.api.echoProcessing.retry(meetingId);
      } else {
        await window.api.echoProcessing.releaseAudio(meetingId);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["echo-local-processing", slug, meetingId] });
    },
  });
  if (!native) {
    return (
      <p className="text-muted-foreground text-sm">
        请在 Echo 中继续处理；网页可查看、编辑和导出已有内容。
      </p>
    );
  }
  if (!status || (status.state === "unbound" && context.data?.complete)) {
    return null;
  }
  const title = processingTitle(status.state, context.data?.waitingOnAnotherDevice);
  const description = processingDescription(status);
  const error = action.error?.message ?? context.error?.message ?? status.error;
  return (
    <Frame>
      <FramePanel className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-muted-foreground text-xs">{description}</p>
          {error ? <p className="mt-1 text-destructive text-xs">{error}</p> : null}
        </div>
        <EchoProcessingControls
          status={status}
          pending={action.isPending}
          canAdopt={canManage && Boolean(context.data?.canAdopt)}
          onAction={action.mutate}
        />
      </FramePanel>
    </Frame>
  );
}
