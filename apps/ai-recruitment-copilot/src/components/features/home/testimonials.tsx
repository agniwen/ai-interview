// 用途：招聘判断原则分区，使用横向滚动跑马灯呈现产品如何帮助团队形成可靠判断
// Purpose: hiring principles section with a horizontal marquee of evidence-led decisions.
"use client";

import { FadeContent } from "@/components/react-bits/fade-content";
import { Marquee } from "@/components/spell-ui/marquee";
import { Section, SectionLead, SectionTitle } from "./section";

interface HiringPrinciple {
  description: string;
  label: string;
  title: string;
}

const principlesRow1: HiringPrinciple[] = [
  {
    description: "职责、能力要求与筛选门槛先对齐，后面的每一步才有共同标准。",
    label: "岗位语境",
    title: "先定义，什么叫合适。",
  },
  {
    description: "亮点和风险都对应简历原文。看到结论，也看得到结论从哪里来。",
    label: "简历筛选",
    title: "结论旁边，始终有证据。",
  },
  {
    description: "回答太泛，就继续追问案例、角色和结果，把模糊的信息问具体。",
    label: "AI 面试",
    title: "答案没说清，就接着问。",
  },
  {
    description: "对话、录音与结构化评估放在一起，复盘不再依赖零散印象。",
    label: "评估",
    title: "从记录，回到判断。",
  },
  {
    description: "先看 AI 面试里已经确认和仍有疑问的部分，把时间留给关键问题。",
    label: "真人复面",
    title: "人来判断，真正重要的事。",
  },
  {
    description: "招聘负责人和用人经理看到同一份候选人上下文，交接不再重新讲一遍。",
    label: "团队协同",
    title: "同一个人，同一份事实。",
  },
];

const principlesRow2: HiringPrinciple[] = [
  {
    description: "无需注册，也无需安装应用。跟随清晰提示，把注意力留给表达本身。",
    label: "候选人体验",
    title: "打开链接，就可以开始。",
  },
  {
    description: "关键回答、追问过程和评估依据一并保留，需要时可以完整回看。",
    label: "过程记录",
    title: "每一次回答，都不丢。",
  },
  {
    description: "从筛选到 AI 面试，再到真人复面，每次推进都有明确状态与上下文。",
    label: "多轮招聘",
    title: "阶段清楚，交接自然。",
  },
  {
    description: "先看能力与证据的差异，再讨论谁更适合岗位，不让一个分数替代判断。",
    label: "候选人对比",
    title: "差异，比排名更重要。",
  },
  {
    description: "决定之后仍能回到当时的简历、回答和评估依据，让流程持续变好。",
    label: "招聘复盘",
    title: "每个决定，都可以回看。",
  },
  {
    description: "AI 整理证据、补齐问题、给出参考。最终决定，始终由招聘团队做出。",
    label: "人机边界",
    title: "AI 给依据。人做决定。",
  },
];

function PrincipleCard({ description, label, title }: HiringPrinciple) {
  return (
    <div className="mr-6 flex h-full w-[320px] flex-col rounded-2xl bg-background/60 p-5 shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)] ring-1 ring-foreground/5 backdrop-blur sm:w-[360px] sm:p-6">
      <p className="font-medium text-foreground/55 text-xs uppercase tracking-[0.16em]">{label}</p>
      <h3 className="mt-4 text-balance font-medium text-foreground text-xl leading-tight tracking-tight">
        {title}
      </h3>
      <p className="mt-3 text-foreground/75 text-sm leading-normal dark:text-white/80 sm:text-[15px]">
        {description}
      </p>
    </div>
  );
}

export function DecisionPrinciples() {
  return (
    <Section width="wide">
      <SectionTitle className="mt-0">不是替你决定。是让决定更有依据。</SectionTitle>
      <SectionLead>
        把招聘中最容易丢失的上下文，变成每个人都看得见的事实。每一步，都能回到证据。
      </SectionLead>

      <FadeContent>
        <div className="relative left-1/2 mt-12 flex w-screen max-w-[2000px] -translate-x-1/2 flex-col gap-5 overflow-hidden">
          <Marquee duration={48} fadeAmount={8} pauseOnHover>
            {principlesRow1.map((principle) => (
              <PrincipleCard key={principle.title} {...principle} />
            ))}
          </Marquee>
          <Marquee direction="right" duration={56} fadeAmount={8} pauseOnHover>
            {principlesRow2.map((principle) => (
              <PrincipleCard key={principle.title} {...principle} />
            ))}
          </Marquee>
        </div>
      </FadeContent>
    </Section>
  );
}
