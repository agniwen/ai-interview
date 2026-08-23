"use client";

import { IconLoader2, IconRefresh } from "@tabler/icons-react";
import type { CandidateInterviewView } from "@arc/shared/interview/interview-record";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { InterviewBackground } from "./interview-background";
import { InterviewPreparationView } from "./interview-preparation-view";
import { PreInterviewFormsView } from "./pre-interview-forms-view";
import type { FormsPayload } from "./pre-interview-forms/types";

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
      <InterviewBackground />
      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <main className="flex min-h-dvh items-center justify-center px-5">
        <div className="flex max-w-sm flex-col items-center text-center">
          {loading ? <IconLoader2 className="size-5 animate-spin text-muted-foreground" /> : null}
          <h1 className="mt-4 font-medium text-lg">
            {loading ? "正在准备面试信息" : "暂时未能载入面试信息"}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {loading ? "请稍候，我们正在核对本轮安排与必要信息。" : error}
          </p>
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
  formsPayload,
  interviewId,
  interviewView,
  isLoading,
  isRecovering,
  isRoundCompleted,
  onPreparationBack,
  onPreparationConfirmed,
  onRetry,
  preparationConfirmed,
  roundId,
  waitingView,
}: {
  entryLoadError: string | null;
  formsPayload: FormsPayload | null;
  interviewId: string;
  interviewView: CandidateInterviewView | null;
  isLoading: boolean;
  isRecovering: boolean;
  isRoundCompleted: boolean;
  onPreparationBack: () => void;
  onPreparationConfirmed: () => void;
  onRetry: () => void;
  preparationConfirmed: boolean;
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
  if (!preparationConfirmed) {
    return (
      <InterviewPreparationView
        hasForms={hasForms}
        interviewView={interviewView}
        onContinue={onPreparationConfirmed}
      />
    );
  }

  return (
    <PreInterviewFormsView
      initialPayload={formsPayload}
      interviewId={interviewId}
      onBack={onPreparationBack}
      roundId={roundId}
    >
      {waitingView}
    </PreInterviewFormsView>
  );
}
