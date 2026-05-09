// 用途：三角色分区（HR / 业务面试官 / 候选人），Notion 风格的彩色卡片
// Purpose: Three-persona section, Notion-style colorful cards.
"use client";

import { BriefcaseIcon, MicIcon, UsersIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { FadeContent } from "@/components/react-bits/fade-content";
import { Eyebrow, Section, SectionLead, SectionTitle } from "./section";

interface Persona {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  description: string;
  role: string;
  title: string;
}

const personas: Persona[] = [
  {
    Icon: BriefcaseIcon,
    description:
      "在工作台配置岗位、面试问题与面试官设定，向候选人发送模拟面试链接，集中查看每个候选人的评估结果。",
    role: "HR / 招聘负责人",
    title: "把招聘流程沉淀为可复用的工作流",
  },
  {
    Icon: UsersIcon,
    description:
      "通过聊天式筛选快速浏览简历，查看 AI 给出的亮点、风险与追问过程，决定是否安排深入面试。",
    role: "业务面试官 / 用人经理",
    title: "判断更快、依据更完整",
  },
  {
    Icon: MicIcon,
    description:
      "通过链接进入实时语音模拟面试，完整经历追问与作答流程，提交后得到一致的结构化记录。",
    role: "候选人",
    title: "贴近真实节奏的面试体验",
  },
];

export function Personas() {
  return (
    <Section width="wide">
      <Eyebrow>For Every Role</Eyebrow>
      <SectionTitle>不同角色，同一套招聘工作流</SectionTitle>
      <SectionLead>
        从招聘负责人配置流程，到面试官评估候选人，再到候选人参与模拟面试，每一步都在同一个产品里完成，记录与上下文不再分散。
      </SectionLead>

      <div className="mt-12 grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-3">
        {personas.map(({ Icon, description, role, title }, index) => (
          <FadeContent delay={0.1 * index} key={role}>
            <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-foreground/[0.06] bg-background/60 p-7 shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)] backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_28px_-22px_rgba(0,0,0,0.25)] sm:p-8">
              <Icon aria-hidden="true" className="size-6 text-foreground/55" strokeWidth={1.25} />
              <p className="mt-6 font-medium text-foreground/55 text-xs uppercase tracking-[0.16em]">
                {role}
              </p>
              <h3 className="mt-2 min-h-[2lh] font-medium text-foreground text-xl leading-tight tracking-tight sm:text-2xl">
                {title}
              </h3>
              <p className="mt-3 text-foreground/75 text-sm leading-normal sm:text-[15px]">
                {description}
              </p>
            </article>
          </FadeContent>
        ))}
      </div>
    </Section>
  );
}
