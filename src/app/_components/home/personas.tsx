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
  // Tailwind 类组合，控制卡片渐变与图标颜色 / class tokens for tinted card surface + icon
  iconClass: string;
  role: string;
  surfaceClass: string;
  title: string;
}

const personas: Persona[] = [
  {
    Icon: BriefcaseIcon,
    description:
      "在工作台配置岗位、面试问题与面试官设定，向候选人发送模拟面试链接，集中查看每个候选人的评估结果。",
    iconClass: "bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300",
    role: "HR / 招聘负责人",
    surfaceClass: "bg-gradient-to-br from-amber-500/[0.06] to-orange-500/[0.02]",
    title: "把招聘流程沉淀为可复用的工作流",
  },
  {
    Icon: UsersIcon,
    description:
      "通过聊天式筛选快速浏览简历，查看 AI 给出的亮点、风险与追问过程，决定是否安排深入面试。",
    iconClass: "bg-sky-500/15 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300",
    role: "业务面试官 / 用人经理",
    surfaceClass: "bg-gradient-to-br from-sky-500/[0.06] to-blue-500/[0.02]",
    title: "判断更快、依据更完整",
  },
  {
    Icon: MicIcon,
    description:
      "通过链接进入实时语音模拟面试，完整经历追问与作答流程，提交后得到一致的结构化记录。",
    iconClass: "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
    role: "候选人",
    surfaceClass: "bg-gradient-to-br from-emerald-500/[0.06] to-teal-500/[0.02]",
    title: "贴近真实节奏的面试体验",
  },
];

export function Personas() {
  return (
    <Section>
      <Eyebrow>For Every Role</Eyebrow>
      <SectionTitle>不同角色，同一套招聘工作流</SectionTitle>
      <SectionLead>
        从招聘负责人配置流程，到面试官评估候选人，再到候选人参与模拟面试，每一步都在同一个产品里完成，记录与上下文不再分散。
      </SectionLead>

      <div className="mt-12 grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-3">
        {personas.map(({ Icon, description, iconClass, role, surfaceClass, title }, index) => (
          <FadeContent delay={0.1 * index} key={role}>
            <article
              className={`group relative h-full overflow-hidden rounded-3xl border border-foreground/[0.04] p-7 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_28px_-22px_rgba(0,0,0,0.25)] sm:p-8 ${surfaceClass}`}
            >
              <div
                className={`mb-6 inline-flex size-11 items-center justify-center rounded-xl ${iconClass}`}
              >
                <Icon aria-hidden="true" className="size-5" />
              </div>
              <p className="font-medium text-foreground/60 text-xs uppercase tracking-[0.16em]">
                {role}
              </p>
              <h3 className="mt-2 font-semibold text-foreground text-xl leading-tight tracking-tight sm:text-2xl">
                {title}
              </h3>
              <p className="mt-3 text-foreground/75 text-sm leading-relaxed sm:text-[15px]">
                {description}
              </p>
            </article>
          </FadeContent>
        ))}
      </div>
    </Section>
  );
}
