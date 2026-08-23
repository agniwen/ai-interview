"use client";

import type { CandidateInterviewView } from "@arc/shared/interview/interview-record";
import { cn } from "@arc/shared/utils";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { LocalDateTimeText } from "@/components/features/display/local-date-time-text";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InterviewBackground } from "./interview-background";
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
    <section
      className={cn(
        "grid min-w-0 gap-4 py-8 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-8 sm:py-10 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-12",
        className,
      )}
    >
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] text-muted-foreground tracking-[0.16em]">
          {index}
        </span>
        <h2 className="font-medium text-base tracking-tight sm:text-lg">{title}</h2>
      </div>
      <div className="min-w-0 text-foreground/72 text-sm leading-7">{children}</div>
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
      <InterviewBackground />
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
                    ? `${interviewView.candidateName}，感谢您参加本次面试`
                    : "感谢您参加本次面试"}
                </h1>
              </div>
              <p className="mt-5 max-w-2xl text-foreground/64 text-sm leading-7 sm:text-base">
                开始前，您可以先了解面试安排、公司与岗位信息。准备好后，请按自己的节奏继续。
              </p>

              <dl className="mt-10 grid border-foreground/15 border-y sm:grid-cols-[repeat(3,minmax(0,1fr))] sm:divide-x sm:divide-foreground/15">
                <ScheduleItem
                  label="面试时间"
                  value={
                    <LocalDateTimeText
                      fallback="具体时间请以邀请通知为准"
                      format="long-zh"
                      value={interviewView.currentRoundTime}
                    />
                  }
                />
                <ScheduleItem label="预计用时" value="约 30 分钟" />
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

            <div
              className="divide-y divide-foreground/15 border-foreground/15 border-b"
              data-layout="stacked-context"
            >
              <ContextSection index="01" title="关于公司">
                <p className="whitespace-pre-wrap">
                  {interviewView.companyContext?.trim() ||
                    "暂未提供公司介绍。如需进一步了解，您可以联系招聘负责人。"}
                </p>
              </ContextSection>
              <ContextSection index="02" title="关于岗位">
                <p className="mb-3 font-medium text-foreground text-base">{roleName}</p>
                <MarkdownView
                  className="text-foreground/70 text-sm [&_li]:leading-7 [&_p]:leading-7"
                  content={
                    interviewView.jobDescriptionDescription?.trim() ||
                    "暂未提供岗位介绍。如需进一步了解，您可以联系招聘负责人。"
                  }
                />
              </ContextSection>
            </div>
          </div>
        </ScrollArea>
      </main>
      <InterviewFlowFloatingBar
        actions={
          <Button onClick={onContinue} size="sm">
            {hasForms ? "继续填写信息" : "准备就绪，开始面试"}
          </Button>
        }
        currentStep="preparation"
        hasForms={hasForms}
      />
    </>
  );
}
