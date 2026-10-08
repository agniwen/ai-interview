"use client";

import {
  IconArrowLeft,
  IconEdit,
  IconFileText,
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
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import { CandidateCareerSummary } from "@/components/features/studio/candidate-career-summary";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useDemo } from "./demo-context";

const DemoInterviewPanels = lazy(() => import("./demo-interview-panels"));

/** Candidate page and workflow are local to the canvas; the homepage never subscribes. */
export function DemoCandidateDetail() {
  const demo = useDemo();
  const [tab, setTab] = useState("overview");
  const { candidate, phase } = demo;
  if (!candidate) {
    return null;
  }
  const field = (label: string) => candidate.fields?.find((entry) => entry.label === label)?.value;
  const name = field("姓名") ?? "真嗣";
  const job = field("关联岗位") ?? "技术部 / 资深前端工程师";
  const human = phase.startsWith("human") || phase === "offer";
  const stage = {
    "ai-completed": "AI 初面 · 已完成",
    "human-completed": "真人面试 · 已通过",
    "human-live": "真人面试 · 进行中",
    "human-scheduled": "真人面试 · 已安排",
    invited: "AI 初面 · 已发起",
    live: "AI 初面 · 进行中",
    offer: "Offer 协商 · 已发送",
    screening: "简历筛选 · 已合格",
  }[phase];
  return (
    <main
      className="relative mx-auto flex w-full max-w-[96rem] flex-col gap-3 px-6 py-6 pb-32"
      data-slot="demo-candidate-detail"
      data-candidate-id={candidate.id}
    >
      <Button
        className="self-start"
        data-demo-detail-back
        variant="ghost"
        size="sm"
        onClick={() => demo.setCandidate(null)}
      >
        <IconArrowLeft />
        返回{demo.page}
      </Button>
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <header className="flex flex-col gap-2 border-b border-border/70 pb-4">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <Avatar className="size-14" generatedSize={56} seed={name} label={`${name}的头像`}>
                <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold">{name}</h1>
                  <span className="text-[14px] text-muted-foreground/60">({candidate.id})</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <IconBriefcase className="size-3.5" />
                    {job}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled>
                <IconFileText />
                查看简历
              </Button>
              <Button variant="outline" disabled>
                <IconEdit />
                编辑资料
              </Button>
            </div>
          </div>
          <TabsList>
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger data-demo-detail-tab="evaluation" value="evaluation">
              AI评价
            </TabsTrigger>
            <TabsTrigger data-demo-detail-tab="interviews" value="interviews">
              AI初面
            </TabsTrigger>
            {human && (
              <TabsTrigger data-demo-detail-tab="human" value="human">
                真人面试
              </TabsTrigger>
            )}
            {phase === "offer" && (
              <TabsTrigger data-demo-detail-tab="offer" value="offer">
                Offer
              </TabsTrigger>
            )}
          </TabsList>
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
                <h2 className="flex min-h-10 items-center font-medium text-sm">AI评价</h2>
                <div className="grid grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)] items-center gap-5">
                  <Suspense fallback={<Skeleton className="h-52" />}>
                    <DemoInterviewPanels tab="overview" />
                  </Suspense>
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground">综合评价</p>
                    <p className="text-4xl font-semibold tracking-tight">非常推荐</p>
                    <p className="text-sm leading-7 text-muted-foreground">
                      8 年前端研发经验，主导 6 个系统的微前端架构升级，首屏加载从 3.2 秒降至 1.4
                      秒。
                    </p>
                    <Button
                      className="self-start"
                      variant="outline"
                      size="sm"
                      onClick={() => setTab("evaluation")}
                    >
                      查看AI评价详情
                      <IconChevronRight />
                    </Button>
                  </div>
                </div>
              </section>
              <section className="mt-8 border-t border-border/50 pt-6">
                <h2 className="mb-3 font-medium text-sm">候选人信息</h2>
                <DataFields columns={3}>
                  <DataField label="姓名" value={name} />
                  <DataField label="关联在招岗位" value={job} />
                  <DataField label="求职意向" value="资深前端工程师" />
                  <DataField label="工作年限" value="8 年" />
                  <DataField label="邮箱" value={field("邮箱")} />
                  <DataField label="电话" value="138 0000 1842" />
                </DataFields>
              </section>
              <section className="mt-8 border-t border-border/50 pt-6">
                {candidate.profile && (
                  <ResumeProfileView
                    profile={candidate.profile}
                    showBasicInfo={false}
                    showTargetRoles={false}
                  />
                )}
              </section>
            </TabsContent>
            {[
              "evaluation",
              "interviews",
              ...(human ? ["human"] : []),
              ...(phase === "offer" ? ["offer"] : []),
            ].map((value) => (
              <TabsContent key={value} value={value}>
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
                    履历概要
                  </TabsTrigger>
                  <TabsTrigger className="flex-1" value="activity">
                    活动记录
                  </TabsTrigger>
                </TabsList>
                <div className="mt-4">
                  <ScrollArea className="max-h-[460px]" scrollbars="leave">
                    <TabsContent value="career">
                      <CandidateCareerSummary
                        profile={candidate.profile ?? null}
                        onWorkExperienceSelect={() => {
                          /* Static career links are not part of the automatic tour. */
                        }}
                      />
                    </TabsContent>
                    <TabsContent value="activity">
                      <p className="text-sm font-medium">最近动态</p>
                      <p className="mt-4 text-sm leading-7">{stage}</p>
                      <p className="mt-6 text-xs text-muted-foreground">
                        葛城美里 · 简历入库并关联资深前端工程师岗位
                      </p>
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
                demo.setDialog({ kind: "launch", title: "发起 AI 初面" });
              }}
            >
              <IconSparkles />
              发起 AI 初面
            </Button>
          )}
          {phase === "ai-completed" && (
            <Button
              data-demo-transition-human
              size="sm"
              onClick={() => {
                demo.setPhase("human-scheduled");
                setTab("human");
                demo.setDialog({ kind: "schedule", title: "安排真人面试" });
              }}
            >
              进入真人面试
            </Button>
          )}
          {phase === "human-scheduled" && (
            <Button
              data-demo-enter-human-room
              size="sm"
              onClick={() => demo.setPhase("human-live")}
            >
              进入面试会议
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
              进入 Offer 协商
            </Button>
          )}
          <Button size="sm" variant="outline" disabled>
            标记结束
          </Button>
        </div>
      </div>
    </main>
  );
}
