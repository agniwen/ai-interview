"use client";

import type { TablerIcon } from "@tabler/icons-react";
import {
  IconBriefcase,
  IconClock,
  IconInfoCircle,
  IconListNumbers,
  IconMicrophone,
  IconMicrophoneOff,
} from "@tabler/icons-react";
import type { CandidateInterviewView } from "@app/shared/interview/interview-record";
import { cn } from "@app/shared/utils";
import { useId, useState } from "react";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { InterviewEntryBackground } from "./interview-background";
import { interviewSolidButtonClass } from "./interview-button-styles";
import { InterviewDeviceCheck } from "./interview-device-check";
import {
  resolveInterviewStartAvailability,
  useInterviewDevicePermissions,
} from "./interview-device-permissions";
import { InterviewFlowProgress } from "./interview-flow-stepper";
import { InterviewNotice } from "./interview-notice";

export type InterviewEntryStage = "welcome" | "ready";

export interface InterviewStartOptions {
  microphoneDeviceId?: string;
  muted?: boolean;
}

/** Company and canonical JD shown to the candidate before the interview. */
export function InterviewRoleContext({ interviewView }: { interviewView: CandidateInterviewView }) {
  const roleName = interviewView.jobDescriptionName ?? interviewView.targetRole ?? "应聘岗位";

  return (
    <div className="space-y-5 text-left">
      <section>
        <h3 className="text-muted-foreground text-xs">关于岗位</h3>
        <p className="mt-1 font-medium text-sm">{roleName}</p>
        <MarkdownView
          className="mt-2 text-foreground/72 text-sm [&_li]:leading-6 [&_p]:leading-6"
          content={
            interviewView.jobDescriptionPrompt?.trim() ||
            "暂未提供岗位介绍。如需进一步了解，您可以联系招聘负责人。"
          }
        />
      </section>
      <section>
        <h3 className="text-muted-foreground text-xs">关于公司</h3>
        <p className="mt-1 whitespace-pre-wrap text-foreground/72 text-sm leading-6">
          {interviewView.companyContext?.trim() ||
            "暂未提供公司介绍。如需进一步了解，您可以联系招聘负责人。"}
        </p>
      </section>
    </div>
  );
}

function RoleContextHoverCard({ interviewView }: { interviewView: CandidateInterviewView }) {
  const [open, setOpen] = useState(false);
  const roleName = interviewView.jobDescriptionName ?? interviewView.targetRole ?? "岗位与公司";

  return (
    <HoverCard onOpenChange={setOpen} open={open}>
      <HoverCardTrigger
        // Touch screens have no hover; a tap opens the same card and an outside tap closes it.
        render={
          <button
            className="inline-flex min-w-0 items-center gap-1 rounded-sm text-foreground underline decoration-foreground/30 decoration-dotted underline-offset-4 outline-none hover:decoration-foreground/60 focus-visible:ring-[3px] focus-visible:ring-ring/15"
            onClick={() => setOpen(true)}
            type="button"
          >
            <span className="truncate">{roleName}</span>
            <IconInfoCircle aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <HoverCardContent className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <ScrollArea className="max-h-[min(28rem,60dvh)]">
          <div className="p-4">
            <InterviewRoleContext interviewView={interviewView} />
          </div>
        </ScrollArea>
      </HoverCardContent>
    </HoverCard>
  );
}

function DetailRow({
  children,
  icon: Icon,
  label,
}: {
  children: React.ReactNode;
  icon: TablerIcon;
  label: string;
}) {
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 px-3.5 py-2.5">
      <span className="flex shrink-0 items-center gap-2">
        <Icon aria-hidden className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">{label}</span>
      </span>
      <span className="flex min-w-0 items-center justify-end text-muted-foreground text-sm">
        {children}
      </span>
    </li>
  );
}

function InterviewDetails({ interviewView }: { interviewView: CandidateInterviewView }) {
  const headingId = useId();
  const questionCount = interviewView.interviewQuestions.length;

  return (
    <section aria-labelledby={headingId}>
      <h2 className="px-3.5 py-2 text-muted-foreground text-xs" id={headingId}>
        面试信息
      </h2>
      <ul className="divide-y divide-border/70 border-border/70 border-t">
        <DetailRow icon={IconBriefcase} label="应聘岗位">
          <RoleContextHoverCard interviewView={interviewView} />
        </DetailRow>
        <DetailRow icon={IconClock} label="预计时长">
          约 30 分钟
        </DetailRow>
        {questionCount > 0 ? (
          <DetailRow icon={IconListNumbers} label="题目数量">
            {questionCount} 题
          </DetailRow>
        ) : null}
      </ul>
    </section>
  );
}

function EntryCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-transparent bg-card text-left shadow-default">
      {children}
    </div>
  );
}

