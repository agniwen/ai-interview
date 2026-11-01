"use client";

import { IconLoader2, IconRefresh } from "@tabler/icons-react";
import type { CandidateInterviewView } from "@app/shared/interview/interview-record";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { InterviewEntryBackground } from "./interview-background";
import type { InterviewEntryStage } from "./interview-entry-view";
import { PreInterviewFormsView } from "./pre-interview-forms-view";
import type { FormsPayload } from "./pre-interview-forms/types";
import { hasPendingPreInterviewForms } from "./pre-interview-forms/helpers";

function InterviewEntryState({
  error,
  loading,
  onRetry,
}: {
  error: string | null;
  loading: boolean;
  onRetry: () => void;
}) {
  return (
    <>
      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <main className="relative isolate flex min-h-dvh items-center justify-center bg-background px-5">
        <InterviewEntryBackground />
        <div className="flex max-w-sm flex-col items-center text-center">
          {loading ? <IconLoader2 className="size-5 animate-spin text-muted-foreground" /> : null}
          <h1 className="mt-4 font-medium text-lg">
            {loading ? "正在准备面试信息" : "暂时未能载入面试信息"}
          </h1>
          {loading ? null : <p className="mt-2 text-muted-foreground text-sm leading-6">{error}</p>}
          {loading ? null : (
            <Button className="mt-5 gap-2" onClick={onRetry} type="button" variant="outline">
              <IconRefresh className="size-4" />
              再试一次
            </Button>
          )}
        </div>
      </main>
    </>
  );
}

export function InterviewPreSessionFlow({
  entryLoadError,
  formsBound,
  formsPayload,
  interviewId,
  interviewView,
  isLoading,
  isRecovering,
  isRoundCompleted,
  onFormsBack,
  onRetry,
  renderEntry,
  roundId,
  waitingView,
}: {
  entryLoadError: string | null;
  formsBound: boolean;
  formsPayload: FormsPayload | null;
  interviewId: string;
  interviewView: CandidateInterviewView | null;
  isLoading: boolean;
  isRecovering: boolean;
  isRoundCompleted: boolean;
  onFormsBack: () => void;
  onRetry: () => void;
  renderEntry: (
    stage: InterviewEntryStage,
    interviewView: CandidateInterviewView,
    hasForms: boolean,
  ) => React.ReactNode;
  roundId: string;
  waitingView: React.ReactNode;
}) {
  if (isLoading || entryLoadError || !interviewView || !formsPayload) {
    return (
      <InterviewEntryState
        error={entryLoadError}
        loading={isLoading && !entryLoadError}
        onRetry={onRetry}
      />
    );
  }

  if (isRoundCompleted || isRecovering) {
    return waitingView;
  }

  const hasForms = formsPayload.required.length > 0;
  if (!hasPendingPreInterviewForms(formsPayload)) {
    return renderEntry("ready", interviewView, hasForms);
  }
  if (!formsBound) {
    return renderEntry("welcome", interviewView, hasForms);
  }

  return (
    <PreInterviewFormsView
      initialPayload={formsPayload}
      interviewId={interviewId}
      onBack={onFormsBack}
      roundId={roundId}
    >
      {renderEntry("ready", interviewView, hasForms)}
    </PreInterviewFormsView>
  );
}
