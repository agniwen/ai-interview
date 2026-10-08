"use client";

import { useState } from "react";
import {
  QualitativeEvaluationDetails,
  QualitativeDimensionRadar,
} from "@/components/features/studio/resumes/qualitative-resume-evaluation-panel";
import { CandidateBasicInfoView } from "@/components/features/candidate/candidate-basic-info-view";
import { RoundCard } from "@/components/features/studio/human-interview-stage-rounds";
import { OfferNegotiationProgress } from "@/components/features/studio/offer-stage-panel";
import { OfferDraftReadonlyFields } from "@/components/features/studio/offer-stage-cards";
import { SummaryMetric } from "@/components/features/studio/studio-person-detail-skeletons";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { DataField } from "@/components/features/display/data-field";
import { DataFields } from "@/components/features/display/data-fields";
import { useDemo } from "./demo-context";
import {
  createDemoHumanRound,
  createDemoHumanMeeting,
  demoOfferNodes,
  demoConversation,
  demoEvaluation,
  demoOffer,
} from "./demo-workflow-data";

const noop = () => {
  /* Read-only demo cards never persist changes. */
};

function AiInterviewResult() {
  const [transcript, setTranscript] = useState(false);
  return (
    <div className="space-y-6" data-slot="demo-ai-result">
      <div className="flex items-center gap-3 text-sm">
        <Button variant="outline">第 1 轮 · AI 初面 · 10/08 11:00</Button>
        <Badge variant="success">已完成</Badge>
      </div>
      <div className="grid grid-cols-2 items-stretch gap-4">
        <Frame className="h-full">
          <FrameHeader className="justify-between">
            <FrameTitle>面试结果</FrameTitle>
            <Badge variant="success">已完成</Badge>
          </FrameHeader>
          <FramePanel className="flex-1">
            <div className="grid grid-cols-2 gap-8">
              <SummaryMetric label="开始时间" value="2026/10/08 11:00" />
              <SummaryMetric label="结束时间" value="2026/10/08 11:24" />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-8 border-t border-border/50 pt-5">
              <SummaryMetric label="评分" value="86 / 100" />
              <SummaryMetric label="建议" value={<Badge variant="success">推荐</Badge>} />
              <SummaryMetric label="对话" value="12 次候选人回复" />
            </div>
            <MarkdownView
              className="mt-5 border-t border-border/50 pt-5 text-sm leading-6"
              content="**建议进入真人面试。** 真嗣能够完整说明微前端迁移方案、灰度回滚策略和性能优化方法。项目贡献明确，首屏加载从 3.2 秒降至 1.4 秒，有持续两周的真实用户监测支持。真人复面重点验证复杂场景下的架构取舍。"
            />
            <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border/50 pt-5">
              <Button variant="outline" disabled>
                查看推荐问题
              </Button>
              <Button variant="outline" disabled>
                复制面试链接
              </Button>
            </div>
          </FramePanel>
        </Frame>
        <Frame className="h-full">
          <FrameHeader>
            <FrameTitle>候选人信息</FrameTitle>
          </FrameHeader>
          <FramePanel className="flex-1">
            <CandidateBasicInfoView
              candidateName="真嗣"
              candidateEmail="shinji@example.com"
              candidatePhone="138 0000 1842"
              creatorName="葛城美里"
              jobDescriptionName="技术部 / 资深前端工程师"
              targetRole="资深前端工程师"
              hasResumeFile
              resumeFileName="真嗣_前端工程师.pdf"
            />
          </FramePanel>
        </Frame>
        <Frame>
          <FrameHeader className="justify-between">
            <FrameTitle>表单题</FrameTitle>
            <Badge variant="outline">3 项</Badge>
          </FrameHeader>
          <FramePanel>
            <DataFields columns={2}>
              <DataField label="工作年限" value="8 年" />
              <DataField label="期望薪资" value="¥32,000–35,000 / 月" />
              <DataField label="到岗时间" value="Offer 确认后 3 周" />
            </DataFields>
          </FramePanel>
        </Frame>
        <Frame>
          <FrameHeader className="justify-between">
            <FrameTitle>沟通题</FrameTitle>
            <Badge variant="outline">3 项</Badge>
          </FrameHeader>
          <FramePanel>
            <p className="text-sm font-medium">微前端迁移中的个人贡献</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              负责方案设计、6 个系统的迁移推进与发布治理，迁移分三批完成。
            </p>
          </FramePanel>
        </Frame>
      </div>
      <Frame>
        <FrameHeader className="justify-between">
          <FrameTitle>面试对话</FrameTitle>
          <Button
            data-demo-ai-transcript
            size="sm"
            variant="ghost"
            onClick={() => setTranscript(!transcript)}
          >
            {transcript ? "收起对话记录" : "查看对话记录"}
          </Button>
        </FrameHeader>
        {transcript && (
          <FramePanel>
            <ScrollArea className="max-h-[320px]" scrollbars="leave">
              <div className="space-y-5">
                {demoConversation.map((turn, i) => (
                  <div key={turn.question}>
                    <p className="text-xs text-muted-foreground">
                      {String(i * 6).padStart(2, "0")}:12 · AI 面试官
                    </p>
                    <p className="mt-1 text-sm font-medium">{turn.question}</p>
                    <p className="mt-3 text-xs text-primary">真嗣</p>
                    <p className="mt-1 text-sm leading-6">{turn.answer}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </FramePanel>
        )}
      </Frame>
    </div>
  );
}

function HumanInterview() {
  const demo = useDemo();
  const completed = demo.phase === "human-completed" || demo.phase === "offer";
  const round = createDemoHumanRound(completed);
  return (
    <div className="space-y-6" data-slot="demo-human-interview">
      <header className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-medium">真人面试进度</h2>
          <p className="mt-1 text-sm text-muted-foreground">查看面试安排、轮次结果与面试评价</p>
        </div>
        <Button variant="outline" disabled>
          安排面试
        </Button>
      </header>
      <h3 className="text-sm font-medium">{completed ? "历史面试" : "待处理"}</h3>
      <div data-demo-human-analysis>
        <RoundCard
          round={round}
          autoScrollDetails={false}
          roundNumber={1}
          meeting={createDemoHumanMeeting(completed)}
          canCreate={false}
          canDelete={false}
          canUpdate={false}
          disabled
          slug="demo"
          onComplete={noop}
          onCancel={noop}
          onCreateMeeting={noop}
          onEndMeeting={noop}
          onOpenLinks={noop}
          onRescheduled={noop}
          onReview={noop}
        />
      </div>
      {!completed && (
        <Frame>
          <FrameHeader>
            <FrameTitle>本轮面试重点</FrameTitle>
          </FrameHeader>
          <FramePanel>
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
              <li>微前端拆分过程中，如何平衡共享依赖与独立发布？</li>
              <li>上线前如何设计灰度指标及回滚策略？</li>
              <li>如何验证性能优化对真实用户的影响？</li>
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">
              参考 AI 初面已确认的项目证据，深入核实关键技术决策。
            </p>
          </FramePanel>
        </Frame>
      )}
    </div>
  );
}

function OfferInterview() {
  return (
    <div className="space-y-6" data-slot="demo-offer">
      <OfferNegotiationProgress stage="offer" offerStatus="sent" nodeStates={demoOfferNodes} />
      <Frame>
        <FrameHeader>
          <FrameTitle>候选人期望</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <p className="mb-3 text-xs text-muted-foreground">
            发 Offer 前先收集候选人期望，做议价参考。
          </p>
          <DataFields columns={3}>
            <DataField label="期望月薪" value="¥ 35,000" />
            <DataField label="当前月薪" value="¥ 30,000" />
            <DataField label="转正工资" value="¥ 34,000" />
            <DataField label="试用期工资" value="¥ 34,000" />
            <DataField label="最早入职日" value="2026/11/02" />
            <DataField label="备注" value="技术复面通过，薪资已沟通一致" />
          </DataFields>
        </FramePanel>
      </Frame>
      <Frame>
        <FrameHeader className="justify-between">
          <FrameTitle>Offer · 第 1 版</FrameTitle>
          <Badge variant="info">已发送</Badge>
        </FrameHeader>
        <FramePanel>
          <OfferDraftReadonlyFields draft={demoOffer} />
          <div className="mt-4 flex gap-2 border-t pt-4">
            <Button variant="outline" disabled>
              编辑
            </Button>
            <Button variant="outline" disabled>
              复制 Offer 链接
            </Button>
            <Button disabled>记录候选人响应</Button>
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}

export default function DemoInterviewPanels({ tab }: { tab: string }) {
  if (tab === "evaluation") {
    return (
      <QualitativeEvaluationDetails
        evaluation={demoEvaluation}
        summaryAction={
          <Button size="sm" variant="ghost" disabled>
            重新评价
          </Button>
        }
      />
    );
  }
  if (tab === "interviews") {
    return <AiInterviewResult />;
  }
  if (tab === "human") {
    return <HumanInterview />;
  }
  if (tab === "offer") {
    return <OfferInterview />;
  }
  return <QualitativeDimensionRadar evaluation={demoEvaluation} compact />;
}
