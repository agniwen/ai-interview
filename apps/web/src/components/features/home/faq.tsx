// 用途：5 条常见问题
// Purpose: Top 5 FAQs.
"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import * as m from "@/paraglide/messages";
import { Section, SectionTitle } from "./section";

const defaultExpandedFaqs = Array.from({ length: 5 }, (_, index) => `faq-${index}`);

export function Faq() {
  const faqs = [
    { answer: m.home_faq_a1(), question: m.home_faq_q1() },
    { answer: m.home_faq_a2(), question: m.home_faq_q2() },
    { answer: m.home_faq_a3(), question: m.home_faq_q3() },
    { answer: m.home_faq_a4(), question: m.home_faq_q4() },
    { answer: m.home_faq_a5(), question: m.home_faq_q5() },
  ];

  return (
    <Section
      className="grid gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-20"
      width="wide"
    >
      <SectionTitle className="lg:sticky lg:top-16 lg:self-start">
        {m.home_faq_title()}
      </SectionTitle>
      <Accordion className="w-full" defaultValue={defaultExpandedFaqs} multiple>
        {faqs.map((item, index) => (
          <AccordionItem className="border-border/60" key={item.question} value={`faq-${index}`}>
            <AccordionTrigger className="py-6 text-pretty text-left text-lg leading-relaxed tracking-tight sm:text-xl">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="pb-7 text-muted-foreground text-sm leading-[1.9] sm:text-base">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}
