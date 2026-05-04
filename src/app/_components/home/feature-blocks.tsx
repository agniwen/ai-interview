// 用途：苹果官网风格的 pinned 滚动叙事——进入区段后视口锁定，滚动驱动三幕场景切换
// Purpose: Apple-style pinned scroll storytelling — viewport locks in section, scroll progress drives 3-scene crossfade.
"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CheckIcon } from "lucide-react";
import { useCallback, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Screenshot } from "./screenshot";
import { Eyebrow, Section, SectionLead, SectionTitle } from "./section";

interface Block {
  bullets: string[];
  darkSrc: string;
  eyebrow: string;
  imageAlt: string;
  imageHeight: number;
  imageWidth: number;
  lead: string;
  lightSrc: string;
  title: string;
}

const blocks: Block[] = [
  {
    bullets: [
      "支持一次上传多份 PDF 简历",
      "围绕岗位要求持续追问候选人亮点与风险",
      "自动汇总筛选建议，便于团队对齐",
    ],
    darkSrc: "/landing/chat-dark.png",
    eyebrow: "Resume Screening",
    imageAlt: "聊天式简历初筛界面",
    imageHeight: 900,
    imageWidth: 1440,
    lead: "把简历筛选变成一次自然的对话：上传简历后直接和 AI 讨论候选人的匹配度、亮点和风险，节省阅读全文的时间。",
    lightSrc: "/landing/chat-light.png",
    title: "聊天式简历初筛，按岗位语境追问",
  },
  {
    bullets: [
      "在工作台维护岗位、JD、面试官人设、面试问题",
      "全局配置一次设定多次复用",
      "JD 与候选人评估上下文打通",
    ],
    darkSrc: "/landing/studio-dark.png",
    eyebrow: "Workspace",
    imageAlt: "工作台岗位与全局配置界面",
    imageHeight: 900,
    imageWidth: 1440,
    lead: "在工作台里组织岗位描述、面试官人设和题库，让每一次评估都建立在真实招聘语境上，而不是孤立的关键词匹配。",
    lightSrc: "/landing/studio-light.png",
    title: "围绕真实岗位语境的统一工作台",
  },
  {
    bullets: [
      "实时语音对话，追问节奏可控",
      "自动记录候选人作答、节奏、停顿",
      "面试结束即获得结构化评估",
    ],
    darkSrc: "/landing/interview-dark.png",
    eyebrow: "Voice Interview",
    imageAlt: "实时语音模拟面试界面",
    imageHeight: 900,
    imageWidth: 1440,
    lead: "把链接发给候选人，即可进入与人类节奏接近的语音模拟面试。AI 会根据简历与岗位语境追问，并给出结构化评估。",
    lightSrc: "/landing/interview-light.png",
    title: "实时语音模拟面试，沉淀完整对话",
  },
];

interface SceneProps {
  block: Block;
  index: number;
}

