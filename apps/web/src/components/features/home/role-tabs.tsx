// 用途：按角色切换（HR / 用人经理 / 候选人），每个角色配一块局部 UI 与一组颗粒渐变背景。
// Purpose: role tabs (HR / hiring manager / candidate), each with a focused UI block and grain backdrop.
"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import {
  IconBriefcase,
  IconCircleCheckFilled,
  IconMicrophone,
  IconUsers,
} from "@tabler/icons-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import * as messages from "@/paraglide/messages";
import { cn } from "@app/shared/utils";
import { getHomeDemoCopy } from "./home-demo-copy";
import type { StageArtworkPalette, StageArtworkPattern } from "./stage-artwork";
import { StageArtwork } from "./stage-artwork";
import { Section, SectionHeader } from "./section";

// 每个角色换一组颗粒渐变配色与纹样，颜色平滑过渡、纹样淡入。
// Each role switches grain palette and pattern; colours transition and the pattern fades in.
const ROLE_ARTWORK = {
  candidate: { palette: "harbor", pattern: "waves" },
  hr: { palette: "lilac", pattern: "rays" },
  manager: { palette: "dusk", pattern: "dots" },
} as const satisfies Record<
  StepValue,
  { palette: StageArtworkPalette; pattern: StageArtworkPattern }
>;

type StepValue = "candidate" | "hr" | "manager";

interface Step {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  body: string;
  demo: ReactNode;
  label: string;
  title: string;
  value: StepValue;
}

const STEP_DURATION_MS = 5000;
const STEP_VALUES = ["hr", "manager", "candidate"] as const satisfies readonly StepValue[];

function StepProgress({
  active,
  cycleKey,
  isVisible,
  reducedMotion,
}: {
  active: boolean;
  cycleKey: number;
  isVisible: boolean;
  reducedMotion: boolean;
}) {
  if (!active) {
    return null;
  }
  if (reducedMotion) {
    return <span className="absolute inset-0 bg-primary/70" data-process-progress />;
  }
  return (
    <m.span
      animate={{ scaleX: isVisible ? 1 : 0 }}
      className="absolute inset-0 bg-primary/70"
      data-process-progress
      initial={{ scaleX: 0 }}
      key={cycleKey}
      style={{ transformOrigin: "left center" }}
      transition={{ duration: STEP_DURATION_MS / 1000, ease: "linear" }}
    />
  );
}

