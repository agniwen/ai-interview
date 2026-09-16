"use client";

import { useAgent, useLocalParticipant } from "@livekit/components-react";
import { readInterviewResumeState, writeInterviewResumeState } from "./interview-resume-state";
import { IconClockHour3 } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { cn } from "@app/shared/utils";

function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const mm = minutes.toString().padStart(2, "0");
  const ss = secs.toString().padStart(2, "0");
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Counts up from `startedAt` (ms). When `startedAt` is null the timer is
 * hidden. Designed to sit in the interview session chrome as a ticking
 * elapsed-time display.
 */
export function InterviewTimer({
  startedAt,
  className,
}: {
  startedAt: number | null;
  className?: string;
}) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (startedAt === null) {
      return;
    }
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  if (startedAt === null) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));

  return (
    <div
      aria-label="面试时长"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-3 py-1.5 font-mono text-sm tabular-nums shadow-sm backdrop-blur",
        className,
      )}
    >
      <IconClockHour3 className="size-3.5 text-muted-foreground" />
      <span>{formatElapsed(elapsedSeconds)}</span>
    </div>
  );
}

export function AgentSpeechTimer({
  roomName,
  storageKey,
}: {
  roomName: string;
  storageKey: string;
}) {
  const { state } = useAgent();
  const { isMicrophoneEnabled } = useLocalParticipant();
  const [startedAt, setStartedAt] = useState<number | null>(() => {
    const saved = readInterviewResumeState(storageKey);
    return saved?.roomName === roomName ? saved.startedAt : null;
  });

  useEffect(() => {
    if (startedAt === null && state === "speaking") {
      // oxlint-disable-next-line react/set-state-in-effect -- This effect intentionally synchronizes state with an external lifecycle.
      setStartedAt(Date.now());
    }
  }, [state, startedAt]);

  useEffect(() => {
    writeInterviewResumeState(storageKey, {
      microphoneEnabled: isMicrophoneEnabled,
      roomName,
      startedAt,
    });
  }, [isMicrophoneEnabled, roomName, startedAt, storageKey]);

  return <InterviewTimer startedAt={startedAt} />;
}