function Scene({ block, index }: SceneProps) {
  const reversed = index % 2 === 1;
  return (
    <div
      className={cn(
        "grid h-full grid-cols-1 items-center gap-10 lg:gap-16",
        // 用列宽翻转 + first-child order 翻转，确保 Image 永远占大列（7fr），三幕图片尺寸一致
        // Flip both column widths AND child order so the Image stays in the 7fr column on both sides
        reversed
          ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:[&>:first-child]:order-2"
          : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
      )}
    >
      <div>
        <Eyebrow>{block.eyebrow}</Eyebrow>
        <SectionTitle>{block.title}</SectionTitle>
        <SectionLead>{block.lead}</SectionLead>
        <ul className="mt-6 space-y-3 text-foreground/80 text-sm sm:text-base">
          {block.bullets.map((bullet) => (
            <li className="flex items-start gap-2" key={bullet}>
              <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex w-full items-center justify-center">
        <Screenshot
          alt={block.imageAlt}
          className="w-full"
          darkSrc={block.darkSrc}
          height={block.imageHeight}
          lightSrc={block.lightSrc}
          width={block.imageWidth}
        />
      </div>
    </div>
  );
}

// 各场景在 ScrollTrigger 进度（0~1）上的目标停留位置——选每段 dwell 的中点
// Target progress per scene — mid of each dwell phase (visually settled, no transition)
// 时间轴：opening dwell 0..0.6（0..15%），0→1 转场 0.6..1.6（15..40%），mid dwell 1.6..2.2（40..55%），1→2 转场 2.2..3.2（55..80%），closing dwell 3.2..4（80..100%）
const SCENE_TARGET_PROGRESS = [0.075, 0.475, 0.9] as const;

export function FeatureBlocks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const fillRef = useRef<HTMLSpanElement>(null);
  const labelRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const triggerRef = useRef<ScrollTrigger | null>(null);

  // 点击进度条标签：跳转到该场景的中点位置
  // Click on progress bar label: jump to that scene's settled mid-point
  const handleSeek = useCallback((sceneIndex: number) => {
    const trigger = triggerRef.current;
    const viewport = document.querySelector<HTMLElement>("[data-overlayscrollbars-viewport]");
    if (!(trigger && viewport)) {
      return;
    }
    const targetProgress = SCENE_TARGET_PROGRESS[sceneIndex] ?? 0;
    const targetScroll = trigger.start + targetProgress * (trigger.end - trigger.start);

    // 自定义 GSAP 中转 tween 平滑设置 scrollTop（避免依赖 ScrollToPlugin）
    // Tween scrollTop via a proxy to avoid the ScrollToPlugin dependency
    const proxy = { y: viewport.scrollTop };
    gsap.killTweensOf(proxy);
    gsap.to(proxy, {
      duration: 0.9,
      ease: "power2.inOut",
      onUpdate() {
        viewport.scrollTop = proxy.y;
      },
      y: targetScroll,
    });
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    gsap.registerPlugin(ScrollTrigger);

    // 应用使用 OverlayScrollbars 作为整页滚动容器；pin 必须以该 viewport 作为 scroller。
    // The whole app scrolls inside an OverlayScrollbars viewport; pinning must use it as ScrollTrigger's scroller.
    const viewport = document.querySelector<HTMLElement>("[data-overlayscrollbars-viewport]");

    const ctx = gsap.context(() => {
      // reduced-motion: 直接展示，不做 pin/scrub
      // Reduced-motion: skip animation entirely
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      // 让 ScrollTrigger 知道滚动发生在自定义容器里
      // Tell ScrollTrigger about the custom scroll container
      if (viewport) {
        ScrollTrigger.scrollerProxy(viewport, {
          getBoundingClientRect() {
            return {
              height: window.innerHeight,
              left: 0,
              top: 0,
              width: window.innerWidth,
            };
          },
          scrollTop(value) {
            if (value !== undefined) {
              viewport.scrollTop = value;
            }
            return viewport.scrollTop;
          },
        });
        const onScroll = () => ScrollTrigger.update();
        viewport.addEventListener("scroll", onScroll, { passive: true });
        // 卸载时由 ctx.revert + 下面的 cleanup 处理
      }

      const mm = gsap.matchMedia();

      mm.add("(min-width: 1024px)", () => {
        const scenes = sceneRefs.current.filter((el): el is HTMLDivElement => el !== null);
        const labels = labelRefs.current.filter((el): el is HTMLButtonElement => el !== null);
        const fill = fillRef.current;
        if (scenes.length < 3) {
          return;
        }

        // 初始：场景 0 可见，1 / 2 隐藏并略放大、上移做"待入场"姿态
        // Initial: scene 0 visible; scenes 1/2 hidden, slightly scaled up + lifted, ready to enter
        gsap.set(scenes[0], { autoAlpha: 1, scale: 1, y: 0 });
        gsap.set([scenes[1], scenes[2]], { autoAlpha: 0, scale: 1.06, y: 30 });
        if (fill) {
          gsap.set(fill, { scaleX: 0, transformOrigin: "0% 50%" });
        }

        const tl = gsap.timeline({
          defaults: { ease: "power2.inOut" },
          scrollTrigger: {
            anticipatePin: 1,
            // 显式按视口高度计算 4 倍滚动距离，给 scrub 平滑留出缓冲
            // Explicit 4x viewport scroll distance — leaves headroom for scrub catch-up
            end: () => `+=${window.innerHeight * 4}`,
            invalidateOnRefresh: true,
            // 进度条 + 当前场景标签：直接用 ScrollTrigger.progress 驱动，最精确
            // Progress bar + active label: drive directly off ScrollTrigger.progress for precise mapping
            onUpdate: (self) => {
              const p = self.progress;
              if (fill) {
                fill.style.transform = `scaleX(${p})`;
              }
              if (labels.length === 3) {
                // 与时间轴节奏对齐：开场停留 0.6 + 转场 1 + 中段停留 0.6 + 转场 1 + 结尾停留 0.8 = 4
                // Boundary points (in 0..1): switch to scene 1 mid-way through 0→1 transition; same for 1→2
                // 0→1 过渡跨 0.6..1.6（占 15%..40% 进度），中点 27.5%；1→2 过渡跨 2.2..3.2（占 55%..80%），中点 67.5%
                let sceneIndex = 0;
                if (p >= 0.675) {
                  sceneIndex = 2;
                } else if (p >= 0.275) {
                  sceneIndex = 1;
                }
                for (let i = 0; i < labels.length; i += 1) {
                  const isActive = i === sceneIndex;
                  labels[i].style.color = isActive
                    ? "var(--color-foreground)"
                    : "color-mix(in srgb, var(--color-foreground) 40%, transparent)";
                  labels[i].style.opacity = isActive ? "1" : "0.55";
                }
              }
            },
            pin: true,
            pinSpacing: true,
            scroller: viewport ?? undefined,
            scrub: 0.4,
            start: "top top",
            trigger: sectionRef.current,
          },
        });

        triggerRef.current = tl.scrollTrigger ?? null;

        // 时间轴节奏：开场停留 → 0→1 → 中段停留 → 1→2 → 结尾停留
        // Timeline beats: opening dwell → 0→1 → mid dwell → 1→2 → closing dwell
        // 开场停留 / Opening dwell
        tl.to({}, { duration: 0.6 });

        // 场景 0 → 1
        // Scene 0 → 1
        tl.to(scenes[0], { autoAlpha: 0, duration: 1, scale: 0.94, y: -30 }).to(
          scenes[1],
          { autoAlpha: 1, duration: 1, scale: 1, y: 0 },
          "<",
        );

        // 中段停留 / Mid dwell on scene 1
        tl.to({}, { duration: 0.6 });

        // 场景 1 → 2
        // Scene 1 → 2
        tl.to(scenes[1], { autoAlpha: 0, duration: 1, scale: 0.94, y: -30 }).to(
          scenes[2],
          { autoAlpha: 1, duration: 1, scale: 1, y: 0 },
          "<",
        );

        // 结尾停留：让 scene 2 静止一会儿再让 pin 释放
        // Closing dwell — keeps scene 2 visible until pin releases
        tl.to({}, { duration: 0.8 });
      });
    }, sectionRef);

    return () => {
      ctx.revert();
      // 清除 scrollerProxy（仅清除我们注册的，避免影响后续）
      // Detach scrollerProxy on unmount (clean removal only)
      if (viewport) {
        ScrollTrigger.scrollerProxy(viewport);
      }
    };
  }, []);

  return (
    <div className="relative" ref={sectionRef}>
      {/* lg+: pinned 舞台，三幕叠加 */}
      {/* lg+: pinned stage with overlapping scenes */}
      <div className="hidden lg:block">
        <div
          className="relative mx-auto flex h-screen w-full max-w-7xl items-center px-5 py-14 sm:px-8"
          ref={stageRef}
        >
          <div className="relative h-full w-full">
            {blocks.map((block, i) => (
              <div
                className="absolute inset-0 flex items-center"
                key={block.title}
                ref={(el) => {
                  sceneRefs.current[i] = el;
                }}
              >
                <Scene block={block} index={i} />
              </div>
            ))}
          </div>

          {/* 进度条：横向条形 + 标尺刻度 + 三段标签 */}
          {/* Progress bar: horizontal track + tick marks + 3-segment labels */}
          <div className="-translate-x-1/2 absolute bottom-6 left-1/2 flex w-[min(560px,80vw)] flex-col items-center gap-3">
            <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-foreground/10">
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-foreground/85"
                ref={fillRef}
                style={{ transform: "scaleX(0)" }}
              />
              {/* 场景分界刻度 / Scene boundary ticks */}
              <span
                aria-hidden="true"
                className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/30"
                style={{ left: "33.33%" }}
              />
              <span
                aria-hidden="true"
                className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/30"
                style={{ left: "66.66%" }}
              />
            </div>
            <div className="grid w-full grid-cols-3 font-medium text-[10px] text-foreground/55 uppercase tracking-[0.16em]">
              {blocks.map((block, i) => {
                let align = "text-center";
                if (i === 0) {
                  align = "text-left";
                } else if (i === 2) {
                  align = "text-right";
                }
                return (
                  <button
                    className={cn(
                      "cursor-pointer rounded-sm py-1 transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground/40 focus-visible:outline-offset-2",
                      align,
                    )}
                    key={block.title}
                    onClick={() => handleSeek(i)}
                    ref={(el) => {
                      labelRefs.current[i] = el;
                    }}
                    type="button"
                  >
                    {block.eyebrow}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* mobile: 单列堆叠 / Mobile: stacked, no pin */}
      <Section className="lg:hidden" width="wide">
        <div className="space-y-20 sm:space-y-24">
          {blocks.map((block, i) => (
            <div
              className={cn(
                "grid grid-cols-1 items-center gap-10",
                i % 2 === 1 && "[&>:first-child]:order-2",
              )}
              key={block.title}
            >
              <div>
                <Eyebrow>{block.eyebrow}</Eyebrow>
                <SectionTitle>{block.title}</SectionTitle>
                <SectionLead>{block.lead}</SectionLead>
                <ul className="mt-6 space-y-3 text-foreground/80 text-sm sm:text-base">
                  {block.bullets.map((bullet) => (
                    <li className="flex items-start gap-2" key={bullet}>
                      <CheckIcon
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-primary"
                      />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Screenshot
                alt={block.imageAlt}
                darkSrc={block.darkSrc}
                height={block.imageHeight}
                lightSrc={block.lightSrc}
                width={block.imageWidth}
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
