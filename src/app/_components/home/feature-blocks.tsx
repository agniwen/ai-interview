// 用途：Notion 风格左右交替的三段特性介绍
// Purpose: Notion-style alternating feature blocks.
"use client";

import { CheckIcon } from "lucide-react";
import { FadeContent } from "@/components/react-bits/fade-content";
import { cn } from "@/lib/utils";
import { Screenshot } from "./screenshot";
import { Eyebrow, Section, SectionLead, SectionTitle } from "./section";

interface Block {
  bullets: string[];
  darkSrc: string;
  eyebrow: string;
  imageAlt: string;
  imageHeight: number;
  imageWidth: number;
  lead: string;
  lightSrc: string;
  title: string;
}

const blocks: Block[] = [
  {
    bullets: [
      "支持一次上传多份 PDF 简历",
      "围绕岗位要求持续追问候选人亮点与风险",
      "自动汇总筛选建议，便于团队对齐",
    ],
    darkSrc: "/landing/chat-dark.png",
    eyebrow: "Resume Screening",
    imageAlt: "聊天式简历初筛界面",
    imageHeight: 900,
    imageWidth: 1440,
    lead: "把简历筛选变成一次自然的对话：上传简历后直接和 AI 讨论候选人的匹配度、亮点和风险，节省阅读全文的时间。",
    lightSrc: "/landing/chat-light.png",
    title: "聊天式简历初筛，按岗位语境追问",
  },
  {
    bullets: [
      "在工作台维护岗位、JD、面试官人设、面试问题",
      "全局配置一次设定多次复用",
      "JD 与候选人评估上下文打通",
    ],
    darkSrc: "/landing/studio-dark.png",
    eyebrow: "Workspace",
    imageAlt: "工作台岗位与全局配置界面",
    imageHeight: 900,
    imageWidth: 1440,
    lead: "在工作台里组织岗位描述、面试官人设和题库，让每一次评估都建立在真实招聘语境上，而不是孤立的关键词匹配。",
    lightSrc: "/landing/studio-light.png",
    title: "围绕真实岗位语境的统一工作台",
  },
  {
    bullets: [
      "实时语音对话，追问节奏可控",
      "自动记录候选人作答、节奏、停顿",
      "面试结束即获得结构化评估",
    ],
    darkSrc: "/landing/interview-dark.png",
    eyebrow: "Voice Interview",
    imageAlt: "实时语音模拟面试界面",
    imageHeight: 900,
    imageWidth: 1440,
    lead: "把链接发给候选人，即可进入与人类节奏接近的语音模拟面试。AI 会根据简历与岗位语境追问，并给出结构化评估。",
    lightSrc: "/landing/interview-light.png",
    title: "实时语音模拟面试，沉淀完整对话",
  },
];

export function FeatureBlocks() {
  return (
    <Section width="wide">
      <div className="space-y-20 sm:space-y-24">
        {blocks.map((block, index) => {
          const reversed = index % 2 === 1;
          return (
            <FadeContent
              className={cn(
                "grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16",
                reversed && "lg:[&>:first-child]:order-2",
              )}
              key={block.title}
            >
              <div>
                <Eyebrow>{block.eyebrow}</Eyebrow>
                <SectionTitle>{block.title}</SectionTitle>
                <SectionLead>{block.lead}</SectionLead>
                <ul className="mt-6 space-y-3 text-foreground/80 text-sm sm:text-base">
                  {block.bullets.map((bullet) => (
                    <li className="flex items-start gap-2" key={bullet}>
                      <CheckIcon
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-primary"
                      />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Screenshot
                alt={block.imageAlt}
                darkSrc={block.darkSrc}
                height={block.imageHeight}
                lightSrc={block.lightSrc}
                width={block.imageWidth}
              />
            </FadeContent>
          );
        })}
      </div>
    </Section>
  );
}