function EvidenceScreeningBlock() {
  const copy = getHomeDemoCopy().roles.manager;

  return (
    <div className="w-full max-w-[44rem]" data-process-ui-block>
      <div className="overflow-hidden rounded-[10px] border border-transparent bg-card shadow-large">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Avatar className="size-7" label={copy.avatarLabel} seed="candidate:明日香" size="sm">
              <AvatarFallback>{getHomeDemoCopy().feature.candidateName.slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-[14px]">{copy.name}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{copy.role}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold text-2xl tabular-nums leading-none">87</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{copy.overallScore}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-[minmax(9rem,0.78fr)_minmax(0,1.22fr)]">
          <div className="px-4 py-3.5 sm:border-r">
            <p className="font-medium text-[12px] text-muted-foreground">{copy.originalTitle}</p>
            <div className="mt-3 space-y-3 text-[12px] text-foreground/58 leading-relaxed">
              {copy.originalLines.map((line, index) => (
                <p className={index === 2 ? "text-foreground/38" : undefined} key={line}>
                  {line}
                </p>
              ))}
            </div>
          </div>

          <div className="divide-y divide-border/65 border-t px-4 sm:border-t-0">
            {copy.items.map(([label, detail, source]) => (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2.5" key={label}>
                <div className="min-w-0">
                  <p className="font-medium text-[13px]">{label}</p>
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{detail}</p>
                </div>
                <span className="self-center text-[11px] text-muted-foreground">{source}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const STAGE_TONE = {
  ai: "bg-primary/10 text-primary",
  hired: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  human: "bg-amber-500/14 text-amber-700 dark:text-amber-300",
  screening: "bg-muted text-foreground/70",
} as const;

function HrPipelineBlock() {
  const copy = getHomeDemoCopy().roles.hr;

  return (
    <div className="w-full max-w-[44rem]" data-process-ui-block>
      <div className="overflow-hidden rounded-[10px] border border-transparent bg-card shadow-large">
        <div className="border-b px-4 py-3">
          <p className="truncate font-semibold text-base">{copy.title}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{copy.subtitle}</p>
        </div>
        <div className="grid grid-cols-[minmax(6rem,0.8fr)_minmax(6rem,0.8fr)_minmax(0,1.2fr)] bg-muted/24 px-4 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
          {copy.headers.map((header) => (
            <span key={header}>{header}</span>
          ))}
        </div>
        <div className="divide-y divide-border/65 px-4">
          {copy.rows.map(([name, stage, stageLabel, next]) => (
            <div
              className="grid grid-cols-[minmax(6rem,0.8fr)_minmax(6rem,0.8fr)_minmax(0,1.2fr)] items-center py-3 text-[13px]"
              key={name}
            >
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <Avatar className="size-6" label={name} seed={`candidate:${name}`} size="sm">
                  <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <span className="truncate">{name}</span>
              </span>
              <span>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 font-medium text-[12px]",
                    STAGE_TONE[stage],
                  )}
                >
                  {stageLabel}
                </span>
              </span>
              <span className="truncate text-muted-foreground">{next}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CandidateInviteBlock() {
  const copy = getHomeDemoCopy().roles.candidate;

  return (
    <div className="w-full max-w-[26rem]" data-process-ui-block>
      <div className="overflow-hidden rounded-[10px] border border-transparent bg-card shadow-large">
        <div className="px-5 pt-5 pb-4">
          <p className="text-[12px] text-muted-foreground">{copy.inviter}</p>
          <p className="mt-1 font-semibold text-lg">{copy.title}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{copy.duration}</p>
        </div>
        <div className="border-t px-5 py-4">
          <p className="font-medium text-[12px] text-muted-foreground">{copy.checksTitle}</p>
          <ul className="mt-2.5 space-y-2">
            {copy.checks.map(([label, status]) => (
              <li className="flex items-center justify-between gap-3 text-[13px]" key={label}>
                <span className="flex items-center gap-2">
                  <IconCircleCheckFilled aria-hidden="true" className="size-4 text-emerald-500" />
                  {label}
                </span>
                <span className="text-muted-foreground">{status}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t px-5 py-4">
          <span className="flex h-10 w-full items-center justify-center rounded-full bg-foreground font-medium text-[14px] text-background">
            {copy.start}
          </span>
          <p className="mt-2.5 text-center text-[12px] text-muted-foreground">{copy.note}</p>
        </div>
      </div>
    </div>
  );
}

function getSteps(): Step[] {
  return [
    {
      Icon: IconBriefcase,
      body: messages.home_persona_hr_description(),
      demo: <HrPipelineBlock />,
      label: messages.home_persona_hr_role(),
      title: messages.home_persona_hr_title(),
      value: "hr",
    },
    {
      Icon: IconUsers,
      body: messages.home_persona_manager_description(),
      demo: <EvidenceScreeningBlock />,
      label: messages.home_persona_manager_role(),
      title: messages.home_persona_manager_title(),
      value: "manager",
    },
    {
      Icon: IconMicrophone,
      body: messages.home_persona_candidate_description(),
      demo: <CandidateInviteBlock />,
      label: messages.home_persona_candidate_role(),
      title: messages.home_persona_candidate_title(),
      value: "candidate",
    },
  ];
}

export function RoleTabs() {
  const steps = getSteps();
  const [activeValue, setActiveValue] = useState<StepValue>("hr");
  const [cycleKey, setCycleKey] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const sectionRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const activeIndex = steps.findIndex((step) => step.value === activeValue);
  const activeStep = steps[activeIndex] ?? steps[0];
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) {
      return;
    }
    const Observer = globalThis.IntersectionObserver;
    if (!Observer) {
      return;
    }

    const observer = new Observer(([entry]) => setIsVisible(entry?.isIntersecting ?? false), {
      threshold: 0.25,
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!(isVisible && !prefersReducedMotion)) {
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setActiveValue((currentValue) => {
        const currentIndex = STEP_VALUES.indexOf(currentValue);
        return STEP_VALUES.at((currentIndex + 1) % STEP_VALUES.length) ?? STEP_VALUES[0];
      });
      setCycleKey((currentKey) => currentKey + 1);
    }, STEP_DURATION_MS);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [activeValue, cycleKey, isVisible, prefersReducedMotion]);

  const activateStep = (value: StepValue) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setActiveValue(value);
    setCycleKey((currentKey) => currentKey + 1);
  };
  const reducedMotion = prefersReducedMotion ?? false;

  return (
    <Section className="overflow-hidden" id="roles">
      <div ref={sectionRef}>
        <SectionHeader title={messages.home_roles_title()} lead={messages.home_roles_lead()} />

        <div className="mt-10 grid items-start gap-8 lg:mt-12 lg:grid-cols-[minmax(18rem,0.68fr)_minmax(0,1.32fr)] lg:gap-12 xl:gap-16">
          <div
            aria-label={messages.home_roles_aria()}
            className="min-w-0"
            data-cycle-duration={STEP_DURATION_MS}
            role="tablist"
          >
            {steps.map((step) => {
              const isActive = step.value === activeValue;
              return (
                <button
                  aria-controls="role-demo-panel"
                  aria-selected={isActive}
                  className="group block w-full py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-4 active:opacity-80 lg:py-5"
                  data-role-step={step.value}
                  key={step.value}
                  onClick={() => activateStep(step.value)}
                  role="tab"
                  type="button"
                >
                  <div className="flex items-center gap-3">
                    <step.Icon
                      aria-hidden="true"
                      className={cn(
                        "size-[18px] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none",
                        isActive ? "text-primary" : "text-foreground/60",
                      )}
                      strokeWidth={1.5}
                    />
                    <span
                      className={cn(
                        "font-medium text-sm transition-colors duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none",
                        isActive ? "text-foreground" : "text-foreground/68",
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none lg:mt-2 lg:grid-rows-[1fr] lg:opacity-100",
                      isActive
                        ? "mt-3 grid-rows-[1fr] opacity-100"
                        : "mt-0 grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <div className="min-h-0">
                      <h3
                        className={cn(
                          "text-balance font-medium text-xl tracking-[-0.035em] transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none sm:text-2xl",
                          !isActive && "text-foreground/72",
                        )}
                      >
                        {step.title}
                      </h3>
                      <p
                        className={cn(
                          "mt-2 max-w-md text-sm text-foreground/68 leading-relaxed transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none dark:text-white/72 lg:text-sm lg:leading-relaxed",
                        )}
                      >
                        {step.body}
                      </p>
                    </div>
                  </div>
                  <div className="relative mt-5 h-px overflow-hidden bg-border/70 lg:mt-3">
                    <StepProgress
                      active={isActive}
                      cycleKey={cycleKey}
                      isVisible={isVisible}
                      reducedMotion={reducedMotion}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <div
            aria-live="polite"
            className="relative min-h-[27rem] overflow-hidden rounded-[12px] [&_[data-slot=badge]]:rounded-[8px] sm:min-h-[32rem] lg:sticky lg:top-24 lg:min-h-0 lg:self-stretch"
            id="role-demo-panel"
            role="tabpanel"
          >
            <StageArtwork {...ROLE_ARTWORK[activeStep.value]} />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/[0.04] dark:to-black/15" />

            <div className="absolute inset-0 grid place-items-center p-4 sm:p-7 lg:p-8">
              <AnimatePresence initial={false} mode="wait">
                <m.div
                  animate={
                    prefersReducedMotion
                      ? { opacity: 1 }
                      : { filter: "blur(0px)", opacity: 1, y: 0 }
                  }
                  className="flex w-full justify-center"
                  exit={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { filter: "blur(3px)", opacity: 0, y: -8 }
                  }
                  initial={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { filter: "blur(3px)", opacity: 0, y: 8 }
                  }
                  key={activeStep.value}
                  transition={
                    reducedMotion ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
                  }
                >
                  {activeStep.demo}
                </m.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
