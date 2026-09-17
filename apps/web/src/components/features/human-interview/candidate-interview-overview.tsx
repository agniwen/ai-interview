import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";
import { formatJobDescriptionForDisplay } from "./job-description-display";
import { MarkdownView } from "@/components/features/display/markdown-view";

interface CandidateInterviewOverviewProps {
  candidateName: string;
  companyContext?: string | null;
  jobDescriptionName: string | null;
  jobDescriptionPrompt: string | null;
  roundLabel: string;
  scheduledAt: string | null;
  message?: string;
  interviewer?: { name: string; role: string };
  children: ReactNode;
}

const invitationDate = new Intl.DateTimeFormat("zh-CN", {
  day: "numeric",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "long",
  timeZone: "Asia/Shanghai",
  year: "numeric",
});

export function CandidateInterviewOverview({
  candidateName,
  companyContext,
  jobDescriptionName,
  jobDescriptionPrompt,
  roundLabel,
  scheduledAt,
  message,
  interviewer,
  children,
}: CandidateInterviewOverviewProps) {
  const date = scheduledAt ? new Date(scheduledAt) : null;
  const hasDate = date !== null && Number.isFinite(date.getTime());

  const jobContent = jobDescriptionPrompt?.trim() ? (
    <MarkdownView
      content={formatJobDescriptionForDisplay(jobDescriptionPrompt)}
      className="text-sm leading-7 [&_p]:whitespace-pre-line"
    />
  ) : (
    <p className="text-sm text-muted-foreground">暂未提供岗位 JD，请联系招聘负责人了解岗位详情。</p>
  );
  const companyDescription = interviewer ? null : companyContext?.trim();

  return (
    <section
      className="grid w-full max-w-5xl items-start gap-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-10 lg:gap-20"
      aria-labelledby="candidate-invitation-title"
    >
      <div
        data-slot="interview-entry-info"
        className="flex min-w-0 flex-col gap-4 pr-1 md:sticky md:top-[clamp(3rem,10dvh,6rem)] md:gap-6 [@media(min-height:800px)]:gap-8"
      >
        <header className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{interviewer ? "面试准备" : "面试邀请"}</p>
          <h1
            id="candidate-invitation-title"
            className="text-balance text-2xl font-semibold leading-tight tracking-normal sm:text-3xl [@media(min-height:800px)]:sm:text-4xl"
          >
            {jobDescriptionName?.trim() || "岗位信息待确认"}
          </h1>
        </header>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 [@media(min-height:800px)]:gap-y-6">
          <div className="flex flex-col gap-1.5">
            <dt className="text-sm text-muted-foreground">候选人姓名</dt>
            <dd className="font-medium">{candidateName}</dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="text-sm text-muted-foreground">面试轮次</dt>
            <dd className="font-medium">{roundLabel}</dd>
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <dt className="text-sm text-muted-foreground">面试时间</dt>
            <dd className="font-medium">
              {hasDate ? (
                <time dateTime={scheduledAt ?? undefined}>
                  {invitationDate.format(date)}（北京时间）
                </time>
              ) : (
                "具体时间请联系招聘负责人确认"
              )}
            </dd>
          </div>
          {interviewer ? (
            <div className="col-span-2 flex flex-col gap-1.5">
              <dt className="text-sm text-muted-foreground">你的参会身份</dt>
              <dd className="font-medium">
                {interviewer.name} · {interviewer.role}
              </dd>
            </div>
          ) : null}
        </dl>
        {message ? (
          <output className="text-sm leading-6 text-muted-foreground">{message}</output>
        ) : null}
        {children}
        {interviewer ? null : (
          <p className="text-xs leading-5 text-muted-foreground">
            如需调整时间，请联系招聘负责人。
          </p>
        )}
      </div>
      <section
        aria-labelledby="candidate-job-description-title"
        data-slot="interview-entry-jd"
        className="flex min-w-0 flex-col gap-6 pb-4 md:pt-1"
      >
        {companyDescription ? (
          <Tabs defaultValue="job" className="gap-6">
            <TabsList variant="line" aria-label="面试相关信息">
              <TabsTab value="job" id="candidate-job-description-title">
                岗位 JD
              </TabsTab>
              <TabsTab value="company">公司信息</TabsTab>
            </TabsList>
            <TabsPanel value="job">{jobContent}</TabsPanel>
            <TabsPanel value="company">
              <MarkdownView
                content={companyDescription}
                className="text-sm leading-7 [&_p]:whitespace-pre-line"
              />
            </TabsPanel>
          </Tabs>
        ) : (
          <>
            <h2 id="candidate-job-description-title" className="text-base font-semibold">
              岗位 JD
            </h2>
            {jobContent}
          </>
        )}
      </section>
    </section>
  );
}
