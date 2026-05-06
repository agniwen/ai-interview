// 用途：从简历到评估的 4 步骤纵向标签切换（Notion 风格：左侧步骤列表，右侧大图）
// Purpose: Vertical 4-step process tabs (Notion style: left list, right image).
"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Screenshot } from "./screenshot";
import { Eyebrow, Section, SectionLead, SectionTitle } from "./section";

interface Step {
  body: string;
  darkSrc: string;
  imageAlt: string;
  label: string;
  lightSrc: string;
  number: string;
  title: string;
  value: string;
}

const steps: Step[] = [
  {
    body: "在工作台维护岗位描述、关键能力要求与面试官人设，作为后续筛选与面试的统一上下文。",
    darkSrc: "/landing/process-1-dark.png",
    imageAlt: "上传 JD 与岗位配置界面",
    label: "上传 JD",
    lightSrc: "/landing/process-1-light.png",
    number: "01",
    title: "在工作台设定岗位语境",
    value: "step-1",
  },
  {
    body: "上传一批 PDF 简历，AI 围绕岗位要求展开聊天式追问，输出每位候选人的亮点、风险与建议。",
    darkSrc: "/landing/process-2-dark.png",
    imageAlt: "聊天式简历筛选界面",
    label: "简历筛选",
    lightSrc: "/landing/process-2-light.png",
    number: "02",
    title: "聊天式完成简历初筛",
    value: "step-2",
  },
  {
    body: "向候选人发送语音面试链接，AI 按岗位语境进行实时追问，完整记录对话节奏与作答内容。",
    darkSrc: "/landing/process-3-dark.png",
    imageAlt: "实时语音面试界面",
    label: "语音面试",
    lightSrc: "/landing/process-3-light.png",
    number: "03",
    title: "发起实时语音模拟面试",
    value: "step-3",
  },
  {
    body: "面试结束后查看结构化评估、对话记录与时间线，与简历阶段的判断对照，做出最终决定。",
    darkSrc: "/landing/process-4-dark.png",
    imageAlt: "面试评估结果界面",
    label: "查看评估",
    lightSrc: "/landing/process-4-light.png",
    number: "04",
    title: "查看完整评估与对话记录",
    value: "step-4",
  },
];

export function ProcessTabs() {
  const [activeValue, setActiveValue] = useState<string>(steps[0].value);
  const activeStep = steps.find((step) => step.value === activeValue) ?? steps[0];
  const prefersReducedMotion = useReducedMotion();

  return (
    <Section width="wide">
      <div className="max-w-3xl">
        <Eyebrow>How It Works</Eyebrow>
        <SectionTitle>从一份 JD 到一次完整评估，四步贯通</SectionTitle>
        <SectionLead>每一步都在同一个产品里完成，候选人上下文与团队判断不会断开。</SectionLead>
      </div>

      <div className="mt-12 grid grid-cols-1 items-stretch gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        {/* 左侧：步骤列表（lg+ 用 flex-1 等高分布，使首尾 tab 与右侧截图上下边缘对齐） */}
        {/* Left: step list — on lg+, each item takes flex-1 so the first/last tabs align with the screenshot's top/bottom edges */}
        <div className="flex flex-col">
          <ol className="flex h-full flex-col">
            {steps.map((step) => {
              const isActive = step.value === activeValue;
              return (
                <li className="lg:flex lg:flex-1 lg:flex-col" key={step.value}>
                  <button
                    aria-current={isActive ? "step" : undefined}
                    className={cn(
                      "group relative w-full border-foreground/10 border-l-2 py-5 pl-6 text-left transition-colors lg:flex lg:h-full lg:flex-col lg:justify-center",
                      isActive ? "border-l-primary" : "hover:border-l-foreground/30",
                    )}
                    onClick={() => setActiveValue(step.value)}
                    onFocus={() => setActiveValue(step.value)}
                    onMouseEnter={() => setActiveValue(step.value)}
                    type="button"
                  >
                    <div className="flex items-baseline gap-3">
                      <span
                        className={cn(
                          "font-mono text-xs transition-colors",
                          isActive ? "text-primary" : "text-foreground/40",
                        )}
                      >
                        {step.number}
                      </span>
                      <span
                        className={cn(
                          "font-semibold text-base transition-colors sm:text-lg",
                          isActive ? "text-foreground" : "text-foreground/55",
                        )}
                      >
                        {step.title}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "grid overflow-hidden text-foreground/70 text-sm leading-relaxed transition-[grid-template-rows,opacity,margin] duration-300",
                        isActive
                          ? "mt-3 grid-rows-[1fr] opacity-100"
                          : "mt-0 grid-rows-[0fr] opacity-0",
                      )}
                    >
                      <span className="min-h-0">{step.body}</span>
                    </p>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* 右侧：当前步骤的产品截图 / Right: active step screenshot */}
        {/* AnimatePresence mode="wait" 等当前图退出后再放入下一张，淡出/淡入两端都被处理 */}
        {/* AnimatePresence mode="wait" — old image animates out fully before new one animates in */}
        <div className="relative lg:sticky lg:top-24 lg:self-start">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -60 }}
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 60 }}
              key={activeStep.value}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <Screenshot
                alt={activeStep.imageAlt}
                darkSrc={activeStep.darkSrc}
                height={900}
                lightSrc={activeStep.lightSrc}
                width={1440}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Section>
  );
}
