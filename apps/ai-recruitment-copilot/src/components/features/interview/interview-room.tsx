"use client";

import type { LucideIcon } from "lucide-react";
import type { CandidateInterviewView } from "@arc/shared/interview/interview-record";
import { useAgent, useSession } from "@livekit/components-react";
import { ConnectionState, DisconnectReason, RoomEvent, TokenSource } from "livekit-client";
import {
  CheckCircle2Icon,
  MessageSquareTextIcon,
  MicIcon,
  MicOffIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  UserCheckIcon,
  VideoIcon,
  Volume2Icon,
  WifiIcon,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AgentSessionProvider } from "@/components/agents-ui/agent-session-provider";
import { AgentSessionView_01 } from "@/components/agents-ui/blocks/agent-session-view-01";
import { StartAudioButton } from "@/components/agents-ui/start-audio-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { env } from "@/env/client";
import { rpc } from "@/lib/client/rpc";
import { InterviewTimer } from "./interview-timer";
import { PreInterviewFormsView } from "./pre-interview-forms-view";

function AgentSpeechTimer() {
  const { state } = useAgent();
  const [startedAt, setStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (startedAt === null && state === "speaking") {
      setStartedAt(Date.now());
    }
  }, [state, startedAt]);

  return <InterviewTimer startedAt={startedAt} />;
}

interface InterviewRoomProps {
  interviewId: string;
  roundId: string;
}

interface StartOptions {
  muted?: boolean;
}

function resolveStartButtonLabel({
  isConnecting,
  isLoadingStatus,
  muted,
}: {
  isConnecting: boolean;
  isLoadingStatus: boolean;
  muted: boolean;
}) {
  if (isConnecting) {
    return "连接中...";
  }
  if (isLoadingStatus) {
    return "加载中...";
  }
  return muted ? "静音开始" : "开始面试";
}

function resolveTitle(isRoundCompleted: boolean, candidateName: string) {
  if (isRoundCompleted) {
    return "面试已结束";
  }
  if (candidateName) {
    return `你好，${candidateName}`;
  }
  return "欢迎参加面试";
}

function buildSubheading({
  targetRole,
  roundLabel,
  questionCount,
}: {
  targetRole: string | null;
  roundLabel: string | null;
  questionCount: number;
}) {
  const parts: string[] = [];
  if (targetRole) {
    parts.push(targetRole);
  }
  if (roundLabel) {
    parts.push(roundLabel);
  }
  const prefix = parts.join(" · ");
  const countText = questionCount > 0 ? `共 ${questionCount} 题，` : "";
  const trailing = "预计 20 分钟内完成。";
  return prefix ? `${prefix} · ${countText}${trailing}` : `${countText}${trailing}`;
}

function resolveSubheading({
  isRoundCompleted,
  isRecovering,
  questionCount,
  roundLabel,
  targetRole,
}: {
  isRoundCompleted: boolean;
  isRecovering: boolean;
  questionCount: number;
  roundLabel: string | null;
  targetRole: string | null;
}) {
  if (isRoundCompleted) {
    return "本轮面试已结束，如需重新面试请联系管理员。";
  }
  if (isRecovering) {
    return "正在为你重新接入刚才的对话，请稍候...";
  }
  return buildSubheading({ questionCount, roundLabel, targetRole });
}

function RuleItem({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <li className="flex gap-3 py-4 sm:gap-4 sm:py-5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground sm:size-4.5" />
      <div className="flex flex-col gap-1">
        <div className="font-medium text-sm sm:text-base">{title}</div>
        <p className="text-muted-foreground text-xs leading-normal sm:text-sm">{description}</p>
      </div>
    </li>
  );
}

type DeviceCheckStatus = "idle" | "checking" | "passed" | "warning" | "failed";

interface DeviceCheckResult {
  camera: DeviceCheckStatus;
  microphone: DeviceCheckStatus;
  network: DeviceCheckStatus;
  message: string | null;
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function formatMediaError(error: unknown) {
  if (!(error instanceof Error)) {
    return "设备不可用";
  }
  if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
    return "浏览器权限未允许";
  }
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return "未找到可用设备";
  }
  if (error.name === "NotReadableError") {
    return "设备可能被其他应用占用";
  }
  return error.message || "设备不可用";
}

