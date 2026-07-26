"use client";

import type { CandidateInterviewView } from "@arc/shared/interview/interview-record";
import { cn } from "@arc/shared/utils";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { LocalDateTimeText } from "@/components/features/display/local-date-time-text";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CandidateAiReviewSection } from "./candidate-ai-review-section";
import { InterviewFlowFloatingBar } from "./interview-flow-floating-bar";

function ContextSection({
  children,
  className,
  index,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  index: string;
  title: string;
}) {
  return (
    <section className={cn("min-w-0 py-8 sm:py-10 lg:py-12", className)}>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] text-muted-foreground tracking-[0.16em]">
          {index}
        </span>
        <h2 className="font-medium text-base tracking-tight sm:text-lg">{title}</h2>
      </div>
      <div className="mt-4 min-w-0 text-foreground/70 text-sm leading-7 sm:pl-8">{children}</div>
    </section>
  );
}

function ScheduleItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1 px-0 py-4 sm:px-6 sm:py-5 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-[11px] text-muted-foreground tracking-wide">{label}</dt>
      <dd className="text-sm leading-6">{value}</dd>
    </div>
  );
}

export function InterviewPreparationView({
  hasForms,
  interviewView,
  onContinue,
}: {
  hasForms: boolean;
  interviewView: CandidateInterviewView;
  onContinue: () => void;
}) {
  const roleName = interviewView.jobDescriptionName ?? interviewView.targetRole ?? "应聘岗位";
  const questionCount = interviewView.interviewQuestions.length;

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20 bg-[url('/textures/interview-prep-light.png')] bg-center bg-cover bg-no-repeat dark:bg-[url('/textures/interview-prep-dark.png')]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-background/45 dark:bg-background/75"
      />
      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <main className="relative h-dvh w-full select-none">
        <ScrollArea className="h-full w-full">
          <div className="mx-auto flex w-full max-w-5xl flex-col px-5 pt-12 pb-40 sm:px-8 sm:pt-20 sm:pb-36 md:pt-16">
            <header>
              <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end lg:gap-16">
                <h1 className="max-w-3xl text-balance text-3xl leading-tight tracking-[-0.03em] sm:text-5xl sm:leading-[1.1]">
                  {interviewView.candidateName
                    ? `${interviewView.candidateName}，开始前先了解这次面试`
                    : "开始前先了解这次面试"}
                </h1>
              </div>

              <dl className="mt-10 grid border-foreground/15 border-y sm:grid-cols-[repeat(3,minmax(0,1fr))] sm:divide-x sm:divide-foreground/15">
                <ScheduleItem
                  label="面试时间"
                  value={
                    <LocalDateTimeText
                      fallback="请以邀请通知为准"
                      format="long-zh"
                      value={interviewView.currentRoundTime}
                    />
                  }
                />
                <ScheduleItem label="预计用时" value="约 20 分钟" />
                <ScheduleItem
                  label="面试内容"
                  value={
                    <>
                      {interviewView.currentRoundLabel ?? "AI 面试"}
                      {questionCount > 0 ? ` · ${questionCount} 题` : ""}
                    </>
                  }
                />
              </dl>
            </header>

            <div className="grid border-foreground/15 border-b lg:grid-cols-[repeat(2,minmax(0,1fr))] lg:divide-x lg:divide-foreground/15">
              <ContextSection className="lg:pr-10" index="01" title="关于公司">
                <p className="whitespace-pre-wrap">
                  {interviewView.companyContext?.trim() ||
                    "公司介绍暂未补充，您可以先从岗位要求了解。"}
                </p>
              </ContextSection>
              <ContextSection
                className="border-foreground/15 border-t lg:border-t-0 lg:pl-10"
                index="02"
                title={roleName}
              >
                <MarkdownView
                  className="text-foreground/70 text-sm [&_li]:leading-7 [&_p]:leading-7"
                  content={
                    interviewView.jobDescriptionDescription?.trim() ||
                    "岗位说明暂未补充，不影响您继续准备。"
                  }
                />
              </ContextSection>
            </div>

            <CandidateAiReviewSection review={interviewView.aiReview} />
          </div>
        </ScrollArea>
      </main>
      <InterviewFlowFloatingBar
        actions={
          <Button onClick={onContinue} size="sm">
            {hasForms ? "下一步，填写信息" : "准备好了，开始面试"}
          </Button>
        }
        currentStep="preparation"
        hasForms={hasForms}
      />
    </>
  );
}
