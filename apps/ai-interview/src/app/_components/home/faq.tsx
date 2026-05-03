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
      "简历内容与面试录音仅用于本次评估并安全存储，不会用于训练任何模型。需要时可在工作台清理历史记录。",
    question: "上传的简历和面试录音会被怎样使用？",
  },
  {
    answer:
      "AI 评估基于岗位语境与候选人作答给出结构化判断，定位是辅助参考，不替代人类决策。建议结合面试官的现场判断使用。",
    question: "AI 给出的评估结果靠不靠谱？是否会替代人工面试？",
  },
  {
    answer:
      "目前对常见的工程、产品、设计、运营、销售类岗位适配良好。其它专业岗位也可使用，但建议在 JD 与面试官人设中明确专业要求，以提高追问质量。",
    question: "支持哪些岗位或行业？",
  },
  {
    answer: "招聘方需要登录后进入工作台。候选人无需注册，通过模拟面试链接即可直接进入语音面试。",
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
      <SectionTitle>常见问题</SectionTitle>
      <Accordion className="mt-10 w-full" defaultValue={["faq-0"]} type="multiple">
        {faqs.map((item, index) => (
          <AccordionItem key={item.question} value={`faq-${index}`}>
            <AccordionTrigger className="text-left text-base sm:text-lg">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-relaxed sm:text-base">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}
