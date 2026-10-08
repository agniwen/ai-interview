"use client";

import { IconBriefcase, IconMicrophone, IconUsers } from "@tabler/icons-react";
import type { ComponentType, SVGProps } from "react";
import * as m from "@/paraglide/messages";
import { Section, SectionHeader } from "./section";

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
    <Section className="relative" width="wide">
      <SectionHeader title={m.home_personas_title()} lead={m.home_personas_lead()} />

      <div className="mt-16 grid gap-12 md:grid-cols-3 md:gap-10 lg:mt-20 lg:gap-16">
        {personas.map(({ Icon, description, role, title }) => (
          <article className="flex flex-col" key={role}>
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/[0.065] text-primary">
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </span>
              <p className="text-sm text-muted-foreground">{role}</p>
            </div>
            <h3 className="mt-6 text-pretty font-medium text-foreground text-2xl leading-[1.3] tracking-[-0.035em] md:min-h-[2lh] lg:text-3xl">
              {title}
            </h3>
            <p className="mt-5 text-muted-foreground text-sm leading-[1.9] sm:text-base">
              {description}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}