function ReadyActions({
  busyLabel,
  details,
  onStart,
  recordingEnabled,
}: {
  busyLabel: string | null;
  details: React.ReactNode;
  onStart: (options: InterviewStartOptions) => void;
  recordingEnabled: boolean;
}) {
  const devices = useInterviewDevicePermissions({ cameraEnabled: recordingEnabled });
  const { mutedStartDisabled, voiceStartDisabled } = resolveInterviewStartAvailability({
    isBusy: busyLabel !== null,
    microphoneStatus: devices.microphone.status,
  });
  const microphoneReady = devices.microphone.status === "granted";
  let hint: string | null = null;
  if (!microphoneReady) {
    hint = "请先允许使用麦克风";
  } else if (recordingEnabled) {
    hint = "本轮面试将录像";
  }
  const start = (options: InterviewStartOptions) => {
    // Hand the devices over to LiveKit; some browsers refuse a second capture of the camera.
    devices.release();
    onStart({ ...options, microphoneDeviceId: devices.microphoneStartDeviceId });
  };

  return (
    <>
      <EntryCard>
        {details}
        <InterviewDeviceCheck devices={devices} recordingEnabled={recordingEnabled} />
      </EntryCard>
      <div className="mt-8 flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
        <Button
          className="sm:min-w-28"
          disabled={mutedStartDisabled}
          onClick={() => start({ muted: true })}
          type="button"
          variant="outline"
        >
          <IconMicrophoneOff className="size-4" />
          静音开始
        </Button>
        <Button
          className={cn(interviewSolidButtonClass, "sm:min-w-32")}
          disabled={voiceStartDisabled}
          onClick={() => start({})}
          type="button"
        >
          {busyLabel ? <Spinner /> : <IconMicrophone className="size-4" />}
          {busyLabel ?? "开始面试"}
        </Button>
      </div>
      {hint ? <p className="mt-3 text-muted-foreground text-xs leading-5">{hint}</p> : null}
    </>
  );
}

export function InterviewEntryView({
  busyLabel,
  hasForms,
  interviewView,
  onContinue,
  onStart,
  recordingEnabled,
  stage,
}: {
  busyLabel: string | null;
  hasForms: boolean;
  interviewView: CandidateInterviewView;
  onContinue: () => void;
  onStart: (options: InterviewStartOptions) => void;
  recordingEnabled: boolean;
  stage: InterviewEntryStage;
}) {
  // Options captured on the device step; while set, the notice stands between it and connecting.
  const [pendingStart, setPendingStart] = useState<InterviewStartOptions | null>(null);
  const showNotice = stage === "ready" && pendingStart !== null;

  return (
    <>
      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <main className="relative isolate h-dvh w-full select-none bg-background">
        <InterviewEntryBackground />
        <ScrollArea className="h-full w-full">
          <div
            className={cn(
              "mx-auto flex min-h-dvh w-full flex-col items-center justify-center px-5 py-16 text-center",
              showNotice ? "max-w-2xl" : "max-w-xl",
            )}
          >
            {showNotice ? (
              <InterviewNotice
                busyLabel={busyLabel}
                onBack={() => setPendingStart(null)}
                onConfirm={() => onStart(pendingStart)}
                recordingEnabled={recordingEnabled}
              />
            ) : (
              <>
                {hasForms ? (
                  <InterviewFlowProgress
                    className="mb-10"
                    currentStep={stage === "welcome" ? "preparation" : "interview"}
                    hasForms
                  />
                ) : null}
                <h1 className="text-balance text-3xl tracking-[-0.03em] sm:text-4xl">
                  {interviewView.candidateName
                    ? `欢迎，${interviewView.candidateName}`
                    : "欢迎参加面试"}
                </h1>
                <p className="mt-4 text-pretty text-muted-foreground text-sm leading-6 sm:text-base">
                  这是一场由 AI 面试官主持的语音面试，请用自己的话介绍经历。
                </p>
                <div className="mt-8 flex w-full max-w-sm flex-col items-center">
                  {stage === "ready" ? (
                    <ReadyActions
                      busyLabel={busyLabel}
                      details={<InterviewDetails interviewView={interviewView} />}
                      onStart={setPendingStart}
                      recordingEnabled={recordingEnabled}
                    />
                  ) : (
                    <>
                      <EntryCard>
                        <InterviewDetails interviewView={interviewView} />
                      </EntryCard>
                      <Button
                        className={cn(
                          interviewSolidButtonClass,
                          "mt-8 w-full sm:w-auto sm:min-w-32",
                        )}
                        disabled={busyLabel !== null}
                        onClick={onContinue}
                        type="button"
                      >
                        {busyLabel ? <Spinner /> : null}
                        {busyLabel ?? "开始"}
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </main>
    </>
  );
}
