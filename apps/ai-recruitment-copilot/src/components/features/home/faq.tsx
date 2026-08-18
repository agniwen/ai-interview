// 用途：5 条常见问题
// Purpose: Top 5 FAQs.
"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Eyebrow, Section, SectionTitle } from "./section";

const faqs = [
  {
    answer:
      "简历、面试记录与评估结果保存在对应工作区，用于支持筛选、面试和团队评审。访问受工作区权限控制，有权限的成员可以管理相关记录。",
    question: "简历和面试记录会保存在哪里？",
  },
  {
    answer:
      "不会。AI 负责整理证据、持续追问并给出结构化参考，是否进入真人复面、录用或结束流程，仍由招聘团队决定。",
    question: "AI 会替招聘团队做最终决定吗？",
  },
  {
    answer:
      "可以按岗位配置职责、能力要求、面试重点与问题模板。岗位语境越清楚，简历筛选和 AI 追问就越贴近团队的真实标准。",
    question: "不同岗位可以使用不同的筛选和面试标准吗？",
  },
  {
    answer: "招聘团队登录后在工作台推进流程；候选人无需注册，通过专属链接即可进入 AI 面试。",
    question: "招聘方和候选人的接入方式是怎样的？",
  },
  {
    answer:
      "建议使用现代浏览器（Chrome / Edge / Safari）与稳定网络，佩戴耳机以获得更好的语音体验。系统会在面试开始前检测麦克风。",
    question: "候选人参加语音面试有什么设备或网络要求？",
  },
];

export function Faq() {
  return (
    <Section width="wide">
      <Eyebrow>FAQ</Eyebrow>
      <SectionTitle>开始之前，先讲清楚。</SectionTitle>
      <Accordion
        className="mt-10 w-full"
        defaultValue={["faq-0", "faq-1", "faq-2", "faq-3", "faq-4"]}
        multiple
      >
        {faqs.map((item, index) => (
          <AccordionItem
            key={item.question}
            value={`faq-${index}`}
            // FAQ 在首页 grainient 背景之上，默认 border-border 灰会显得脏；
            // 亮色模式改用纯白分界线，深色保持默认 token。
            // FAQ sits on the light-mode grainient background; the default gray
            // border looks dirty against it. Force white in light mode, keep
            // default token in dark mode.
            className="border-white/20 dark:border-border"
          >
            <AccordionTrigger className="text-left text-base sm:text-lg">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-normal dark:text-white/80 sm:text-base">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}
