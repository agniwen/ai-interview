// 用途：Notion 风格的能力卡片网格（小标题+描述+图标，每张不同色调）
// Purpose: Notion-style capability card grid (icon + title + description, tinted per card).
"use client";

import {
  ClipboardListIcon,
  GaugeIcon,
  MessageSquareTextIcon,
  RadioIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { FadeContent } from "@/components/react-bits/fade-content";
import { Eyebrow, Section, SectionLead, SectionTitle } from "./section";

interface Capability {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  description: string;
  iconClass: string;
  surfaceClass: string;
  title: string;
}

const capabilities: Capability[] = [
  {
    Icon: MessageSquareTextIcon,
    description: "围绕岗位语境追问候选人亮点与风险，不是简单的关键词匹配。",
    iconClass: "bg-violet-500/15 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300",
    surfaceClass: "bg-gradient-to-br from-violet-500/[0.06] to-fuchsia-500/[0.02]",
    title: "聊天式筛选",
  },
  {
    Icon: ClipboardListIcon,
    description: "在工作台维护岗位、JD、面试官人设、面试问题，全局复用。",
    iconClass: "bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300",
    surfaceClass: "bg-gradient-to-br from-amber-500/[0.06] to-orange-500/[0.02]",
    title: "工作台配置",
  },
  {
    Icon: RadioIcon,
    description: "一键发起实时语音模拟面试，候选人通过链接即可参与。",
    iconClass: "bg-rose-500/15 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300",
    surfaceClass: "bg-gradient-to-br from-rose-500/[0.06] to-pink-500/[0.02]",
    title: "实时语音面试",
  },
  {
    Icon: SparklesIcon,
    description: "AI 自动追问、记录节奏与停顿，沉淀完整对话上下文。",
    iconClass: "bg-sky-500/15 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300",
    surfaceClass: "bg-gradient-to-br from-sky-500/[0.06] to-cyan-500/[0.02]",
    title: "智能追问",
  },
  {
    Icon: GaugeIcon,
    description: "结构化评估展示亮点、风险、推荐度，团队判断有共同依据。",
    iconClass: "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
    surfaceClass: "bg-gradient-to-br from-emerald-500/[0.06] to-teal-500/[0.02]",
    title: "结构化评估",
  },
  {
    Icon: ShieldCheckIcon,
    description: "简历内容与面试录音仅用于本次评估，不会用于训练模型。",
    iconClass: "bg-slate-500/15 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300",
    surfaceClass: "bg-gradient-to-br from-slate-500/[0.06] to-zinc-500/[0.02]",
    title: "数据可控",
  },
];

export function CapabilityGrid() {
  return (
    <Section width="wide">
      <div className="max-w-3xl">
        <Eyebrow>Capabilities</Eyebrow>
        <SectionTitle>面向招聘场景设计的全部能力</SectionTitle>
        <SectionLead>从筛选、面试到评估，AI 协助你在每一个环节做出更可解释的判断。</SectionLead>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
        {capabilities.map(({ Icon, description, iconClass, surfaceClass, title }, index) => (
          <FadeContent delay={0.05 * index} key={title}>
            <article
              className={`group relative h-full overflow-hidden rounded-2xl border border-foreground/[0.04] p-6 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_22px_-18px_rgba(0,0,0,0.22)] ${surfaceClass}`}
            >
              <div
                className={`mb-5 inline-flex size-10 items-center justify-center rounded-xl ${iconClass}`}
              >
                <Icon aria-hidden="true" className="size-5" />
              </div>
              <h3 className="font-semibold text-foreground text-lg tracking-tight">{title}</h3>
              <p className="mt-2 text-foreground/70 text-sm leading-relaxed">{description}</p>
            </article>
          </FadeContent>
        ))}
      </div>
    </Section>
  );
}
