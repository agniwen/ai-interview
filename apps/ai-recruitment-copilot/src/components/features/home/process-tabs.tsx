// 用途：从简历到评估的 4 步骤纵向标签切换（Notion 风格：左侧步骤列表，右侧大图）
// Purpose: Vertical 4-step process tabs (Notion style: left list, right image).
"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import {
  ChatScreen,
  EvaluationScreen,
  InterviewScreen,
  JdSetupScreen,
} from "@/components/features/home/screens";
import { cn } from "@arc/shared/utils";
import { Eyebrow, Section, SectionLead, SectionTitle } from "./section";

interface Step {
  body: string;
  label: string;
  number: string;
  // 该步骤对应的简化 UI 屏组件
  // Screen component for this step
  Screen: (props: { className?: string }) => React.ReactElement;
  title: string;
  value: string;
}

const steps: Step[] = [
  {
    Screen: JdSetupScreen,
    body: "在工作台维护岗位描述、关键能力要求与面试官人设，作为后续筛选与面试的统一上下文。",
    label: "上传 JD",
    number: "01",
    title: "在工作台设定岗位语境",
    value: "step-1",
  },
  {
    Screen: ChatScreen,
    body: "上传一批 PDF 简历，AI 围绕岗位要求展开聊天式追问，输出每位候选人的亮点、风险与建议。",
    label: "简历筛选",
    number: "02",
    title: "聊天式完成简历初筛",
    value: "step-2",
  },
  {
    Screen: InterviewScreen,
    body: "向候选人发送语音面试链接，AI 按岗位语境进行实时追问，完整记录对话节奏与作答内容。",
    label: "语音面试",
    number: "03",
    title: "发起实时语音模拟面试",
    value: "step-3",
  },
  {
    Screen: EvaluationScreen,
    body: "面试结束后查看结构化评估、对话记录与时间线，与简历阶段的判断对照，做出最终决定。",
    label: "查看评估",
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
        <SectionTitle>JD 进来。评估出去。中间四步，连得很顺。</SectionTitle>
        <SectionLead>
          每一步都长在同一个产品里。候选人的上下文和团队的判断，不再各走各的。
        </SectionLead>
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
                    aria-label={`查看步骤：${step.label}`}
                    className={cn(
                      "group relative w-full border-foreground/10 border-l-2 py-5 pl-6 text-left transition-colors lg:flex lg:h-full lg:flex-col lg:justify-center",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground/40 focus-visible:outline-offset-2",
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
                          "font-medium text-base transition-colors sm:text-lg",
                          isActive ? "text-foreground" : "text-foreground/55",
                        )}
                      >
                        {step.title}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "grid overflow-hidden text-foreground/70 text-sm leading-normal transition-[grid-template-rows,opacity,margin] duration-300 dark:text-white/80",
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
              <activeStep.Screen />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Section>
  );
}
