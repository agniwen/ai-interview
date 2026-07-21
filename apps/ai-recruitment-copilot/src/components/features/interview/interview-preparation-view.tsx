"use client";

import type { CandidateInterviewView } from "@arc/shared/interview/interview-record";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InterviewFlowFloatingBar } from "./interview-flow-floating-bar";
import { InterviewRules } from "./interview-rules";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "long",
  timeStyle: "short",
});

function formatInterviewTime(value: string | Date | null) {
  if (!value) {
    return "以邀请通知为准";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "以邀请通知为准" : DATE_TIME_FORMATTER.format(date);
}

function ContextSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="px-5 py-7 sm:px-7 sm:py-8">
      <h2 className="font-medium text-sm sm:text-base">{title}</h2>
      <div className="mt-3 min-w-0 text-foreground/75 text-sm leading-7">{children}</div>
    </section>
  );
}

export function InterviewPreparationView({
  hasForms,
  interviewView,
  onContinue,
  recordingEnabled,
}: {
  hasForms: boolean;
  interviewView: CandidateInterviewView;
  onContinue: () => void;
  recordingEnabled: boolean;
}) {
  const roleName = interviewView.jobDescriptionName ?? interviewView.targetRole ?? "当前岗位";
  const questionCount = interviewView.interviewQuestions.length;

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20 bg-[url('/textures/interview-prep-light.png')] bg-center bg-cover bg-no-repeat dark:bg-[url('/textures/interview-prep-dark.png')]"
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-white/5 dark:hidden" />
      <div className="fixed top-4 right-4 z-20 rounded-md bg-background/20 p-1 backdrop-blur-sm">
        <ThemeToggle />
      </div>

      <main className="relative h-dvh w-full select-none">
        <ScrollArea className="h-full w-full">
          <div className="mx-auto flex w-full max-w-5xl flex-col px-5 pt-12 pb-40 sm:px-6 sm:pt-20 sm:pb-36 md:pt-16">
            <header className="max-w-3xl">
              <h1 className="text-balance text-2xl tracking-tight sm:text-4xl">
                {interviewView.candidateName
                  ? `${interviewView.candidateName}，先了解一下这次面试`
                  : "先了解一下这次面试"}
              </h1>
              <p className="mt-3 max-w-2xl text-muted-foreground text-sm leading-6 sm:text-base">
                开始前花几分钟了解公司、岗位和完整流程。准备充分后，再进入信息填写与 AI 面试。
              </p>
            </header>

            <div className="relative mt-10 grid overflow-hidden rounded-xl border border-input bg-background/70 shadow-xs/5 before:pointer-events-none before:absolute before:inset-px before:rounded-[calc(var(--radius-xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] backdrop-blur-xl dark:bg-background/65 dark:before:shadow-[0_-1px_--theme(--color-white/8%)] lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="divide-y divide-border/60">
                <ContextSection title="关于公司">
                  <p className="whitespace-pre-wrap">
                    {interviewView.companyContext?.trim() || "公司暂未提供详细介绍。"}
                  </p>
                </ContextSection>
                <ContextSection title={roleName}>
                  <MarkdownView
                    className="text-foreground/75 text-sm [&_li]:leading-7 [&_p]:leading-7"
                    content={
                      interviewView.jobDescriptionDescription?.trim() || "岗位暂未提供详细说明。"
                    }
                  />
                </ContextSection>
              </div>

              <aside className="border-border/60 border-t lg:border-t-0 lg:border-l">
                <h2 className="px-5 pt-7 font-medium text-base sm:px-7 lg:pt-8">本轮安排</h2>
                <dl className="mt-5 divide-y divide-border/60 text-sm">
                  <div className="grid gap-1 px-5 pb-3 sm:px-7">
                    <dt className="text-muted-foreground text-xs">面试时间</dt>
                    <dd className="leading-6">
                      {formatInterviewTime(interviewView.currentRoundTime)}
                    </dd>
                  </div>
                  <div className="grid gap-1 px-5 py-3 sm:px-7">
                    <dt className="text-muted-foreground text-xs">预计用时</dt>
                    <dd>20 分钟内</dd>
                  </div>
                  <div className="grid gap-1 px-5 pt-3 pb-7 sm:px-7 lg:pb-8">
                    <dt className="text-muted-foreground text-xs">面试内容</dt>
                    <dd>
                      {interviewView.currentRoundLabel ?? "AI 面试"}
                      {questionCount > 0 ? ` · ${questionCount} 题` : ""}
                    </dd>
                  </div>
                </dl>
              </aside>
            </div>

            <section className="mt-10 border-border/70 border-b">
              <div className="border-border/60 border-b py-5">
                <h2 className="font-medium text-base">面试注意事项</h2>
                <p className="mt-1 text-muted-foreground text-xs sm:text-sm">
                  确认以下事项后再继续，正式开始前还会进行一次设备检测。
                </p>
              </div>
              <InterviewRules recordingEnabled={recordingEnabled} />
            </section>
          </div>
        </ScrollArea>
      </main>
      <InterviewFlowFloatingBar
        actions={
          <Button onClick={onContinue} size="sm">
            {hasForms ? "确认信息，开始填写" : "确认信息，进入面试准备"}
          </Button>
        }
        currentStep="preparation"
        hasForms={hasForms}
      />
    </>
  );
}
