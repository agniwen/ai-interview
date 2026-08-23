"use client";

import { IconBriefcase, IconMicrophone, IconUsers } from "@tabler/icons-react";
// 用途：三角色分区（HR / 业务面试官 / 候选人），Notion 风格的彩色卡片
// Purpose: Three-persona section, Notion-style colorful cards.
import type { ComponentType, SVGProps } from "react";
import { FadeContent } from "@/components/react-bits/fade-content";
import * as m from "@/paraglide/messages";
import { Section, SectionLead, SectionTitle } from "./section";

interface Persona {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  description: string;
  role: string;
  title: string;
}

export function Personas() {
  const personas: Persona[] = [
    {
      Icon: IconBriefcase,
      description: m.home_persona_hr_description(),
      role: m.home_persona_hr_role(),
      title: m.home_persona_hr_title(),
    },
    {
      Icon: IconUsers,
      description: m.home_persona_manager_description(),
      role: m.home_persona_manager_role(),
      title: m.home_persona_manager_title(),
    },
    {
      Icon: IconMicrophone,
      description: m.home_persona_candidate_description(),
      role: m.home_persona_candidate_role(),
      title: m.home_persona_candidate_title(),
    },
  ];

  return (
    <Section width="wide">
      <SectionTitle className="mt-0">{m.home_personas_title()}</SectionTitle>
      <SectionLead>{m.home_personas_lead()}</SectionLead>

      <div className="mt-12 grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-3">
        {personas.map(({ Icon, description, role, title }, index) => (
          <FadeContent delay={0.1 * index} key={role}>
            <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl ring-1 ring-foreground/5 bg-background/60 p-7 shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)] backdrop-blur transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_12px_28px_-22px_rgba(0,0,0,0.25)] sm:p-8">
              <Icon aria-hidden="true" className="size-6 text-foreground/55" strokeWidth={1.25} />
              <p className="mt-6 font-medium text-foreground/55 text-xs uppercase tracking-[0.16em]">
                {role}
              </p>
              <h3 className="mt-2 min-h-[2lh] text-balance font-medium text-foreground text-xl leading-tight tracking-tight sm:text-2xl">
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
