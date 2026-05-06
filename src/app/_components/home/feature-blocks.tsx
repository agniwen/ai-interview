// 用途：苹果官网风格的 pinned 滚动叙事——三段差异化排版，内部元素随滚动渐进揭示
// Purpose: Apple-style pinned scroll storytelling — 3 distinct layouts, inner content reveals progressively as user scrolls (fully revealed by ~70% of each scene).
"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useCallback, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { CenterCarousel } from "./center-carousel";
import { Screenshot } from "./screenshot";
import { Eyebrow, Section } from "./section";

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

// 三段不同的视觉语调：聊天 → 工作台 → 语音
// Three visual tones: chat asymmetric / workspace centered / interview mirrored-with-waveform
type Layout = "chat" | "workspace" | "interview";
const LAYOUTS: Layout[] = ["chat", "workspace", "interview"];

interface SceneProps {
  block: Block;
}

// 共用样式：标题 / 描述（统一尺寸节奏，避免三段视觉权重失衡）
// Shared rhythm — same title scale across all scenes keeps vertical alignment coherent
const titleClass =
  "font-bold text-3xl text-foreground tracking-tight leading-[1.15] sm:text-4xl lg:text-[2.5rem] lg:leading-[1.18]";
const leadClass =
  "text-base text-muted-foreground leading-relaxed sm:text-[1.0625rem] lg:text-[1.0625rem]";

// 编号 bullet 卡片：与下方 CapabilityGrid BentoTile 同款毛玻璃材质（背景 60%、淡边、轻投影、blur）
// Bullet card material — matches the CapabilityGrid BentoTile glass: bg-background/60, faint border, soft drop, backdrop-blur
const bulletCardClass =
  "flex items-start gap-3 rounded-xl border border-foreground/[0.06] bg-background/60 p-3.5 shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)] backdrop-blur";
// 序号与正文用同字号 / 行高，items-start 后首行自然对齐
// Index & body share text-sm + leading-relaxed so first lines align without manual offsets
const bulletIndexClass =
  "shrink-0 font-mono font-semibold text-primary text-sm leading-relaxed tabular-nums";
const bulletBodyClass = "text-foreground/85 text-sm leading-relaxed";

