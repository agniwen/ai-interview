"use client";

import {
  IconFileText,
  IconRefresh,
  IconBriefcase,
  IconChevronRight,
  IconSparkles,
} from "@tabler/icons-react";
import { lazy, Suspense, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DataField } from "@/components/features/display/data-field";
import { DataFields } from "@/components/features/display/data-fields";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import * as m from "@/paraglide/messages";
import { DemoResumeProfile } from "./_parts/demo-records";
import { useDemo } from "./demo-context";
import { getDemoScreenCopy } from "./demo-screen-copy";
import { DEMO_CANDIDATE_EMAIL, DEMO_CANDIDATE_PHONE } from "./demo-workflow-data";

const DemoInterviewPanels = lazy(() => import("./demo-interview-panels"));

/** Candidate page and workflow are local to the canvas; the homepage never subscribes. */
export function DemoCandidateDetail() {
  const demo = useDemo();
  const [tab, setTab] = useState("overview");
  const { candidate, phase } = demo;
  if (!candidate) {
    return null;
  }
  const { desk, detail, job, people } = getDemoScreenCopy();
  const name = people.candidate;
  const human = phase.startsWith("human") || phase === "offer";
  const stage = detail.stages[phase];
  return (
    <main
      className="relative mx-auto flex w-full max-w-[96rem] flex-col gap-3 px-6 pt-4 pb-32"
      data-slot="demo-candidate-detail"
      data-candidate-id={candidate.id}
    >
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        {/* 对齐 RecruiterResumeDetailPage：标题区 + 下划线标签与右侧操作同一行，底部分隔线。 */}
        <header className="flex min-w-0 flex-col gap-2 border-border/70 border-b">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              className="size-14 shrink-0"
              generatedSize={56}
              seed="candidate:shinji"
              label={m.home_frame_candidate_avatar({ name })}
            >
              <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-baseline gap-2">
                <h1 className="font-semibold text-2xl tracking-normal">{name}</h1>
                <span className="font-normal text-[14px] text-muted-foreground/60">
                  ({candidate.id})
                </span>
              </div>
              <p className="mt-2 text-muted-foreground text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <IconBriefcase className="size-3.5" />
                  {job.label}
                </span>
              </p>
            </div>
          </div>
          <div className="mt-2 flex min-w-0 items-end justify-between gap-2">
            <TabsList aria-label={detail.tabsLabel} className="mt-0 flex-1" variant="underline">
              <TabsTrigger className="min-w-[6em] flex-none" value="overview">
                {detail.overviewTab}
              </TabsTrigger>
              <TabsTrigger
                className="min-w-[6em] flex-none"
                data-demo-detail-tab="evaluation"
                value="evaluation"
              >
                {detail.aiEvaluationTab}
              </TabsTrigger>
              <TabsTrigger
                className="min-w-[6em] flex-none"
                data-demo-detail-tab="interviews"
                value="interviews"
              >
                {detail.aiInterviewTab}
              </TabsTrigger>
              {human && (
                <TabsTrigger
                  className="min-w-[6em] flex-none"
                  data-demo-detail-tab="human"
                  value="human"
                >
                  {detail.humanInterviewTab}
                </TabsTrigger>
              )}
              {phase === "offer" && (
                <TabsTrigger
                  className="min-w-[6em] flex-none"
                  data-demo-detail-tab="offer"
                  value="offer"
                >
                  Offer
                </TabsTrigger>
              )}
            </TabsList>
            <div className="flex shrink-0 items-center gap-2 pb-1.5">
              <Button size="sm" variant="outline" disabled>
                <IconFileText data-icon="inline-start" />
                {detail.previewResume}
              </Button>
              <Button className="h-8 gap-1.5" size="sm" variant="outline" disabled>
                <IconRefresh className="size-3.5" data-icon="inline-start" />
                {detail.refreshInfo}
              </Button>
            </div>
          </div>
        </header>
        <div
          className={
            tab === "overview"
              ? "mt-4 grid grid-cols-[minmax(0,1fr)_28rem] items-start gap-6"
              : "mt-4"
          }
        >
          <div className="min-w-0">
            <TabsContent value="overview">
              <section className="space-y-4">
                <h2 className="flex min-h-10 items-center font-medium text-sm">
                  {detail.aiEvaluationTab}
                </h2>
                <div className="grid grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)] items-center gap-5">
                  <Suspense fallback={<Skeleton className="h-52" />}>
                    <DemoInterviewPanels tab="overview" />
                  </Suspense>
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground">
                      {getDemoScreenCopy().evaluationUi.overallTitle}
                    </p>
                    <p className="text-4xl font-semibold tracking-tight">
                      {desk.highlyRecommended}
                    </p>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {detail.overviewSummary}
                    </p>
                    <Button
                      className="self-start"
                      variant="outline"
                      size="sm"
                      onClick={() => setTab("evaluation")}
                    >
                      {detail.viewEvaluationDetails}
                      <IconChevronRight />
                    </Button>
                  </div>
                </div>
              </section>
              <section className="mt-8 border-t border-border/50 pt-6">
                <h2 className="mb-3 font-medium text-sm">{detail.candidateInfo}</h2>
                <DataFields columns={3}>
                  <DataField label={detail.profileFields.name} value={name} />
                  <DataField label={detail.profileFields.relatedJob} value={job.label} />
                  <DataField label={detail.profileFields.targetRole} value={job.title} />
                  <DataField label={detail.profileFields.workYears} value={detail.workYears} />
                  <DataField label={detail.profileFields.email} value={DEMO_CANDIDATE_EMAIL} />
                  <DataField label={detail.profileFields.phone} value={DEMO_CANDIDATE_PHONE} />
                </DataFields>
              </section>
              <section className="mt-8 border-t border-border/50 pt-6">
                <DemoResumeProfile />
              </section>
            </TabsContent>
            {[
              "evaluation",
              "interviews",
              ...(human ? ["human"] : []),
              ...(phase === "offer" ? ["offer"] : []),
            ].map((value) => (
              <TabsContent data-demo-reveal={value} key={value} value={value}>
                {tab === value && (
                  <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                    <DemoInterviewPanels tab={value} />
                  </Suspense>
                )}
              </TabsContent>
            ))}
          </div>
          {tab === "overview" && (
            <div>
              <Tabs defaultValue="career">
                <TabsList className="w-full" variant="underline">
                  <TabsTrigger className="flex-1" value="career">
                    {detail.careerTab}
                  </TabsTrigger>
                  <TabsTrigger className="flex-1" value="activity">
                    {detail.activityTab}
                  </TabsTrigger>
                </TabsList>
                <div className="mt-4">
                  <ScrollArea className="max-h-[460px]" scrollbars="leave">
                    <TabsContent value="career">
                      <DemoResumeProfile withDetails={false} />
                    </TabsContent>
                    <TabsContent value="activity">
                      <p className="text-sm font-medium">{detail.recentActivity}</p>
                      <p className="mt-4 text-sm leading-7">{stage}</p>
                      <p className="mt-6 text-xs text-muted-foreground">{detail.activityNote}</p>
                    </TabsContent>
                  </ScrollArea>
                </div>
              </Tabs>
            </div>
          )}
        </div>
      </Tabs>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-10 z-20 flex justify-center"
        style={{ paddingLeft: 288 }}
        data-slot="demo-candidate-actions"
      >
        <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-border/50 bg-background/90 p-2 shadow-sm backdrop-blur-xl">
          <Badge variant="info">{stage}</Badge>
          {phase === "screening" && (
            <Button
              data-demo-launch
              size="sm"
              onClick={() => {
                demo.setPhase("invited");
                demo.setDialog({ kind: "launch", title: detail.launchAi });
              }}
            >
              <IconSparkles />
              {detail.launchAi}
            </Button>
          )}
          {phase === "ai-completed" && (
            <Button
              data-demo-transition-human
              size="sm"
              onClick={() => {
                demo.setPhase("human-scheduled");
                setTab("human");
                demo.setDialog({ kind: "schedule", title: detail.scheduleHuman });
              }}
            >
              {detail.enterHuman}
            </Button>
          )}
          {phase === "human-scheduled" && (
            <Button
              data-demo-enter-human-room
              size="sm"
              onClick={() => demo.setPhase("human-live")}
            >
              {detail.enterMeeting}
            </Button>
          )}
          {phase === "human-completed" && (
            <Button
              data-demo-transition-offer
              size="sm"
              onClick={() => {
                demo.setPhase("offer");
                setTab("offer");
              }}
            >
              {detail.enterOffer}
            </Button>
          )}
          <Button size="sm" variant="outline" disabled>
            {detail.markClosed}
          </Button>
        </div>
      </div>
    </main>
  );
}
