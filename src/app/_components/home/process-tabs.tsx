// 用途：从简历到评估的 4 步骤交互式标签切换
// Purpose: Interactive 4-step process tabs.
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  return (
    <Section width="wide">
      <Eyebrow>How It Works</Eyebrow>
      <SectionTitle>从一份 JD 到一次完整评估，四步贯通</SectionTitle>
      <SectionLead>每一步都在同一个产品里完成，候选人上下文与团队判断不会断开。</SectionLead>

      <Tabs className="mt-10" defaultValue="step-1">
        <TabsList className="h-auto w-full max-w-3xl flex-wrap gap-1 bg-muted/40 p-1.5">
          {steps.map((step) => (
            <TabsTrigger
              className="min-w-[6rem] flex-1 py-2 text-xs sm:text-sm"
              key={step.value}
              value={step.value}
            >
              <span className="mr-1.5 font-mono text-[10px] text-foreground/50 sm:text-xs">
                {step.number}
              </span>
              {step.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {steps.map((step) => (
          <TabsContent className="mt-8" key={step.value} value={step.value}>
            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-12">
              <div>
                <p className="font-mono text-primary text-sm">{step.number}</p>
                <h3 className="mt-2 font-bold text-2xl text-foreground tracking-tight sm:text-3xl">
                  {step.title}
                </h3>
                <p className="mt-3 text-base text-muted-foreground leading-relaxed">{step.body}</p>
              </div>
              <Screenshot
                alt={step.imageAlt}
                darkSrc={step.darkSrc}
                height={900}
                lightSrc={step.lightSrc}
                width={1440}
              />
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </Section>
  );
}
