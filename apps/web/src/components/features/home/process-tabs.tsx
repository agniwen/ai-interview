// 用途：以统一插画和局部 UI 讲清从岗位基准到团队决策的完整招聘流程。
// Purpose: explains the hiring workflow with one shared illustration and focused UI blocks.
"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import * as messages from "@/paraglide/messages";
import { cn } from "@arc/shared/utils";
import { getHomeDemoCopy } from "./home-demo-copy";
import { ModernArtwork } from "./modern-artwork";
import { Section, SectionLead, SectionTitle } from "./section";

type StepValue = "decision" | "interview" | "role" | "screening";

interface Step {
  body: string;
  demo: ReactNode;
  label: string;
  number: string;
  title: string;
  value: StepValue;
}

const STEP_DURATION_MS = 5000;
const STEP_VALUES = [
  "role",
  "screening",
  "interview",
  "decision",
] as const satisfies readonly StepValue[];

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

function RoleBlueprintBlock() {
  const copy = getHomeDemoCopy().process.role;

  return (
    <div className="w-full max-w-[34rem]" data-process-ui-block>
      <div className="overflow-hidden rounded-lg border border-border/80 bg-background/95 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.58)] backdrop-blur-[3px] dark:bg-background/92">
        <div className="flex min-w-0 items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-sm">{copy.title}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{copy.subtitle}</p>
          </div>
          <span className="shrink-0 text-[9px] text-muted-foreground">{copy.updated}</span>
        </div>

        <div className="grid sm:grid-cols-[minmax(0,1.35fr)_minmax(9rem,0.65fr)]">
          <div className="space-y-3.5 px-4 py-4 sm:border-r">
            <p className="font-medium text-[9px] text-muted-foreground">{copy.weights}</p>
            {copy.criteria.map(([label, value, width]) => (
              <div key={label}>
                <div className="flex items-center justify-between gap-3 text-[10px]">
                  <span>{label}</span>
                  <span className="font-medium tabular-nums">{value}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden bg-muted">
                  <div className={cn("h-full bg-primary/72", width)} />
                </div>
              </div>
            ))}
          </div>

          <div className="divide-y divide-border/70 border-t sm:border-t-0">
            <div className="px-3.5 py-3.5">
              <p className="font-medium text-[9px] text-muted-foreground">
                {copy.hardRequirementsLabel}
              </p>
              <p className="mt-2 text-[10px] leading-relaxed">{copy.hardRequirements}</p>
            </div>
            <div className="px-3.5 py-3.5">
              <p className="font-medium text-[9px] text-muted-foreground">{copy.scopeLabel}</p>
              <p className="mt-2 text-[10px] leading-relaxed">{copy.scope}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EvidenceScreeningBlock() {
  const copy = getHomeDemoCopy().process.evidence;

  return (
    <div className="w-full max-w-[34rem]" data-process-ui-block>
      <div className="overflow-hidden rounded-lg border border-border/80 bg-background/95 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.58)] backdrop-blur-[3px] dark:bg-background/92">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Avatar
              className="size-7"
              generatedSize={28}
              label={copy.avatarLabel}
              seed="candidate:李晗"
              size="sm"
            >
              <AvatarFallback>李</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-[11px]">{copy.name}</p>
              <p className="mt-0.5 text-[9px] text-muted-foreground">{copy.role}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold text-lg tabular-nums leading-none">87</p>
            <p className="mt-1 text-[8px] text-muted-foreground">{copy.overallScore}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-[minmax(9rem,0.78fr)_minmax(0,1.22fr)]">
          <div className="px-4 py-3.5 sm:border-r">
            <p className="font-medium text-[9px] text-muted-foreground">{copy.originalTitle}</p>
            <div className="mt-3 space-y-3 text-[9px] text-foreground/58 leading-relaxed">
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
                  <p className="font-medium text-[10px]">{label}</p>
                  <p className="mt-0.5 truncate text-[9px] text-muted-foreground">{detail}</p>
                </div>
                <span className="self-center text-[8px] text-muted-foreground">{source}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function InterviewGuideBlock() {
  const copy = getHomeDemoCopy().process.interview;

  return (
    <div className="w-full max-w-[34rem]" data-process-ui-block>
      <div className="overflow-hidden rounded-lg border border-border/80 bg-background/95 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.58)] backdrop-blur-[3px] dark:bg-background/92">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-sm">{copy.title}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{copy.subtitle}</p>
          </div>
          <span className="shrink-0 text-[9px] text-muted-foreground">{copy.count}</span>
        </div>

        <div className="grid grid-cols-[minmax(7rem,0.7fr)_minmax(0,1.3fr)] border-b bg-muted/24 px-4 py-2 font-medium text-[8px] text-muted-foreground uppercase tracking-[0.08em]">
          <span>{copy.headers[0]}</span>
          <span>{copy.headers[1]}</span>
        </div>
        <div className="divide-y divide-border/65 px-4">
          {copy.questions.map(([label, question, source], index) => (
            <div
              className="grid grid-cols-[minmax(7rem,0.7fr)_minmax(0,1.3fr)] gap-4 py-3"
              key={label}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="font-mono text-[9px] text-primary leading-6">0{index + 1}</span>
                <div className="min-w-0">
                  <p className="font-medium text-[10px]">{label}</p>
                  <p className="mt-1 text-[8px] text-muted-foreground">{source}</p>
                </div>
              </div>
              <p className="text-[10px] text-foreground/72 leading-relaxed">{question}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-[9px] text-muted-foreground">
          <span>{copy.footers[0]}</span>
          <span>{copy.footers[1]}</span>
        </div>
      </div>
    </div>
  );
}

function TeamDecisionBlock() {
  const copy = getHomeDemoCopy().process.decision;

  return (
    <div className="w-full max-w-[34rem]" data-process-ui-block>
      <div className="overflow-hidden rounded-lg border border-border/80 bg-background/95 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.58)] backdrop-blur-[3px] dark:bg-background/92">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <p className="font-semibold text-sm">{copy.title}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{copy.subtitle}</p>
          </div>
          <span className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {copy.collected}
          </span>
        </div>

        <div className="grid grid-cols-[4rem_minmax(5rem,0.65fr)_minmax(0,1fr)] bg-muted/24 px-4 py-2 font-medium text-[8px] text-muted-foreground uppercase tracking-[0.08em]">
          <span>{copy.headers[0]}</span>
          <span>{copy.headers[1]}</span>
          <span>{copy.headers[2]}</span>
        </div>
        <div className="divide-y divide-border/65 px-4">
          {copy.verdicts.map(([name, verdict, note]) => (
            <div
              className="grid grid-cols-[4rem_minmax(5rem,0.65fr)_minmax(0,1fr)] items-center py-3 text-[10px]"
              key={name}
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Avatar
                  className="size-5"
                  generatedSize={20}
                  label={name}
                  seed={`interviewer:${name}`}
                  size="sm"
                >
                  <AvatarFallback>{name}</AvatarFallback>
                </Avatar>
                {name}
              </span>
              <span className="font-medium text-primary">{verdict}</span>
              <span className="text-muted-foreground">{note}</span>
            </div>
          ))}
        </div>

        <div
          className="border-t bg-primary/[0.035] px-4 py-3 dark:bg-white/[0.025]"
          data-process-decision-summary
        >
          <div className="flex items-center justify-between gap-4">
            <div className="shrink-0">
              <p className="text-[9px] text-muted-foreground">{copy.finalDecision}</p>
              <p className="mt-1 font-semibold text-sm">{copy.finalValue}</p>
            </div>
            <div className="grid flex-1 grid-cols-3 gap-3">
              {copy.facts.map(([label, value]) => (
                <div className="border-border/70 border-l pl-3 text-right" key={label}>
                  <p className="font-semibold text-sm tabular-nums leading-none">{value}</p>
                  <p className="mt-1 text-[8px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2.5 border-border/70 border-t pt-2 text-[9px] text-muted-foreground leading-relaxed">
            {copy.summary}
          </p>
        </div>
      </div>
    </div>
  );
}

function getSteps(): Step[] {
  return [
    {
      body: messages.home_process_scale_body(),
      demo: <RoleBlueprintBlock />,
      label: messages.home_process_scale_label(),
      number: "01",
      title: messages.home_process_scale_title(),
      value: "role",
    },
    {
      body: messages.home_process_evidence_body(),
      demo: <EvidenceScreeningBlock />,
      label: messages.home_process_evidence_label(),
      number: "02",
      title: messages.home_process_evidence_title(),
      value: "screening",
    },
    {
      body: messages.home_process_interview_body(),
      demo: <InterviewGuideBlock />,
      label: messages.home_process_interview_label(),
      number: "03",
      title: messages.home_process_interview_title(),
      value: "interview",
    },
    {
      body: messages.home_process_consensus_body(),
      demo: <TeamDecisionBlock />,
      label: messages.home_process_consensus_label(),
      number: "04",
      title: messages.home_process_consensus_title(),
      value: "decision",
    },
  ];
}

export function ProcessTabs() {
  const steps = getSteps();
  const [activeValue, setActiveValue] = useState<StepValue>("role");
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
    <Section className="overflow-hidden" width="wide">
      <div ref={sectionRef}>
        <div className="max-w-3xl">
          <SectionTitle className="mt-0">{messages.home_process_title()}</SectionTitle>
          <SectionLead>{messages.home_process_lead()}</SectionLead>
        </div>

        <div className="mt-12 grid items-start gap-10 lg:mt-14 lg:grid-cols-[minmax(18rem,0.68fr)_minmax(0,1.32fr)] lg:gap-12 xl:gap-16">
          <div
            aria-label={messages.home_process_aria()}
            className="min-w-0"
            data-cycle-duration={STEP_DURATION_MS}
            role="tablist"
          >
            {steps.map((step) => {
              const isActive = step.value === activeValue;
              return (
                <button
                  aria-controls="process-demo-panel"
                  aria-selected={isActive}
                  className="group block w-full py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-4 active:opacity-80 lg:py-2.5"
                  data-process-step={step.value}
                  key={step.value}
                  onClick={() => activateStep(step.value)}
                  role="tab"
                  type="button"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "font-mono text-[10px] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none",
                        isActive ? "text-primary" : "text-foreground/70",
                      )}
                    >
                      {step.number}
                    </span>
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
                          "text-balance font-medium text-xl tracking-tight transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none sm:text-2xl",
                          !isActive && "text-foreground/72",
                        )}
                      >
                        {step.title}
                      </h3>
                      <p
                        className={cn(
                          "mt-2 max-w-md text-sm text-foreground/68 leading-relaxed transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none dark:text-white/72 lg:text-[13px] lg:leading-5",
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
            className="relative min-h-[27rem] overflow-hidden  sm:min-h-[32rem] lg:sticky lg:top-24 lg:min-h-0 lg:self-stretch"
            id="process-demo-panel"
            role="tabpanel"
          >
            <ModernArtwork
              assetPath="/landing/optimized/process-scenes/recruitment-workflow-v2-light"
              className="absolute inset-0 size-full object-cover contrast-[0.96] saturate-[0.84] dark:hidden"
              dataAttributes={{ "data-process-artwork": "light" }}
              fallbackPath="/landing/process-scenes/recruitment-workflow-v2-light.jpg"
              height={1171}
              width={1343}
            />
            <ModernArtwork
              assetPath="/landing/optimized/process-scenes/recruitment-workflow-v2-dark"
              className="absolute inset-0 hidden size-full object-cover contrast-[0.98] saturate-[0.88] dark:block"
              dataAttributes={{ "data-process-artwork": "dark" }}
              fallbackPath="/landing/process-scenes/recruitment-workflow-v2-dark.jpg"
              height={1171}
              width={1343}
            />
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
