// 用途：以统一插画和局部 UI 讲清从岗位基准到团队决策的完整招聘流程。
// Purpose: explains the hiring workflow with one shared illustration and focused UI blocks.
"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@arc/shared/utils";
import { ModernArtwork } from "./modern-artwork";
import { Section, SectionLead, SectionTitle } from "./section";

interface Step {
  body: string;
  demo: ReactNode;
  label: string;
  number: string;
  title: string;
  value: string;
}

const STEP_DURATION_MS = 5000;

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

const ROLE_CRITERIA = [
  { label: "React 架构与工程化", value: "40%", width: "w-full" },
  { label: "复杂项目交付", value: "35%", width: "w-[88%]" },
  { label: "协作与技术决策", value: "25%", width: "w-[63%]" },
] as const;

function RoleBlueprintBlock() {
  return (
    <div className="w-full max-w-[34rem]" data-process-ui-block>
      <div className="overflow-hidden rounded-lg border border-border/80 bg-background/95 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.58)] backdrop-blur-[3px] dark:bg-background/92">
        <div className="flex min-w-0 items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-sm">资深前端工程师</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">岗位标尺 · 第 3 版</p>
          </div>
          <span className="shrink-0 text-[9px] text-muted-foreground">今天 10:24 更新</span>
        </div>

        <div className="grid sm:grid-cols-[minmax(0,1.35fr)_minmax(9rem,0.65fr)]">
          <div className="space-y-3.5 px-4 py-4 sm:border-r">
            <p className="font-medium text-[9px] text-muted-foreground">能力权重</p>
            {ROLE_CRITERIA.map((criterion) => (
              <div key={criterion.label}>
                <div className="flex items-center justify-between gap-3 text-[10px]">
                  <span>{criterion.label}</span>
                  <span className="font-medium tabular-nums">{criterion.value}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden bg-muted">
                  <div className={cn("h-full bg-primary/72", criterion.width)} />
                </div>
              </div>
            ))}
          </div>

          <div className="divide-y divide-border/70 border-t sm:border-t-0">
            <div className="px-3.5 py-3.5">
              <p className="font-medium text-[9px] text-muted-foreground">硬性门槛</p>
              <p className="mt-2 text-[10px] leading-relaxed">5 年以上 · 复杂项目 · 技术决策</p>
            </div>
            <div className="px-3.5 py-3.5">
              <p className="font-medium text-[9px] text-muted-foreground">使用范围</p>
              <p className="mt-2 text-[10px] leading-relaxed">筛选、复面与团队评审</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const EVIDENCE_ITEMS = [
  { detail: "主导 4 条产品线的设计系统迁移", label: "复杂项目交付", source: "简历 · 第 2 页" },
  { detail: "将平均交付周期缩短 30%", label: "结果影响", source: "项目经历" },
  { detail: "带队规模与直接管理范围未说明", label: "待确认风险", source: "需要追问" },
] as const;

function EvidenceScreeningBlock() {
  return (
    <div className="w-full max-w-[34rem]" data-process-ui-block>
      <div className="overflow-hidden rounded-lg border border-border/80 bg-background/95 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.58)] backdrop-blur-[3px] dark:bg-background/92">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Avatar
              className="size-7"
              generatedSize={28}
              label="李晗的头像"
              seed="candidate:李晗"
              size="sm"
            >
              <AvatarFallback>李</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-[11px]">李晗 · 简历筛选</p>
              <p className="mt-0.5 text-[9px] text-muted-foreground">高级前端工程师 · 8 年经验</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold text-lg tabular-nums leading-none">87</p>
            <p className="mt-1 text-[8px] text-muted-foreground">综合评分</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-[minmax(9rem,0.78fr)_minmax(0,1.22fr)]">
          <div className="px-4 py-3.5 sm:border-r">
            <p className="font-medium text-[9px] text-muted-foreground">简历原文 · 第 2 页</p>
            <div className="mt-3 space-y-3 text-[9px] text-foreground/58 leading-relaxed">
              <p>
                主导 <mark className="bg-primary/10 px-0.5 text-foreground">4 条产品线</mark>
                的设计系统迁移，并负责发布策略。
              </p>
              <p>
                将平均交付周期缩短 <mark className="bg-primary/10 px-0.5 text-foreground">30%</mark>
                。
              </p>
              <p className="text-foreground/38">团队规模与直接管理范围未说明。</p>
            </div>
          </div>

          <div className="divide-y divide-border/65 border-t px-4 sm:border-t-0">
            {EVIDENCE_ITEMS.map((item) => (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2.5" key={item.label}>
                <div className="min-w-0">
                  <p className="font-medium text-[10px]">{item.label}</p>
                  <p className="mt-0.5 truncate text-[9px] text-muted-foreground">{item.detail}</p>
                </div>
                <span className="self-center text-[8px] text-muted-foreground">{item.source}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const INTERVIEW_QUESTIONS = [
  {
    label: "项目所有权",
    question: "设计系统迁移中，你本人承担了哪些关键决策？",
    source: "来自简历证据",
  },
  {
    label: "结果验证",
    question: "交付周期缩短 30% 的统计口径是什么？",
    source: "来自结果影响",
  },
  {
    label: "风险确认",
    question: "请说明直接管理人数，以及跨团队协作边界。",
    source: "来自待确认项",
  },
] as const;

function InterviewGuideBlock() {
  return (
    <div className="w-full max-w-[34rem]" data-process-ui-block>
      <div className="overflow-hidden rounded-lg border border-border/80 bg-background/95 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.58)] backdrop-blur-[3px] dark:bg-background/92">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-sm">李晗 · 真人复面问题</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">根据简历中的待确认项整理</p>
          </div>
          <span className="shrink-0 text-[9px] text-muted-foreground">3 个待验证项</span>
        </div>

        <div className="grid grid-cols-[minmax(7rem,0.7fr)_minmax(0,1.3fr)] border-b bg-muted/24 px-4 py-2 font-medium text-[8px] text-muted-foreground uppercase tracking-[0.08em]">
          <span>待验证维度</span>
          <span>真人复面问题</span>
        </div>
        <div className="divide-y divide-border/65 px-4">
          {INTERVIEW_QUESTIONS.map((item, index) => (
            <div
              className="grid grid-cols-[minmax(7rem,0.7fr)_minmax(0,1.3fr)] gap-4 py-3"
              key={item.label}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="font-mono text-[9px] text-primary leading-6">0{index + 1}</span>
                <div className="min-w-0">
                  <p className="font-medium text-[10px]">{item.label}</p>
                  <p className="mt-1 text-[8px] text-muted-foreground">{item.source}</p>
                </div>
              </div>
              <p className="text-[10px] text-foreground/72 leading-relaxed">{item.question}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-[9px] text-muted-foreground">
          <span>面试回答将回写证据完整度</span>
          <span>已同步给面试官</span>
        </div>
      </div>
    </div>
  );
}

const DECISION_FACTS = [
  ["能力匹配", "88"],
  ["证据完整", "84"],
  ["稳定性", "78"],
] as const;
const TEAM_VERDICTS = [
  ["郭", "建议复试", "核心能力明确"],
  ["林", "建议复试", "风险已确认"],
  ["周", "建议推进", "证据较完整"],
] as const;

function TeamDecisionBlock() {
  return (
    <div className="w-full max-w-[34rem]" data-process-ui-block>
      <div className="overflow-hidden rounded-lg border border-border/80 bg-background/95 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.58)] backdrop-blur-[3px] dark:bg-background/92">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <p className="font-semibold text-sm">李晗 · 团队评审记录</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">3 位面试官 · 同一份证据</p>
          </div>
          <span className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            意见已收齐
          </span>
        </div>

        <div className="grid grid-cols-[4rem_minmax(5rem,0.65fr)_minmax(0,1fr)] bg-muted/24 px-4 py-2 font-medium text-[8px] text-muted-foreground uppercase tracking-[0.08em]">
          <span>面试官</span>
          <span>判断</span>
          <span>依据</span>
        </div>
        <div className="divide-y divide-border/65 px-4">
          {TEAM_VERDICTS.map(([name, verdict, note]) => (
            <div
              className="grid grid-cols-[4rem_minmax(5rem,0.65fr)_minmax(0,1fr)] items-center py-3 text-[10px]"
              key={name}
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Avatar
                  className="size-5"
                  generatedSize={20}
                  label={`${name}老师的头像`}
                  seed={`interviewer:${name}`}
                  size="sm"
                >
                  <AvatarFallback>{name}</AvatarFallback>
                </Avatar>
                {name}老师
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
              <p className="text-[9px] text-muted-foreground">最终决定</p>
              <p className="mt-1 font-semibold text-sm">进入下一轮复面</p>
            </div>
            <div className="grid flex-1 grid-cols-3 gap-3">
              {DECISION_FACTS.map(([label, value]) => (
                <div className="border-border/70 border-l pl-3 text-right" key={label}>
                  <p className="font-semibold text-sm tabular-nums leading-none">{value}</p>
                  <p className="mt-1 text-[8px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2.5 border-border/70 border-t pt-2 text-[9px] text-muted-foreground leading-relaxed">
            核心能力有直接项目证据，带队规模已在复面中确认。
          </p>
        </div>
      </div>
    </div>
  );
}

const steps: Step[] = [
  {
    body: "把职责、硬性门槛和能力权重整理成团队共用的判断标尺，后续不再各凭印象。",
    demo: <RoleBlueprintBlock />,
    label: "岗位标尺",
    number: "01",
    title: "先定义什么是合适",
    value: "role",
  },
  {
    body: "岗位维度与简历原文逐条对应，结论、来源和待确认风险都能被复核。",
    demo: <EvidenceScreeningBlock />,
    label: "证据映射",
    number: "02",
    title: "每个结论，都能点回原文",
    value: "screening",
  },
  {
    body: "把尚未证实的判断转成真人复面问题，面试官清楚为什么问、回答要补全什么。",
    demo: <InterviewGuideBlock />,
    label: "面试验证",
    number: "03",
    title: "把不确定项，变成有目的的追问",
    value: "interview",
  },
  {
    body: "并排呈现每位面试官的判断与依据，让分歧显性化，再形成最终决策。",
    demo: <TeamDecisionBlock />,
    label: "团队共识",
    number: "04",
    title: "把分歧摊开，再做决定",
    value: "decision",
  },
];

export function ProcessTabs() {
  const [activeValue, setActiveValue] = useState(steps[0].value);
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
        const currentIndex = steps.findIndex((step) => step.value === currentValue);
        return steps.at((currentIndex + 1) % steps.length)?.value ?? steps[0].value;
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

  const activateStep = (value: string) => {
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
          <SectionTitle className="mt-0">从岗位开始。到决定结束。</SectionTitle>
          <SectionLead>
            同一份岗位语境，贯穿筛选、面试准备和团队评审。每一步只呈现当前真正需要判断的信息。
          </SectionLead>
        </div>

        <div className="mt-12 grid items-start gap-10 lg:mt-14 lg:grid-cols-[minmax(18rem,0.68fr)_minmax(0,1.32fr)] lg:gap-12 xl:gap-16">
          <div
            aria-label="招聘流程"
            className="min-w-0"
            data-cycle-duration={STEP_DURATION_MS}
            role="tablist"
          >
            {steps.map((step) => {
              const isActive = step.value === activeValue;
              return (
                <button
                  aria-controls="process-demo-panel"
                  aria-label={`查看${step.label}：${step.title}`}
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
                        "font-mono text-[10px] transition-colors",
                        isActive ? "text-primary" : "text-foreground/35",
                      )}
                    >
                      {step.number}
                    </span>
                    <span
                      className={cn(
                        "font-medium text-sm transition-colors",
                        isActive ? "text-foreground" : "text-foreground/50",
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-300 lg:mt-2 lg:grid-rows-[1fr] lg:opacity-100",
                      isActive
                        ? "mt-3 grid-rows-[1fr] opacity-100"
                        : "mt-0 grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <div className="min-h-0">
                      <h3
                        className={cn(
                          "text-balance font-medium text-xl tracking-tight transition-opacity sm:text-2xl",
                          !isActive && "lg:opacity-45",
                        )}
                      >
                        {step.title}
                      </h3>
                      <p
                        className={cn(
                          "mt-2 max-w-md text-sm text-foreground/60 leading-relaxed transition-opacity dark:text-white/68 lg:text-[13px] lg:leading-5",
                          !isActive && "lg:opacity-45",
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
                      : { filter: "blur(5px)", opacity: 0, y: -10 }
                  }
                  initial={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { filter: "blur(5px)", opacity: 0, y: 12 }
                  }
                  key={activeStep.value}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
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