async function checkMediaDevice(constraints: MediaStreamConstraints) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stopStream(stream);
    return { ok: true, reason: null };
  } catch (error) {
    return { ok: false, reason: formatMediaError(error) };
  }
}

function DeviceCheckBadge({ status }: { status: DeviceCheckStatus }) {
  switch (status) {
    case "checking": {
      return <Badge variant="info">检测中</Badge>;
    }
    case "passed": {
      return <Badge variant="success">正常</Badge>;
    }
    case "warning": {
      return <Badge variant="warning">需留意</Badge>;
    }
    case "failed": {
      return <Badge variant="destructive">异常</Badge>;
    }
    default: {
      return <Badge variant="outline">未检测</Badge>;
    }
  }
}

function DeviceCheckItem({
  detail,
  icon: Icon,
  status,
  title,
}: {
  detail: string;
  icon: LucideIcon;
  status: DeviceCheckStatus;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">{title}</span>
        </div>
        <DeviceCheckBadge status={status} />
      </div>
      <p className="mt-2 text-muted-foreground text-xs leading-normal">{detail}</p>
    </div>
  );
}

function DevicePreflightCard({ recordingEnabled }: { recordingEnabled: boolean }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<DeviceCheckResult>({
    camera: "idle",
    message: null,
    microphone: "idle",
    network: "idle",
  });

  const runChecks = useCallback(async () => {
    setChecking(true);
    setResult({
      camera: recordingEnabled ? "checking" : "idle",
      message: "正在检测设备状态...",
      microphone: "checking",
      network: navigator.onLine ? "checking" : "failed",
    });

    if (!navigator.mediaDevices?.getUserMedia) {
      setResult({
        camera: "failed",
        message: "当前浏览器不支持媒体设备检测，请换用新版 Chrome、Edge 或 Safari。",
        microphone: "failed",
        network: navigator.onLine ? "passed" : "failed",
      });
      setChecking(false);
      return;
    }

    const [microphone, camera] = await Promise.all([
      checkMediaDevice({
        audio: { autoGainControl: true, echoCancellation: true, noiseSuppression: true },
      }),
      recordingEnabled
        ? checkMediaDevice({ video: true })
        : Promise.resolve({ ok: true, reason: null }),
    ]);

    const networkStatus = navigator.onLine ? "passed" : "failed";
    const message = (() => {
      if (!microphone.ok) {
        return `麦克风不可用：${microphone.reason}。可以先检查权限，或使用「静音开始」进入文字沟通。`;
      }
      if (recordingEnabled && !camera.ok) {
        return `摄像头暂不可用：${camera.reason}。面试仍可继续，但录像可能只有音频。`;
      }
      if (networkStatus === "failed") {
        return "浏览器报告当前离线，请恢复网络后再开始。";
      }
      return "设备检测通过，可以开始面试。";
    })();

    let cameraStatus: DeviceCheckStatus = "idle";
    if (recordingEnabled) {
      cameraStatus = camera.ok ? "passed" : "warning";
    }

    setResult({
      camera: cameraStatus,
      message,
      microphone: microphone.ok ? "passed" : "failed",
      network: networkStatus,
    });
    setChecking(false);
  }, [recordingEnabled]);

  return (
    <section className="mt-6 rounded-2xl border border-border bg-background/70 p-4 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-sm">设备检测</h2>
          <p className="mt-1 text-muted-foreground text-xs leading-normal">
            {recordingEnabled
              ? "开始前可快速确认麦克风、摄像头和网络状态。"
              : "开始前可快速确认麦克风和网络状态。"}
          </p>
        </div>
        <Button disabled={checking} onClick={runChecks} size="sm" type="button" variant="outline">
          {checking ? (
            <RefreshCwIcon className="size-4 animate-spin" />
          ) : (
            <CheckCircle2Icon className="size-4" />
          )}
          检测设备
        </Button>
      </div>
      <div
        className={
          recordingEnabled ? "mt-4 grid gap-2 sm:grid-cols-3" : "mt-4 grid gap-2 sm:grid-cols-2"
        }
      >
        <DeviceCheckItem
          detail="确认浏览器可采集你的声音。"
          icon={MicIcon}
          status={result.microphone}
          title="麦克风"
        />
        {recordingEnabled ? (
          <DeviceCheckItem
            detail="确认摄像头可用于面试录像。"
            icon={VideoIcon}
            status={result.camera}
            title="摄像头"
          />
        ) : null}
        <DeviceCheckItem
          detail="读取浏览器当前联网状态。"
          icon={WifiIcon}
          status={result.network}
          title="网络"
        />
      </div>
      <p className="mt-3 min-h-8 text-muted-foreground text-xs leading-normal">
        {result.message ?? "\u00A0"}
      </p>
    </section>
  );
}