// 场景 A：聊天式 — 左文右图，文案竖排带编号卡片，截图浮一个 Live 徽标
// Scene A: chat — text-left/image-right, numbered cards, floating Live badge
function SceneChat({ block }: SceneProps) {
  return (
    <div className="grid h-full grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
      <div className="space-y-4">
        <div className="space-y-4 text-center lg:text-left">
          <div data-reveal="eyebrow">
            <Eyebrow>{block.eyebrow}</Eyebrow>
          </div>
          <h2 className={cn(titleClass, "mx-auto max-w-xl lg:mx-0")} data-reveal="title">
            {block.title}
          </h2>
          <p className={cn(leadClass, "mx-auto max-w-lg lg:mx-0")} data-reveal="lead">
            {block.lead}
          </p>
        </div>
        <ul className="mx-auto max-w-md space-y-2 pt-1 text-left lg:mx-0 lg:max-w-none">
          {block.bullets.map((bullet, i) => (
            <li className={bulletCardClass} data-reveal="bullet" key={bullet}>
              <span className={bulletIndexClass}>0{i + 1}</span>
              <span className={bulletBodyClass}>{bullet}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative" data-reveal="image">
        <div className="lg:rotate-[1.2deg] transform-gpu">
          <Screenshot
            alt={block.imageAlt}
            className="w-full"
            darkSrc={block.darkSrc}
            height={block.imageHeight}
            lightSrc={block.lightSrc}
            width={block.imageWidth}
          />
        </div>
        <div className="-top-3 -left-3 absolute flex items-center gap-1.5 rounded-full border border-foreground/[0.06] bg-background/80 px-3 py-1.5 font-mono text-[10px] text-foreground tracking-[0.18em] shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)] backdrop-blur">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          LIVE CHAT
        </div>
      </div>
    </div>
  );
}

// 场景 B：工作台 — 镜像左右结构（左图 / 右文），与 Chat 形成方向对称
// Scene B: workspace — mirrored side-by-side (image-left / text-right), reflecting Chat's direction.
// 文本在源中放前面，mobile 先读文案；lg+ 用 order 让图回到左侧
// Text first in DOM so mobile reads text → image; lg+ reorder puts image on the left.
function SceneWorkspace({ block }: SceneProps) {
  return (
    <div className="grid h-full grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
      <div className="space-y-4 lg:order-2">
        <div className="space-y-4 text-center lg:text-left">
          <div data-reveal="eyebrow">
            <Eyebrow>{block.eyebrow}</Eyebrow>
          </div>
          <h2 className={cn(titleClass, "mx-auto max-w-xl lg:mx-0")} data-reveal="title">
            {block.title}
          </h2>
          <p className={cn(leadClass, "mx-auto max-w-lg lg:mx-0")} data-reveal="lead">
            {block.lead}
          </p>
        </div>
        <ul className="mx-auto max-w-md space-y-2 pt-1 text-left lg:mx-0 lg:max-w-none">
          {block.bullets.map((bullet, i) => (
            <li className={bulletCardClass} data-reveal="bullet" key={bullet}>
              <span className={bulletIndexClass}>0{i + 1}</span>
              <span className={bulletBodyClass}>{bullet}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative lg:order-1" data-reveal="image">
        <div className="lg:-rotate-[1.2deg] transform-gpu">
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
    </div>
  );
}

// 场景 C：语音 — 左图右文（镜像），截图轻微倾斜 + 波形 REC 徽标，bullets 用迷你波形指示
// Scene C: interview — image-left/text-right, slight tilt + waveform REC badge, bullets use mini waveform markers
function SceneInterview({ block }: SceneProps) {
  return (
    <div className="grid h-full grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
      {/* 文本在源顺序中放前面，便于 mobile 先读文案；lg+ 用 order 让图回到左侧 */}
      {/* Text first in DOM so mobile reads text → image; lg+ uses order to put image on the left */}
      <div className="space-y-4 lg:order-2">
        <div className="space-y-4 text-center lg:text-left">
          <div data-reveal="eyebrow">
            <Eyebrow>{block.eyebrow}</Eyebrow>
          </div>
          <h2 className={cn(titleClass, "mx-auto max-w-xl lg:mx-0")} data-reveal="title">
            {block.title}
          </h2>
          <p className={cn(leadClass, "mx-auto max-w-lg lg:mx-0")} data-reveal="lead">
            {block.lead}
          </p>
        </div>
        <ul className="mx-auto max-w-md space-y-2 pt-1 text-left lg:mx-0 lg:max-w-none">
          {block.bullets.map((bullet, i) => (
            <li className={bulletCardClass} data-reveal="bullet" key={bullet}>
              <span className={bulletIndexClass}>0{i + 1}</span>
              <span className={bulletBodyClass}>{bullet}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative lg:order-1" data-reveal="image">
        <div className="lg:-rotate-[1.2deg] transform-gpu">
          <Screenshot
            alt={block.imageAlt}
            className="w-full"
            darkSrc={block.darkSrc}
            height={block.imageHeight}
            lightSrc={block.lightSrc}
            width={block.imageWidth}
          />
        </div>
        <div className="-bottom-3 -right-3 absolute flex items-center gap-2 rounded-full border border-foreground/[0.06] bg-background/80 px-3 py-1.5 shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)] backdrop-blur">
          <span className="flex h-3.5 items-end gap-[2px]">
            {[3, 5, 2, 6, 4, 3, 5].map((h, i) => (
              <span
                className="w-[2px] animate-pulse rounded-full bg-primary"
                // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars
                key={i}
                style={{ animationDelay: `${i * 90}ms`, height: `${h * 2}px` }}
              />
            ))}
          </span>
          <span className="font-mono text-[10px] text-foreground tracking-[0.18em]">REC</span>
        </div>
      </div>
    </div>
  );
}

function SceneByLayout({ block, layout }: { block: Block; layout: Layout }) {
  if (layout === "chat") {
    return <SceneChat block={block} />;
  }
  if (layout === "workspace") {
    return <SceneWorkspace block={block} />;
  }
  return <SceneInterview block={block} />;
}
// 每个场景内部需要"渐进揭示"的子元素（除截图外的所有标记块）
// Inner reveal targets per scene — everything except the image (image is the visual anchor)
const getTextReveals = (sceneEl: HTMLElement) => [
  ...sceneEl.querySelectorAll<HTMLElement>('[data-reveal]:not([data-reveal="image"])'),
];
const getImage = (sceneEl: HTMLElement) =>
  sceneEl.querySelector<HTMLElement>('[data-reveal="image"]');

// 移动端 carousel 卡片：把每段叙事压成统一节奏的 article 卡——eyebrow / title / lead / 截图 / 编号 bullet
// Mobile carousel card — compresses each scene into a uniform article: eyebrow → title → lead → screenshot → numbered bullets
function SceneCard({ block }: { block: Block }) {
  return (
    <article className="flex h-full w-full flex-col gap-4 overflow-hidden rounded-3xl border border-foreground/[0.06] bg-background/60 p-5 shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)] backdrop-blur sm:gap-5 sm:p-6">
      <div className="space-y-2">
        <Eyebrow>{block.eyebrow}</Eyebrow>
        <h3 className="font-bold text-2xl text-foreground leading-[1.2] tracking-tight sm:text-[1.75rem]">
          {block.title}
        </h3>
        <p className="text-foreground/70 text-sm leading-relaxed sm:text-[0.95rem]">{block.lead}</p>
      </div>
      {/* 卡片自带阴影，截图内部不再叠 shadow-xl，否则会被 article 的 overflow-hidden 裁切出黑边 */}
      {/* Card has its own shadow; suppress Screenshot's shadow-xl so it doesn't get clipped by the article's overflow-hidden */}
      <Screenshot
        alt={block.imageAlt}
        className="w-full shadow-none ring-foreground/[0.06]"
        darkSrc={block.darkSrc}
        height={block.imageHeight}
        lightSrc={block.lightSrc}
        width={block.imageWidth}
      />
      <ul className="mt-auto space-y-2">
        {block.bullets.map((bullet, i) => (
          <li className="flex items-start gap-3" key={bullet}>
            <span className="shrink-0 font-mono font-semibold text-primary text-sm leading-relaxed tabular-nums">
              0{i + 1}
            </span>
            <span className="text-foreground/85 text-sm leading-relaxed">{bullet}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

// 各场景在 ScrollTrigger 进度（0~1）上的目标停留位置——选每段 dwell 的中点
// Target progress per scene — mid of each dwell phase (visually settled, no transition)
// 时间轴：opening dwell 0..0.6（0..15%），0→1 转场 0.6..1.6（15..40%），mid dwell 1.6..2.2（40..55%），1→2 转场 2.2..3.2（55..80%），closing dwell 3.2..4（80..100%）
const SCENE_TARGET_PROGRESS = [0.13, 0.52, 0.93] as const;

export function FeatureBlocks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const fillRef = useRef<HTMLSpanElement>(null);
  const labelRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const triggerRef = useRef<ScrollTrigger | null>(null);

  // 点击进度条标签：跳转到该场景的中点位置
  // Click on progress bar label: jump to that scene's settled mid-point.
  const handleSeek = useCallback((sceneIndex: number) => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const targetProgress = SCENE_TARGET_PROGRESS[sceneIndex] ?? 0;
    const targetScroll = trigger.start + targetProgress * (trigger.end - trigger.start);

    const viewport = document.querySelector<HTMLElement>("[data-overlayscrollbars-viewport]");

    const start = viewport ? viewport.scrollTop : window.scrollY;
    const proxy = { y: start };
    gsap.killTweensOf(proxy);
    gsap.to(proxy, {
      duration: 0.9,
      ease: "power2.inOut",
      onUpdate() {
        if (viewport) {
          viewport.scrollTop = proxy.y;
        } else {
          window.scrollTo(0, proxy.y);
        }
      },
      y: targetScroll,
    });
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    gsap.registerPlugin(ScrollTrigger);

    const viewport = document.querySelector<HTMLElement>("[data-overlayscrollbars-viewport]");

    // 浏览器窗口或滚动容器尺寸变化时显式 refresh：ScrollSmoother + scrub 时间轴下，
    // 默认 auto-refresh 偶尔会跟不上，pin spacer 高度与 end 公式（依赖 innerHeight）
    // 都需要重新计算。debounce 避免 resize 抖动期间频繁重排。
    // Window/viewport size changes need an explicit ScrollTrigger.refresh — under
    // ScrollSmoother + scrub, the default auto-refresh sometimes lags, leaving stale
    // pin spacer heights and stale end math (which depends on innerHeight).
    // 250ms debounce 让 matchMedia 边界跨越（桌面 ↔ mobile）的 add/revert 全部完成后再 refresh，
    // 避免在 matchMedia 还没建好新 pin spacer 时刷新导致 ScrollTrigger 测量错位
    // 250ms debounce — wait until any matchMedia add/revert at the lg boundary has settled
    // before refreshing, so ScrollTrigger doesn't measure against a half-built pin spacer.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      resizeTimer = setTimeout(() => {
        ScrollTrigger.refresh();
      }, 250);
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    const ctx = gsap.context(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

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
      }

      const mm = gsap.matchMedia();

      mm.add("(min-width: 1024px)", () => {
        const scenes = sceneRefs.current.filter((el): el is HTMLDivElement => el !== null);
        const labels = labelRefs.current.filter((el): el is HTMLButtonElement => el !== null);
        const fill = fillRef.current;
        if (scenes.length < 3) {
          return;
        }

        const scene0Text = getTextReveals(scenes[0]);
        const scene1Text = getTextReveals(scenes[1]);
        const scene2Text = getTextReveals(scenes[2]);
        const scene1Image = getImage(scenes[1]);
        const scene2Image = getImage(scenes[2]);

        // 场景容器：0 在场，1/2 待入场（带轻微缩放与 y 偏移）
        // Scene containers — 0 in view, 1/2 staged
        gsap.set(scenes[0], { autoAlpha: 1, scale: 1, y: 0 });
        gsap.set([scenes[1], scenes[2]], { autoAlpha: 0, scale: 1.04, y: 24 });

        // 内部文本元素：所有场景初始都隐藏 + y 偏移（截图保持可见，作为视觉锚点）
        // Text/bullet inner elements — hidden initially across ALL scenes; image stays visible as anchor
        gsap.set([...scene0Text, ...scene1Text, ...scene2Text], {
          autoAlpha: 0,
          y: 18,
        });
        // 场景 1/2 的截图额外做一个轻微入场过渡（透明度由 scene 容器控制；这里只控位移）
        // Scenes 1/2 images get a subtle additional entry y-shift; alpha rides scene container
        if (scene1Image) {
          gsap.set(scene1Image, { y: 12 });
        }
        if (scene2Image) {
          gsap.set(scene2Image, { y: 12 });
        }

        if (fill) {
          gsap.set(fill, { scaleX: 0, transformOrigin: "0% 50%" });
        }

        const tl = gsap.timeline({
          defaults: { ease: "power2.inOut" },
          scrollTrigger: {
            anticipatePin: 1,
            end: () => `+=${window.innerHeight * 4}`,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const p = self.progress;
              if (fill) {
                fill.style.transform = `scaleX(${p})`;
              }
              if (labels.length === 3) {
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
            // 强制 pinType=transform：首页 ScrollSmoother 给 #smooth-content 加了 transform，
            // 导致默认的 position:fixed pin 退化为相对 transformed 祖先定位（top:0 变成 #smooth-content 顶端）。
            // 用 transform pin 通过位移来"假装"固定，规避 fixed-inside-transformed 的浏览器规则。
            // 关键：matchMedia revert+re-add 后 ScrollTrigger 自动检测不会再走 transform 路径，
            // 必须显式声明，否则 mobile→PC 回切之后 pin 视觉错位 ~1500px。
            // Force pinType=transform — homepage uses ScrollSmoother which transforms #smooth-content.
            // The default position:fixed pin gets re-anchored to that transformed ancestor (top:0
            // becomes the content's top, not the viewport's). transform pin fakes fixed via translate.
            // Required because after matchMedia revert+re-add, ScrollTrigger's auto-detection no
            // longer picks the transform path; without this, mobile→PC reentry breaks the pin.
            pinType: "transform",
            scroller: viewport ?? undefined,
            scrub: 0.4,
            start: "top top",
            trigger: sectionRef.current,
          },
        });

        triggerRef.current = tl.scrollTrigger ?? null;

        // 时间轴节奏（总长 4 单位 = 100% 进度）
        // 0..0.6  开场停留 + 场景 0 文本渐进揭示（在 0..0.42 内完成 ≈ 70% 处）
        // 0.6..1.6  场景 0 → 1 转场（图先入场）
        // 1.6..2.2 中段停留 + 场景 1 文本渐进揭示（在 1.6..2.02 完成 ≈ 70%）
        // 2.2..3.2 场景 1 → 2 转场
        // 3.2..4   结尾停留 + 场景 2 文本渐进揭示（在 3.2..3.76 完成 ≈ 70%）

        // ── 开场：场景 0 文本逐项揭示 ──
        // Opening dwell — stagger reveal scene 0 inner text/bullets
        const TEXT_REVEAL_DURATION = 0.18;
        const TEXT_REVEAL_STAGGER = 0.06;

        tl.to(
          scene0Text,
          {
            autoAlpha: 1,
            duration: TEXT_REVEAL_DURATION,
            ease: "power2.out",
            stagger: TEXT_REVEAL_STAGGER,
            y: 0,
          },
          0,
        );
        // 占位至 0.6 完成开场停留
        tl.to({}, { duration: 0.6 }, 0);

        // ── 场景 0 → 1 转场 ──
        tl.to(scenes[0], { autoAlpha: 0, duration: 1, scale: 0.94, y: -30 }, 0.6).to(
          scenes[1],
          { autoAlpha: 1, duration: 1, scale: 1, y: 0 },
          "<",
        );
        // 场景 1 截图同步轻微推入
        if (scene1Image) {
          tl.to(scene1Image, { duration: 1, ease: "power2.out", y: 0 }, 0.6);
        }

        // ── 中段：场景 1 文本逐项揭示 ──
        // Mid dwell — scene 1 text reveal
        tl.to(
          scene1Text,
          {
            autoAlpha: 1,
            duration: TEXT_REVEAL_DURATION,
            ease: "power2.out",
            stagger: TEXT_REVEAL_STAGGER,
            y: 0,
          },
          1.6,
        );
        tl.to({}, { duration: 0.6 }, 1.6);

        // ── 场景 1 → 2 转场 ──
        tl.to(scenes[1], { autoAlpha: 0, duration: 1, scale: 0.94, y: -30 }, 2.2).to(
          scenes[2],
          { autoAlpha: 1, duration: 1, scale: 1, y: 0 },
          "<",
        );
        if (scene2Image) {
          tl.to(scene2Image, { duration: 1, ease: "power2.out", y: 0 }, 2.2);
        }

        // ── 结尾：场景 2 文本逐项揭示 ──
        // Closing dwell — scene 2 text reveal
        tl.to(
          scene2Text,
          {
            autoAlpha: 1,
            duration: TEXT_REVEAL_DURATION,
            ease: "power2.out",
            stagger: TEXT_REVEAL_STAGGER,
            y: 0,
          },
          3.2,
        );
        tl.to({}, { duration: 0.8 }, 3.2);

        // matchMedia 进入桌面态后，分两波强制刷新：
        //   1) 下一帧：等 pin spacer 实际落到 DOM 后做软 refresh
        //   2) +200ms：等 ScrollSmoother 的 content 高度 re-sync 完成后做 hard refresh(true)
        // 直接覆盖 "先 mobile 再 PC" 这条路径上 ScrollSmoother 缓存了旧 content 高度的窗口
        // After matchMedia enters desktop, refresh in two waves:
        //   1) Next frame — wait for pin spacer to land in DOM, then soft refresh
        //   2) +200ms — wait for ScrollSmoother content-height re-sync, then hard refresh(true)
        // This covers the mobile→PC reentry where ScrollSmoother holds the stale content height.
        requestAnimationFrame(() => {
          ScrollTrigger.refresh();
        });
        const hardRefreshId = setTimeout(() => {
          ScrollTrigger.refresh(true);
        }, 200);

        // matchMedia revert（PC → mobile）时也要 refresh，否则 ScrollSmoother 还把销毁前的
        // pin spacer 4× viewport 高度算在 content 里，回到 PC 后初次测量就偏
        // On revert (PC → mobile) refresh too, otherwise ScrollSmoother keeps the pre-destroyed
        // pin spacer's 4× viewport height in its content cache, biasing the next measurement.
        return () => {
          clearTimeout(hardRefreshId);
          requestAnimationFrame(() => {
            ScrollTrigger.refresh(true);
          });
        };
      });
    }, sectionRef);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      ctx.revert();
      if (viewport) {
        ScrollTrigger.scrollerProxy(viewport);
      }
    };
  }, []);

  return (
    <div className="relative" ref={sectionRef}>
      {/* lg+: pinned 舞台，三幕叠加 */}
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
                <SceneByLayout block={block} layout={LAYOUTS[i]} />
              </div>
            ))}
          </div>

          {/* 进度条：横向条形 + 标尺刻度 + 三段标签 */}
          <div className="-translate-x-1/2 absolute bottom-6 left-1/2 flex w-[min(560px,80vw)] flex-col items-center gap-3">
            <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-foreground/10">
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-foreground/85"
                ref={fillRef}
                style={{ transform: "scaleX(0)" }}
              />
              <span
                aria-hidden="true"
                className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 size-1 rounded-full bg-foreground/30"
                style={{ left: "33.33%" }}
              />
              <span
                aria-hidden="true"
                className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 size-1 rounded-full bg-foreground/30"
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

      {/* mobile: 居中循环 carousel，与 Capabilities 同款节奏 / Mobile: same center-aligned looping carousel as Capabilities */}
      <Section className="lg:hidden" width="wide">
        <CenterCarousel
          items={blocks.map((block) => ({
            key: block.title,
            label: block.title,
            node: <SceneCard block={block} />,
          }))}
        />
      </Section>
    </div>
  );
}
