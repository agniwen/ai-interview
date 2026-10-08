"use client";

import { useState } from "react";
import {
  IconClipboardText,
  IconDeviceDesktopUp,
  IconFileDescription,
  IconListDetails,
  IconMessageCircle,
  IconMicrophone,
  IconMoon,
  IconPlayerStopFilled,
  IconSubtitles,
  IconUsers,
  IconUser,
  IconVideo,
  IconX,
} from "@tabler/icons-react";
import { CandidateInterviewHistory } from "@/components/features/human-interview/candidate-interview-history";
import { CandidateResumePreview } from "@/components/features/human-interview/candidate-resume-preview";
import { CandidateQuestionsPanel } from "@/components/features/human-interview/candidate-questions-panel";
import { MeetingInfoHoverCard } from "@/components/features/human-interview/meeting-info-hover-card";
import { humanMeetingControlButtonClass } from "@/components/features/human-interview/human-meeting-stage";
import { AiEvaluationContent } from "@/components/features/human-interview/interviewer-candidate-materials";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@app/shared/utils";
import { demoConversation, demoEvaluation, demoHumanEvaluation } from "./demo-workflow-data";
import { useDemo } from "./demo-context";

const history = {
  hrInitialInformation: {
    conversationId: "01842-ai",
    generatedAt: "2026-10-08T03:24:00.000Z",
    roundLabel: "AI 初面 · 86 分 · 推荐进入真人面试",
    values: {
      availability: "目前在职，Offer 确认后 3 周可到岗。",
      careerProgression: "从业务前端成长为平台技术骨干，负责架构评审与迁移推进。",
      compensationExpectations: "当前月薪 ¥30,000，期望 ¥32,000–35,000，14 薪。",
      jobMotivation: "希望承担更完整的前端架构与工程化建设职责。",
      overseasTravel: null,
      projectHighlights:
        "主导 6 个系统的微前端迁移；首屏加载从 3.2 秒降至 1.4 秒，持续两周验证 P75 指标。",
      recentWork: "字节跳动高级前端工程师，负责业务平台升级、性能治理和跨团队发布流程。",
    },
  },
  previousEvaluations: [],
};