function InterviewNoticeDialog({
  acknowledged,
  isLoadingStatus,
  isConnecting,
  onAcknowledgedChange,
  onConfirm,
  onOpenChange,
  open,
  recordingEnabled,
  startOptions,
}: {
  acknowledged: boolean;
  isLoadingStatus: boolean;
  isConnecting: boolean;
  onAcknowledgedChange: (checked: boolean) => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  recordingEnabled: boolean;
  startOptions: StartOptions;
}) {
  const acknowledgementId = useId();
  const startDisabled = !acknowledged || isConnecting || isLoadingStatus;
  const startLabel = resolveStartButtonLabel({
    isConnecting,
    isLoadingStatus,
    muted: !!startOptions.muted,
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>面试注意事项</DialogTitle>
          <DialogDescription>开始后请按以下规则完成本轮 AI 面试。</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border/60 border-border border-y">
          <RuleItem
            description="建议佩戴耳机并在网络稳定的地方作答。若环境嘈杂，可选择「静音开始」，以文字方式与面试官沟通。"
            icon={Volume2Icon}
            title="保持安静的环境"
          />
          <RuleItem
            description="等面试官提完问题再作答，答完等下一题。请围绕问题展开，结合具体项目与经历说明。"
            icon={MessageSquareTextIcon}
            title="一次只答一题"
          />
          <RuleItem
            description="保持严肃与尊重；连续答非所问或跳过题目会影响评分，必要时面试官会结束面试。"
            icon={UserCheckIcon}
            title="认真作答"
          />
          {recordingEnabled ? (
            <RuleItem
              description="面试将通过摄像头全程录制，开始后请保持摄像头开启，期间不能关闭。"
              icon={VideoIcon}
              title="保持摄像头录制"
            />
          ) : null}
          <RuleItem
            description="尽量不要刷新页面或关闭标签页。如遇网络中断，请在 3 分钟内回到本页面，可继续之前的对话；超过 3 分钟本轮将自动结束。"
            icon={TriangleAlertIcon}
            title="保持稳定连接"
          />
        </ul>
        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            id={acknowledgementId}
            checked={acknowledged}
            onCheckedChange={(checked) => onAcknowledgedChange(checked === true)}
          />
          <label className="cursor-pointer" htmlFor={acknowledgementId}>
            我已清楚并同意按上述注意事项完成面试
          </label>
        </div>
        <DialogFooter>
          <Button disabled={startDisabled} onClick={onConfirm} type="button">
            {startOptions.muted ? (
              <MicOffIcon className="size-4" />
            ) : (
              <MicIcon className="size-4" />
            )}
            {startLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WaitingView({
  interviewView,
  isConnecting,
  isLoadingStatus,
  isRoundCompleted,
  isRecovering,
  onStart,
  recordingEnabled,
}: {
  interviewView: CandidateInterviewView | null;
  isConnecting: boolean;
  isLoadingStatus: boolean;
  isRoundCompleted: boolean;
  // 重连恢复中：跳过 RuleItem 与开始按钮，仅展示「正在恢复连接」骨架。
  // Recovery mode: hide rules + start buttons, show only a "reconnecting" hint.
  isRecovering: boolean;
  onStart: (options?: { muted?: boolean }) => void;
  recordingEnabled: boolean;
}) {
  const candidateName = interviewView?.candidateName ?? "";
  const targetRole = interviewView?.targetRole ?? null;
  const roundLabel = interviewView?.currentRoundLabel ?? null;
  const questionCount = interviewView?.interviewQuestions?.length ?? 0;
  const startDisabled = isConnecting || isLoadingStatus;
  const showPreparation = !isRoundCompleted && !isRecovering;
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pendingStartOptions, setPendingStartOptions] = useState<StartOptions>({});
  const subheadingText = resolveSubheading({
    isRecovering,
    isRoundCompleted,
    questionCount,
    roundLabel,
    targetRole,
  });
  const primaryLabel = resolveStartButtonLabel({
    isConnecting,
    isLoadingStatus,
    muted: false,
  });
  const mutedLabel = resolveStartButtonLabel({
    isConnecting,
    isLoadingStatus,
    muted: true,
  });
  const openNotice = (options: StartOptions = {}) => {
    setPendingStartOptions(options);
    setAcknowledged(false);
    setNoticeOpen(true);
  };
  const confirmStart = () => {
    if (!acknowledged) {
      return;
    }
    setNoticeOpen(false);
    onStart(pendingStartOptions);
  };

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20 bg-[url('/textures/interview-prep-light.png')] bg-center bg-cover bg-no-repeat dark:bg-[url('/textures/interview-prep-dark.png')]"
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-white/5 dark:hidden" />
      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <main className="relative flex min-h-dvh w-full select-none flex-col md:items-center md:justify-center">
        <div className="mx-auto flex w-full max-w-2xl flex-col px-5 pt-12  sm:px-2 sm:pt-20 md:pt-16">
          <section>
            <h1 className="text-2xl tracking-tight sm:text-3xl">
              {isRecovering ? "正在恢复面试连接" : resolveTitle(isRoundCompleted, candidateName)}
            </h1>
            <p className="mt-2 text-muted-foreground text-sm sm:text-base">{subheadingText}</p>
          </section>

          {showPreparation ? <DevicePreflightCard recordingEnabled={recordingEnabled} /> : null}

          {showPreparation && (
            <div className="mt-10 hidden items-center gap-3 sm:mt-12 md:flex">
              <Button
                className="h-11 flex-1 gap-2"
                disabled={startDisabled}
                onClick={() => openNotice({ muted: true })}
                size="lg"
                variant="outline"
              >
                <MicOffIcon className="size-4" />
                {mutedLabel}
              </Button>
              <Button
                className="h-11 flex-[2] gap-2"
                disabled={startDisabled}
                onClick={() => openNotice()}
                size="lg"
              >
                <MicIcon className="size-4" />
                {primaryLabel}
              </Button>
            </div>
          )}
        </div>

        {showPreparation && (
          <div className="fixed inset-x-0 bottom-0 z-10 border-border border-t bg-background/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
            <div className="mx-auto flex w-full max-w-md items-center gap-3">
              <Button
                className="h-11 flex-1 gap-2"
                disabled={startDisabled}
                onClick={() => openNotice({ muted: true })}
                variant="outline"
              >
                <MicOffIcon className="size-4" />
                {mutedLabel}
              </Button>
              <Button
                className="h-11 flex-[2] gap-2"
                disabled={startDisabled}
                onClick={() => openNotice()}
              >
                <MicIcon className="size-4" />
                {primaryLabel}
              </Button>
            </div>
          </div>
        )}
      </main>
      <InterviewNoticeDialog
        acknowledged={acknowledged}
        isConnecting={isConnecting}
        isLoadingStatus={isLoadingStatus}
        onAcknowledgedChange={setAcknowledged}
        onConfirm={confirmStart}
        onOpenChange={(open) => {
          setNoticeOpen(open);
          if (!open) {
            setAcknowledged(false);
          }
        }}
        open={noticeOpen}
        recordingEnabled={recordingEnabled}
        startOptions={pendingStartOptions}
      />
    </>
  );
}

export default function InterviewRoom({ interviewId, roundId }: InterviewRoomProps) {
  const interviewRecordingEnabled = env.NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING;
  const [interviewView, setInterviewView] = useState<CandidateInterviewView | null>(null);
  const [roundStatus, setRoundStatus] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  // 镜像 isLoadingStatus 给 TokenSource 闭包用：useSession() 在 mount 时会自动
  // 调一次 prepareConnection 预热，连带触发 token 接口。如果在 fetchStatus 完成
  // 前就让 TokenSource 签 token，会命中 token 接口的 pending 分支把 status 翻
  // 成 in_progress + mint anchor — 之后 fetchStatus 看到 in_progress 会以为是
  // 刚才残留的 in_progress 并自动续连，让用户首次进入跳过了 RuleItem。
  // 这里 gate 住第一次 prepareConnection，让它失败被框架吞掉；之后用户点
  // "开始"或自动续连真正调 session.start 时再签。
  // Mirror isLoadingStatus into a ref the TokenSource closure can read so the
  // mount-time prepareConnection is gated until fetchStatus settles, avoiding
  // the race where pending → in_progress flips before status is read.
  const isLoadingStatusRef = useRef(true);
  useEffect(() => {
    isLoadingStatusRef.current = isLoadingStatus;
  }, [isLoadingStatus]);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await rpc.api.interview[":id"][":roundId"].$get({
          param: { id: interviewId, roundId },
        });
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as CandidateInterviewView;
        if (!cancelled) {
          setInterviewView(data);
          setRoundStatus(data.currentRoundStatus);
        }
      } catch {
        // ignore — will fall through to default state
      } finally {
        if (!cancelled) {
          setIsLoadingStatus(false);
        }
      }
    }

    void fetchStatus();
    // eslint-disable-next-line style/max-statements-per-line
    return () => {
      cancelled = true;
    };
  }, [interviewId, roundId]);

  // 服务端综合 status + anchor + 宽限期算出。覆盖两个场景：
  // - status=interrupted + 仍在 3 分钟宽限内（标准热重连）；
  // - status=in_progress + 已有 anchor（用户在浏览器关闭瞬间 disconnect/beforeunload
  //   信号没送达，状态没翻成 interrupted，但用户回页面仍应直接续连）。
  // Server-derived flag covering both interrupted-in-window AND in_progress with
  // anchors (the disconnect beacon may not always reach the server in time).
  const isRecoverable = interviewView?.currentRoundCanResume ?? false;
  // status='interrupted' 且已过 3 分钟宽限期是中间态：agent 端 grace 已超时
  // 触发 aclose，但 /api/agent/report 把状态翻成 completed 之前会有几秒到
  // 几分钟延迟（取决于 transcript / 录像收尾）。这段时间里 DB 仍是
  // interrupted，但实际已无法重连。这里把"interrupted 且 canResume=false"
  // 视为已结束，避免显示成"准备页面"误导用户点开始。
  // Treat "interrupted-but-not-recoverable" as completed for UI purposes:
  // there is a window between the agent's grace expiring and /api/agent/report
  // flipping the schedule row to completed, during which the DB still says
  // interrupted but the session is effectively over.
  const isRoundCompleted =
    roundStatus === "completed" || (roundStatus === "interrupted" && !isRecoverable);

  // Custom token source so that token-endpoint errors (403/409/410) can flip
  // the page into the appropriate state instead of letting the LiveKit
  // session silently fail.
  const tokenSource = useMemo(
    () =>
      TokenSource.custom(async () => {
        // 阻塞 mount 期 prepareConnection 的预热请求，等 fetchStatus 拿到状态后
        // 再签 token。否则会让 pending 轮次过早被改成 in_progress 并自动续连。
        // Block useSession's mount-time prepareConnection until fetchStatus
        // settles; otherwise it preemptively flips pending → in_progress.
        if (isLoadingStatusRef.current) {
          throw new Error("interview status not loaded yet");
        }
        const response = await rpc.api.interview[":id"][":roundId"]["livekit-token"].$post({
          param: { id: interviewId, roundId },
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            code?: string;
            error?: string;
          } | null;
          // 403: 轮次已结束；410: 重连超过 3 分钟宽限。两者最终都置 completed。
          // 409: 另一窗口/设备占用，留在 WaitingView 由 toast 引导用户。
          // 403/410 → completed; 409 → toast and stay in WaitingView.
          if (response.status === 403 || response.status === 410) {
            setRoundStatus("completed");
          } else if (response.status === 409) {
            toast.error(body?.error ?? "面试已在另一个窗口进行中。");
          }
          throw new Error(body?.error ?? `livekit-token 请求失败（${response.status}）`);
        }

        return (await response.json()) as {
          isReconnect?: boolean;
          participantName: string;
          participantToken: string;
          roomName: string;
          serverUrl: string;
        };
      }),
    [interviewId, roundId],
  );

  const session = useSession(tokenSource, { agentName: env.NEXT_PUBLIC_AGENT_NAME });

  const isDisconnected = session.connectionState === ConnectionState.Disconnected;
  const isConnecting = session.connectionState === ConnectionState.Connecting;
  const wasConnectedRef = useRef(false);
  // 用户主动点"结束面试"时置 true。区分主动结束 vs 网络断连：
  // 前者走 /complete?mode=final 直接置 completed；
  // 后者走 /complete?mode=interrupt 进入热重连窗口。
  // Set when the user clicks "End interview". Distinguishes a deliberate end
  // (final) from a transient drop (interrupt + grace window).
  const userEndedRef = useRef(false);
  // Set when the server (agent's end_call → DeleteRoom, or admin RemoveParticipant)
  // initiates a final disconnect. We can't rely on roundStatus alone because
  // setState propagates async — the auto-rejoin effect may run before the
  // updated isRoundCompleted is observable. The ref short-circuits both the
  // interrupt POST and the rejoin attempt synchronously.
  const agentEndedRef = useRef(false);

  // 订阅 Room 的 disconnected 事件以拿到 reason: agent 调 end_call(delete_room=True)
  // 触发 LiveKit Cloud DeleteRoom, 候选人侧收到 reason=ROOM_DELETED;
  // PARTICIPANT_REMOVED 是管理员 RemoveParticipant. 两者都属于服务端发起的
  // 终态结束, 不应当再走 interrupt + auto-rejoin 流程. ref 同步置位以避免
  // 与 setRoundStatus 的异步渲染竞争.
  // Detect server-initiated final disconnect via the room event's reason
  // (ROOM_DELETED from agent end_call, PARTICIPANT_REMOVED from admin kick).
  // Set the ref synchronously so the connectionState/auto-rejoin effects
  // see it on the same tick, ahead of the async setRoundStatus update.
  useEffect(() => {
    const { room } = session;
    if (!room) {
      return;
    }
    const onDisconnected = (reason?: DisconnectReason) => {
      if (
        reason === DisconnectReason.ROOM_DELETED ||
        reason === DisconnectReason.PARTICIPANT_REMOVED
      ) {
        agentEndedRef.current = true;
        setRoundStatus("completed");
      }
    };
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [session.room]);

  // 监听硬断连：
  // - 主动结束（userEndedRef=true）：handleEndInterview 已经发过 final，这里跳过；
  // - agent / 管理员结束（agentEndedRef=true）：上面的 onDisconnected 已置 completed，这里跳过；
  // - 被动断连：发 ?mode=interrupt 进入 3 分钟宽限。
  // Distinguish deliberate end (user/agent/admin) from passive drop: only
  // passive drops trigger the interrupt POST that opens the grace window.
  useEffect(() => {
    if (session.connectionState === ConnectionState.Connected) {
      wasConnectedRef.current = true;
      return;
    }
    if (session.connectionState === ConnectionState.Disconnected && wasConnectedRef.current) {
      wasConnectedRef.current = false;
      if (userEndedRef.current) {
        // 主动结束：完成态由 handleEndInterview 写入，这里只清标记。
        // Deliberate end: final state already persisted, just clear the flag.
        userEndedRef.current = false;
        return;
      }
      if (agentEndedRef.current) {
        // 服务端结束: agent 的 _on_session_end 会回写 /api/agent/report 把
        // 轮次置为 completed; 这里不再走 interrupt 路径, 也不重置 flag (留给
        // auto-rejoin effect 再读一次), 避免与短时间内的连续状态翻转打架.
        return;
      }
      void rpc.api.interview[":id"][":roundId"].complete.$post(
        { param: { id: interviewId, roundId }, query: { mode: "interrupt" } },
        { init: { keepalive: true } },
      );
    }
  }, [session.connectionState, interviewId, roundId]);

  // beforeunload 兜底信号：用户关闭/刷新标签页时通过 sendBeacon 提前通知后端
  // 进入 interrupted，避免依赖 LiveKit 才发现断开导致延迟。两条路径幂等。
  // 主动结束的用户路径不走这里（handleEndInterview 已写过 final）。
  // Belt-and-suspenders beacon for tab close/refresh, idempotent with the
  // disconnect handler above. Skipped for deliberate-end flow.
  useEffect(() => {
    const onBeforeUnload = () => {
      if (userEndedRef.current) {
        return;
      }
      navigator.sendBeacon(`/api/interview/${interviewId}/${roundId}/complete?mode=interrupt`);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [interviewId, roundId]);

  const [startedMuted, setStartedMuted] = useState(false);
  // 自动续连只触发一次：避免 connectionState 变化或 fetchStatus 重跑时反复 session.start。
  // 失败后会被 reset，让用户能手动点继续。
  // Latched so the auto-rejoin fires once per page load; reset on failure to
  // allow the user to retry manually.
  const autoRejoinTriggeredRef = useRef(false);

  const handleStart = useCallback(
    async (options?: { muted?: boolean }) => {
      setStartedMuted(!!options?.muted);
      try {
        await session.start({
          tracks: {
            // 默认开启摄像头以便服务端 RoomCompositeEgress 录像；
            // 浏览器拒绝权限时 LiveKit 会自动跳过该 track，不影响音频通话。
            // Enable camera by default so server-side RoomCompositeEgress captures
            // video; if the browser denies permission, LiveKit silently skips it.
            camera: {
              enabled: interviewRecordingEnabled,
            },
            microphone: {
              enabled: !options?.muted,
              publishOptions: {
                // @ts-expect-error ignore
                audioCaptureOptions: {
                  autoGainControl: true,
                  echoCancellation: true,
                  noiseSuppression: true,
                },
                // 让浏览器在 room.connect 完成前就开始采集麦克风，连上后通过
                // lk.agent.pre-connect-audio-buffer byte stream 把这段音频喂给
                // agent，避免候选人点"开始"后立刻说话的第一句被吃掉。
                // Capture mic audio before the room connects; LiveKit replays the
                // buffer to the agent on the lk.agent.pre-connect-audio-buffer
                // byte stream so a candidate's first words aren't lost in the
                // ~1-2s connection window.
                preConnectBuffer: true,
              },
            },
          },
        });
      } catch (error) {
        // session.start 内部把 getUserMedia(摄像头/麦克风) 和 room.connect 一起跑.
        // 摄像头侧的 NotFoundError / OverconstrainedError 是纯本机硬件状态
        // (无摄像头、被占用、缓存 deviceId 失效), 跟连接通路无关; 这种情况下
        // 麦克风轨道仍然能发, room 也会照常连上, 应当吞掉错误让面试纯音频继续.
        // 注意 connectionState 不能用来判断: getUserMedia 可能在 room.connect
        // 完成前就 reject, 此时状态还停在 Connecting 甚至 Disconnected.
        // 真正需要 toast + reset latch 的失败是 token 403/410、网络断、
        // 麦克风权限拒绝等连接级错误.
        // session.start runs camera/mic getUserMedia in parallel with
        // room.connect, so connectionState is unreliable when the error
        // surfaces. Device errors are local-only and never break room
        // connectivity, so swallow them unconditionally and continue
        // audio-only. Only network/token/permission failures should toast.
        const isDeviceError =
          error instanceof Error &&
          (error.name === "NotFoundError" ||
            error.name === "OverconstrainedError" ||
            error.name === "DeviceUnsupportedError" ||
            /device not found|requested device/i.test(error.message));
        if (isDeviceError) {
          // eslint-disable-next-line no-console
          console.warn("[interview] camera publish skipped, continuing audio-only:", error);
          return;
        }
        // 失败常见原因：浏览器媒体设备权限被拒、token 接口报错（403/410）、网络中断。
        // 重置 latch 让 WaitingView 退出"恢复中"状态、显示开始按钮供用户重试。
        // Common causes: media-device permission denied, token endpoint
        // returned 403/410, network failure. Clear the latch so the WaitingView
        // exits "recovering" state and shows the retry button.
        autoRejoinTriggeredRef.current = false;
        const message = error instanceof Error ? error.message : "连接失败，请重试";
        // eslint-disable-next-line no-console
        console.error("[interview] session.start failed:", error);
        toast.error(message);
      }
    },
    [interviewRecordingEnabled, session],
  );

  // 刷新返回时若 canResume 为 true：跳过 RuleItem 自动 handleStart 续连。
  // 加 isRoundCompleted 保护，防止主动结束流程里 setRoundStatus("completed")
  // 与 connectionState 变 Disconnected 之间的 race 让 effect 误触发。
  // 同时用 agentEndedRef 兜底: setRoundStatus 是异步的, ref 在 onDisconnected
  // 里同步置位, 这样即使本 effect 在 setRoundStatus 渲染前抢跑也不会自动续连.
  // Auto-trigger handleStart only when the round is genuinely resumable.
  // The isRoundCompleted guard plus agentEndedRef short-circuit cover the
  // race where this effect runs before setRoundStatus("completed") commits.
  useEffect(() => {
    if (
      !isLoadingStatus &&
      !isRoundCompleted &&
      !agentEndedRef.current &&
      isRecoverable &&
      !autoRejoinTriggeredRef.current &&
      session.connectionState === ConnectionState.Disconnected
    ) {
      autoRejoinTriggeredRef.current = true;
      void handleStart();
    }
  }, [isLoadingStatus, isRoundCompleted, isRecoverable, session.connectionState, handleStart]);

  // 用户主动结束面试：先把轮次标 final 落库，再断开 LiveKit。
  // 立刻同步置 roundStatus=completed 与 autoRejoinTriggeredRef=true，
  // 避免 await session.end() 触发 Disconnected 时让 auto-rejoin useEffect
  // 抢先看到 isRecoverable=true（interviewView 还没刷新）误触发恢复流程，
  // 出现"标题：正在恢复 + 副标题：已结束"这种自相矛盾的中间态。
  // userEndedRef 让断连 useEffect 跳过 ?mode=interrupt POST，否则会把刚刚
  // final 的轮次又改回 interrupted。
  // Sync-flush completed state and latch the auto-rejoin guard *before*
  // session.end() to prevent the brief "recovering" UI flash. userEndedRef
  // suppresses the interrupt POST in the disconnect handler.
  const handleEndInterview = useCallback(async () => {
    userEndedRef.current = true;
    setRoundStatus("completed");
    autoRejoinTriggeredRef.current = true;
    try {
      await rpc.api.interview[":id"][":roundId"].complete.$post(
        { param: { id: interviewId, roundId }, query: { mode: "final" } },
        { init: { keepalive: true } },
      );
    } catch {
      // 上报失败不阻断 session.end —— agent 端 grace 超时仍会兜底落 completed。
      // Report failure must not block teardown; agent's grace timeout finalises.
    }
    await session.end();
  }, [interviewId, roundId, session]);

  // isRecovering 决定 WaitingView 是否展示「正在恢复连接」。已结束态强制 false，
  // 避免主动结束流程出现「标题：恢复中 / 副标题：已结束」自相矛盾的中间帧。
  // Force false when the round is completed; otherwise the deliberate-end flow
  // can render a contradictory "recovering / ended" frame for a tick.
  const isRecovering =
    !isRoundCompleted && isRecoverable && (isConnecting || autoRejoinTriggeredRef.current);

  if (isDisconnected || isConnecting) {
    const waitingView = (
      <WaitingView
        interviewView={interviewView}
        isConnecting={isConnecting}
        isLoadingStatus={isLoadingStatus}
        isRecovering={isRecovering}
        isRoundCompleted={isRoundCompleted}
        onStart={handleStart}
        recordingEnabled={interviewRecordingEnabled}
      />
    );
    // 已结束或正在重连：跳过 PreInterviewFormsView 这层。
    // 已结束不需要再填表单；重连时表单一般已交完，包一层只会多一次 forms
    // GET 请求且如果管理员中途新增了全局表单还会卡住"恢复中"提示。
    // Skip the forms gate when round is finished or in mid-reconnect; otherwise
    // the wrapper wastes a /forms fetch and could hide the recovery hint.
    if (isRoundCompleted || isRecovering) {
      return waitingView;
    }
    return (
      <PreInterviewFormsView interviewId={interviewId} roundId={roundId}>
        {waitingView}
      </PreInterviewFormsView>
    );
  }

  return (
    <AgentSessionProvider session={session}>
      <div className="fixed top-4 left-4 z-20">
        <AgentSpeechTimer />
      </div>
      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <main className="relative h-dvh w-full select-none overflow-hidden">
        <AgentSessionView_01
          defaultChatOpen={startedMuted}
          autoOpenChatOnAgentActive={true}
          supportsVideoInput={interviewRecordingEnabled}
          supportsScreenShare={false}
          chatInputEnabled={interviewView?.currentRoundAllowTextInput ?? false}
          onCameraDisableAttempt={
            interviewRecordingEnabled
              ? () => {
                  toast.warning("面试过程中需要保持摄像头录制，请勿关闭摄像头。");
                }
              : undefined
          }
          onDisconnect={handleEndInterview}
          preConnectMessage="正在连线面试官，请稍等..."
        />
      </main>
      <StartAudioButton label="开始通话" />
      <Toaster
        position="top-center"
        icons={{ warning: <TriangleAlertIcon className="size-4" /> }}
      />
    </AgentSessionProvider>
  );
}
