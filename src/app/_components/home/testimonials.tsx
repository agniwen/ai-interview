// 用途：用户评价分区，使用横向滚动跑马灯展示真实使用反馈
// Purpose: testimonials section with horizontal marquee of user feedback cards.
"use client";

import { FadeContent } from "@/components/react-bits/fade-content";
import FallbackAvatar from "@/components/spell-ui/fallback-avatar";
import { Marquee } from "@/components/spell-ui/marquee";
import { Eyebrow, Section, SectionLead, SectionTitle } from "./section";

interface Testimonial {
  name: string;
  role: string;
  quote: string;
}

const testimonialsRow1: Testimonial[] = [
  {
    name: "陈思琪",
    quote:
      "以前一个岗位要看上百份简历，现在 AI 先做一轮初筛，结构化的亮点和风险一目了然，节省了大量时间。",
    role: "字节跳动 · HRBP",
  },
  {
    name: "Alex Liu",
    quote: "模拟面试链接发出去就行，候选人体验和真人面试差不多，回收的评估结论也足够细。",
    role: "Shopee · 招聘负责人",
  },
  {
    name: "王浩然",
    quote: "最喜欢追问环节，AI 会顺着候选人的回答继续深挖，比单纯走问题清单更能看出真实水平。",
    role: "美团 · 用人经理",
  },
  {
    name: "周婷",
    quote: "评估结果是结构化的，可以直接复制到 ATS 里，不用再手动整理面试笔记。",
    role: "蔚来汽车 · 高级 HR",
  },
  {
    name: "Marcus Chen",
    quote:
      "It catches inconsistencies between resume claims and interview answers — exactly the kind of due diligence I want a first-round to do.",
    role: "Stripe · Engineering Manager",
  },
];

const testimonialsRow2: Testimonial[] = [
  {
    name: "李雪",
    quote: "校招高峰期一天能跑完几百场模拟面试，候选人随到随约，再也不用排时间表。",
    role: "腾讯 · 校招负责人",
  },
  {
    name: "张毅",
    quote: "我只需要看 AI 整理的面试摘要和高亮片段，决定是否进入下一轮，效率比从前翻录音高太多。",
    role: "小米 · 业务面试官",
  },
  {
    name: "Priya Nair",
    quote:
      "The candidate-side flow feels like a real conversation. We've had very few drop-offs since we switched to it.",
    role: "Flipkart · Talent Lead",
  },
  {
    name: "刘嘉琪",
    quote: "面试问题可以按岗位沉淀成模板，团队内复用起来非常顺手。",
    role: "网易 · 招聘经理",
  },
  {
    name: "高远",
    quote: "面完之后能立刻看到结构化反馈，候选人也可以基于反馈复盘，比传统面试体验好太多。",
    role: "B 站 · 用人经理",
  },
];

function TestimonialCard({ name, role, quote }: Testimonial) {
  return (
    <div className="mx-3 flex h-full w-[320px] flex-col rounded-2xl border border-foreground/[0.06] bg-background/60 p-5 shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)] backdrop-blur sm:w-[360px] sm:p-6">
      <p className="text-foreground/80 text-sm leading-normal sm:text-[15px]">“{quote}”</p>
      <div className="mt-auto flex items-center gap-3 pt-5">
        <FallbackAvatar className="shrink-0 ring-1 ring-foreground/[0.06]" name={name} size={36} />
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground text-sm">{name}</p>
          <p className="truncate text-muted-foreground text-xs">{role}</p>
        </div>
      </div>
    </div>
  );
}

export function Testimonials() {
  return (
    <Section width="wide">
      <Eyebrow>Loved by Hiring Teams</Eyebrow>
      <SectionTitle>HR、面试官与候选人，都给出了真实的反馈</SectionTitle>
      <SectionLead>
        从初筛到模拟面试，从结构化评估到团队协作，听听一线招聘团队和候选人正在如何使用我们的产品。
      </SectionLead>

      <FadeContent>
        <div className="mt-12 flex flex-col gap-5">
          <Marquee duration={48} fadeAmount={8} pauseOnHover>
            {testimonialsRow1.map((t) => (
              <TestimonialCard key={t.name} {...t} />
            ))}
          </Marquee>
          <Marquee direction="right" duration={56} fadeAmount={8} pauseOnHover>
            {testimonialsRow2.map((t) => (
              <TestimonialCard key={t.name} {...t} />
            ))}
          </Marquee>
        </div>
      </FadeContent>
    </Section>
  );
}
