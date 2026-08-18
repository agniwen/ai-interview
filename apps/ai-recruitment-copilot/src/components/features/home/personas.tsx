"use client";

import { IconBriefcase, IconMicrophone, IconUsers } from "@tabler/icons-react";
// 用途：三角色分区（HR / 业务面试官 / 候选人），Notion 风格的彩色卡片
// Purpose: Three-persona section, Notion-style colorful cards.
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
    Icon: IconBriefcase,
    description: "设置岗位语境，推进筛选、AI 面试与真人复面。每位候选人走到哪一步，都清楚可见。",
    role: "HR / 招聘负责人",
    title: "流程清楚。推进自然。",
  },
  {
    Icon: IconUsers,
    description: "直接查看简历证据、关键回答与风险提示，把时间留给真正需要人来判断的问题。",
    role: "业务面试官 / 用人经理",
    title: "少翻材料。多看证据。",
  },
  {
    Icon: IconMicrophone,
    description: "无需注册，打开链接即可参加 AI 面试。跟随清晰提示回答，把注意力留给表达本身。",
    role: "候选人",
    title: "打开链接。就可以开始。",
  },
];

export function Personas() {
  return (
    <Section width="wide">
      <Eyebrow>For Every Role</Eyebrow>
      <SectionTitle>每个人，看到自己该看的。</SectionTitle>
      <SectionLead>
        招聘负责人推进流程，用人经理判断能力，候选人专注表达。信息在同一处流动，角色不被混在一起。
      </SectionLead>

      <div className="mt-12 grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-3">
        {personas.map(({ Icon, description, role, title }, index) => (
          <FadeContent delay={0.1 * index} key={role}>
            <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl ring-1 ring-foreground/5 bg-background/60 p-7 shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)] backdrop-blur transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_12px_28px_-22px_rgba(0,0,0,0.25)] sm:p-8">
              <Icon aria-hidden="true" className="size-6 text-foreground/55" strokeWidth={1.25} />
              <p className="mt-6 font-medium text-foreground/55 text-xs uppercase tracking-[0.16em]">
                {role}
              </p>
              <h3 className="mt-2 min-h-[2lh] font-medium text-foreground text-xl leading-tight tracking-tight sm:text-2xl">
                {title}
              </h3>
              <p className="mt-3 text-foreground/75 text-sm leading-normal dark:text-white/80 sm:text-[15px]">
                {description}
              </p>
            </article>
          </FadeContent>
        ))}
      </div>
    </Section>
  );
}