/** Real meeting chrome and materials primitives, with local participants instead of LiveKit/network access. */
export default function DemoHumanRoom() {
  const demo = useDemo();
  const [materials, setMaterials] = useState(false);
  const [questions, setQuestions] = useState(false);
  const [review, setReview] = useState(false);
  return (
    <main
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background"
      data-slot="demo-human-room"
      data-candidate-id="01842"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 pr-1.5 pl-4">
        <div className="flex min-w-0 flex-1 items-center">
          <MeetingInfoHoverCard
            meetingTitle="真嗣 · 技术复面"
            jobDescriptionName="技术部 / 资深前端工程师"
            roundLabel="技术复面"
            scheduledAt="2026-10-09T06:00:00.000Z"
            responsibleHrName="葛城美里"
            responsibleHrImage={null}
            showResponsibleHr
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {materials && (
            <Button
              data-demo-room-questions
              aria-expanded={questions}
              aria-label="面试题"
              size="sm"
              variant={questions ? "secondary" : "ghost"}
              onClick={() => setQuestions(!questions)}
            >
              <IconListDetails />
              面试题
            </Button>
          )}
          <Button variant="ghost" size="sm" disabled>
            <IconSubtitles />
            字幕
          </Button>
          <output className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-destructive" />
            录制中
          </output>
          <Button variant="ghost" size="icon-sm" disabled aria-label="切换主题">
            <IconMoon />
          </Button>
          <Badge className="h-8 rounded-md px-2.5" variant="secondary" aria-label="参会人数">
            <IconUsers />2
          </Badge>
        </div>
      </header>
      <div className="relative grid min-h-0 flex-1 overflow-hidden" data-slot="meeting-workspace">
        {materials ? (
          <div
            className={cn(
              "grid min-h-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-200",
              questions ? "grid-cols-[minmax(0,1fr)_min(32%,30rem)]" : "grid-cols-[minmax(0,1fr)]",
            )}
          >
            <section className="min-h-0 min-w-0 overflow-hidden" aria-label="候选人概览">
              <CandidateInterviewHistory
                compact={questions}
                data={history}
                aiEvaluationGeneratedAt="2026-10-08T02:00:00.000Z"
                aiEvaluation={
                  <AiEvaluationContent
                    data={{ aiEvaluation: { evaluation: demoEvaluation, status: "ready" } }}
                  />
                }
                resumePreview={
                  <CandidateResumePreview
                    candidate={{ hasResumeFile: true, resumeFileName: "真嗣_前端工程师.pdf" }}
                    onOpen={() => demo.setDialog({ kind: "resume", title: "简历详情" })}
                  >
                    <div className="h-full overflow-hidden px-10 py-6">
                      <h2 className="text-xl font-semibold">真嗣 · 资深前端工程师</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        8 年经验 · React / TypeScript · 微前端 · 性能治理
                      </p>
                      {demo.candidate?.profile && (
                        <div className="mt-6">
                          <ResumeProfileView
                            profile={demo.candidate.profile}
                            showBasicInfo={false}
                            showTargetRoles={false}
                          />
                        </div>
                      )}
                    </div>
                  </CandidateResumePreview>
                }
              />
            </section>
            {questions && (
              <CandidateQuestionsPanel
                id="demo-human-questions"
                isMobile={false}
                open
                onClose={() => setQuestions(false)}
              >
                <div className="space-y-5 p-5">
                  {demoConversation.map((turn, index) => (
                    <section className="space-y-3 border-b pb-5" key={turn.question}>
                      <div className="flex items-center gap-2">
                        <Checkbox disabled checked={index === 0} />
                        <span className="text-xs text-muted-foreground">参考问题 {index + 1}</span>
                      </div>
                      <p className="text-sm font-medium leading-6">{turn.question}</p>
                      <p className="text-xs leading-6 text-muted-foreground">
                        根据 AI 初面已确认的回答，继续核实实现细节与技术取舍。
                      </p>
                    </section>
                  ))}
                </div>
              </CandidateQuestionsPanel>
            )}
          </div>
        ) : (
          <div
            className="grid min-h-0 flex-1 grid-cols-2 auto-rows-fr gap-1.5 overflow-hidden px-1.5 pb-1.5"
            data-slot="meeting-grid-layout"
          >
            {[
              { name: "真嗣", role: "候选人" },
              { local: true, name: "赤木律子", role: "主持人" },
            ].map((person) => (
              <div
                className="relative isolate grid h-full min-h-0 place-items-center overflow-hidden rounded-sm border border-border/50 bg-muted/40"
                key={person.name}
              >
                {person.local ? (
                  <Avatar
                    className="size-24"
                    generatedSize={96}
                    seed="demo-reviewer"
                    label="赤木律子"
                  />
                ) : (
                  <IconUser className="size-16 text-muted-foreground" />
                )}
                <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 rounded-md bg-background px-2 py-1 text-sm">
                    {person.name}
                    {person.local && " (我)"}
                    <span className="text-[10px] text-muted-foreground">{person.role}</span>
                  </div>
                  <span className="rounded-md bg-background px-2 py-1 text-xs text-emerald-600">
                    ▂▄▆
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {review && (
          <section
            className="absolute inset-x-0 bottom-3 z-30 mx-auto flex h-[min(44rem,calc(100%-1.75rem))] w-[min(48rem,calc(100%-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-lg"
            data-slot="meeting-review-panel"
          >
            <header className="flex items-start justify-between gap-3 border-b p-6">
              <div>
                <h2 className="text-lg font-semibold">面试评价</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  填写后每秒自动保存，结束后继续完善并提交。
                </p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="关闭评价"
                onClick={() => setReview(false)}
              >
                <IconX />
              </Button>
            </header>
            <ScrollArea className="min-h-0 flex-1" scrollbars="leave">
              <div className="space-y-6 p-4">
                <div className="grid grid-cols-3 gap-5">
                  {[
                    { label: "我的结论", value: "通过" },
                    { label: "评级", value: "A" },
                    { label: "专业技能", value: "优" },
                  ].map((field) => (
                    <div key={field.label}>
                      <Label>{field.label}</Label>
                      <Input className="mt-2" readOnly value={field.value} />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-5">
                  {[
                    { label: "整体评价", value: demoHumanEvaluation.overallEvaluation },
                    { label: "角色定位", value: demoHumanEvaluation.rolePosition },
                    { label: "优势特点", value: demoHumanEvaluation.strengths },
                    { label: "劣势风险", value: demoHumanEvaluation.risks },
                    { label: "薪资建议", value: demoHumanEvaluation.salaryRecommendation },
                  ].map((field) => (
                    <div
                      className={field.label === "整体评价" ? "col-span-2" : ""}
                      key={field.label}
                    >
                      <Label>{field.label}</Label>
                      <Textarea className="mt-2 min-h-24" readOnly value={field.value} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button disabled>提交评价</Button>
                </div>
              </div>
            </ScrollArea>
          </section>
        )}
      </div>
      <footer className="relative flex shrink-0 items-center justify-center gap-2 px-4 py-3">
        {[
          { icon: IconMicrophone, label: "麦克风" },
          { icon: IconVideo, label: "摄像头已关" },
          { icon: IconDeviceDesktopUp, label: "共享屏幕" },
        ].map(({ icon: Icon, label }) => (
          <button className={humanMeetingControlButtonClass} type="button" key={label}>
            <Icon className="size-4" />
            {label}
          </button>
        ))}
        <button
          className={humanMeetingControlButtonClass}
          data-demo-room-materials
          type="button"
          onClick={() => {
            setReview(false);
            setMaterials(!materials);
          }}
        >
          {materials ? (
            <IconVideo className="size-4" />
          ) : (
            <IconFileDescription className="size-4" />
          )}
          {materials ? "会议视图" : "候选人信息"}
        </button>
        <button
          className={humanMeetingControlButtonClass}
          data-demo-room-review
          type="button"
          onClick={() => setReview(!review)}
        >
          <IconClipboardText className="size-4" />
          评价
        </button>
        <button className={humanMeetingControlButtonClass} type="button">
          <IconMessageCircle className="size-4" />
          聊天
        </button>
        <Button
          variant="destructive"
          data-demo-finish-human
          onClick={() => demo.setPhase("human-completed")}
        >
          <IconPlayerStopFilled className="size-4" />
          结束会议
        </Button>
      </footer>
    </main>
  );
}
