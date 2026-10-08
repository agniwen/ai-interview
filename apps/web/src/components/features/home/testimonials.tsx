// 用途：招聘判断原则分区，使用横向滚动跑马灯呈现产品如何帮助团队形成可靠判断
// Purpose: hiring principles section with a horizontal marquee of evidence-led decisions.
"use client";

import { FadeContent } from "@/components/react-bits/fade-content";
import { Marquee } from "@/components/spell-ui/marquee";
import * as m from "@/paraglide/messages";
import { getHomeDemoCopy } from "./home-demo-copy";
import { Section, SectionHeader } from "./section";

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
    <article className="mr-4 flex h-full w-[320px] flex-col rounded-xl bg-background/70 p-6 sm:w-[380px] sm:p-8">
      <p className="text-primary text-sm">{label}</p>
      <h3 className="mt-4 min-h-[2lh] text-pretty font-medium text-foreground text-2xl leading-[1.3] tracking-[-0.035em] sm:text-3xl">
        {title}
      </h3>
      <p className="mt-5 text-muted-foreground text-sm leading-[1.9]">{description}</p>
    </article>
  );
}

export function DecisionPrinciples() {
  const localizedPrinciples = getHomeDemoCopy().principles;
  const principles =
    localizedPrinciples.length > 0
      ? [...localizedPrinciples]
      : [...principlesRow1, ...principlesRow2];
  const firstRow = principles.slice(0, 6);
  const secondRow = principles.slice(6);

  return (
    <div className="overflow-hidden bg-primary/[0.035]">
      <Section width="wide">
        <SectionHeader title={m.home_principles_title()} lead={m.home_principles_lead()} />

        <FadeContent>
          <div className="relative left-1/2 mt-16 flex w-screen max-w-[2000px] -translate-x-1/2 flex-col gap-6 overflow-hidden sm:gap-8">
            <Marquee duration={48} fadeAmount={8} pauseOnHover>
              {firstRow.map((principle) => (
                <PrincipleCard key={principle.title} {...principle} />
              ))}
            </Marquee>
            <Marquee direction="right" duration={56} fadeAmount={8} pauseOnHover>
              {secondRow.map((principle) => (
                <PrincipleCard key={principle.title} {...principle} />
              ))}
            </Marquee>
          </div>
        </FadeContent>
      </Section>
    </div>
  );
}
