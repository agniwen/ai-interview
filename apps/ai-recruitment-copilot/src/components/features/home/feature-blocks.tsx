// 用途：苹果官网风格的 pinned 滚动叙事——三段差异化排版，内部元素随滚动渐进揭示
// Purpose: Apple-style pinned scroll storytelling — 3 distinct layouts, inner content reveals progressively as user scrolls (fully revealed by ~70% of each scene).
"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useCallback, useRef } from "react";
import { ChatScreen, InterviewScreen, JobsScreen } from "@/components/features/home/screens";
import { Badge } from "@/components/ui/badge";
import { cn } from "@arc/shared/utils";
import { CenterCarousel } from "./center-carousel";
import { Eyebrow, Section } from "./section";

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollSmoother);

interface Block {
  bullets: string[];
  eyebrow: string;
  lead: string;
  // 该场景对应的简化 UI 屏组件（替代之前的截图 src）
  // Screen component used for this scene (replaces the previous png src pair)
  Screen: (props: { className?: string }) => React.ReactElement;
  title: string;
}

const blocks: Block[] = [
  {
    Screen: ChatScreen,
    bullets: [
      "一次上传多份 PDF 简历",
      "对照岗位要求梳理亮点、风险与缺口",
      "每项判断都能回到简历原文",
    ],
    eyebrow: "Resume Screening",
    lead: "上传简历，直接问 AI：经历是否匹配，优势在哪里，还有什么需要确认。结论不只被说出来，也能回到原文。",
    title: "先看证据。再做判断。",
  },
  {
    Screen: JobsScreen,
    bullets: [
      "统一维护岗位、JD 与面试重点",
      "面试官设定与问题模板持续复用",
      "同一份语境贯穿筛选与面试",
    ],
    eyebrow: "Workspace",
    lead: "职责、要求、面试重点和问题模板，都从同一份岗位语境出发。设置一次，之后的筛选与面试自然保持一致。",
    title: "岗位语境。只需要讲清一次。",
  },
  {
    Screen: InterviewScreen,
    bullets: ["候选人打开链接即可开始", "根据回答实时追问关键细节", "同步沉淀对话记录与结构化评估"],
    eyebrow: "Voice Interview",
    lead: "把链接发给候选人，AI 会沿着简历、岗位和当下的回答继续追问。面试结束，过程与判断一起留下。",
    title: "候选人开口。AI 接着问。",
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
  "font-medium text-3xl text-foreground tracking-tight leading-[1.15] sm:text-4xl lg:text-[2.5rem] lg:leading-[1.18]";
const leadClass =
  "text-base text-muted-foreground leading-normal dark:text-white/80 sm:text-[1.0625rem] lg:text-[1.0625rem]";

// 编号 bullet 卡片：与下方 CapabilityGrid BentoTile 同款毛玻璃材质（背景 60%、淡边、轻投影、blur）
// Bullet card material — matches the CapabilityGrid BentoTile glass: bg-background/60, faint border, soft drop, backdrop-blur
const bulletCardClass =
  "flex items-start gap-3 rounded-xl   ring-1 ring-foreground/5 bg-background/60 p-3.5 shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)] backdrop-blur";
// 序号与正文用同字号 / 行高，items-start 后首行自然对齐
// Index & body share text-sm + leading-normal so first lines align without manual offsets
const bulletIndexClass =
  "shrink-0 font-mono font-medium text-primary text-sm leading-normal tabular-nums";
const bulletBodyClass = "text-foreground/85 text-sm leading-normal";

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
        <div className="transform-gpu">
          {/* 入场放大缩到位的目标层：与 pin 时间轴解耦的独立 ScrollTrigger 控制 scale 1.25 → 1 */}
          {/* Entry-scale target — driven by a separate ScrollTrigger from 1.25 → 1 before the pin engages */}
          <div className="origin-center will-change-transform" data-entry-scale>
            <block.Screen className="w-full" />
          </div>
        </div>
        <Badge className="-top-3 -left-3 absolute" data-reveal="badge" variant="outline">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          LIVE CHAT
        </Badge>
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
        <div className="transform-gpu">
          <block.Screen className="w-full" />
        </div>
        {/* JD READY 徽标：与 Chat 的 LIVE CHAT、Voice Interview 的 REC 形成同节奏的"压轴"标签 */}
        {/* JD READY badge — paired with Chat's LIVE CHAT and Voice Interview's REC, revealed last in the dwell */}
        <Badge className="-top-3 -right-3 absolute" data-reveal="badge" variant="outline">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          JD READY
        </Badge>
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
        <div className="transform-gpu">
          <block.Screen className="w-full" />
        </div>
        <Badge className="-right-3 -bottom-3 absolute" data-reveal="badge" variant="outline">
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
          <span>REC</span>
        </Badge>
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
// 每个场景内部需要"渐进揭示"的子元素（排除作为视觉锚点 / 单独控制的 image / badge）
// Inner reveal targets per scene — everything except image (visual anchor) and badge (revealed last separately)
const getTextReveals = (sceneEl: HTMLElement) => [
  ...sceneEl.querySelectorAll<HTMLElement>(
    '[data-reveal]:not([data-reveal="image"]):not([data-reveal="badge"])',
  ),
];
const getImage = (sceneEl: HTMLElement) =>
  sceneEl.querySelector<HTMLElement>('[data-reveal="image"]');
const getBadge = (sceneEl: HTMLElement) =>
  sceneEl.querySelector<HTMLElement>('[data-reveal="badge"]');

// 移动端 carousel 卡片：把每段叙事压成统一节奏的 article 卡——eyebrow / title / lead / 截图 / 编号 bullet
// Mobile carousel card — compresses each scene into a uniform article: eyebrow → title → lead → screenshot → numbered bullets
function SceneCard({ block }: { block: Block }) {
  return (
    <article className="flex h-full w-full flex-col gap-4 overflow-hidden rounded-3xl ring-1 ring-foreground/5 bg-background/60 p-5 shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)] backdrop-blur sm:gap-5 sm:p-6">
      <div className="space-y-2">
        <Eyebrow>{block.eyebrow}</Eyebrow>
        <h3 className="font-medium text-2xl text-foreground leading-[1.2] tracking-tight sm:text-[1.75rem]">
          {block.title}
        </h3>
        <p className="text-foreground/70 text-sm leading-normal dark:text-white/80 sm:text-[0.95rem]">
          {block.lead}
        </p>
      </div>
      <block.Screen className="w-full" />
      <ul className="mt-auto space-y-2">
        {block.bullets.map((bullet, i) => (
          <li className="flex items-start gap-3" key={bullet}>
            <span className="shrink-0 font-mono font-medium text-primary text-sm leading-normal tabular-nums">
              0{i + 1}
            </span>
            <span className="text-foreground/85 text-sm leading-normal">{bullet}</span>
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

  // 点击进度条标签：跳转到该场景的中点位置。
  // 优先用 ScrollSmoother.scrollTo —— 它会原生跟 smoother 的 lerp 协调，避免再起一个
  // 跟 smoother 抢 scroll 控制权的并行 tween。降级回 window.scrollTo 兼容 reduced-motion。
  // Click on progress bar label: jump to that scene's settled mid-point.
  // Use ScrollSmoother.scrollTo when available — it coordinates with the smoother's lerp
  // natively. Falls back to window.scrollTo when smoother is disabled (reduced-motion).
  const handleSeek = useCallback((sceneIndex: number) => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const targetProgress = SCENE_TARGET_PROGRESS[sceneIndex] ?? 0;
    const targetScroll = trigger.start + targetProgress * (trigger.end - trigger.start);

    const smoother = ScrollSmoother.get();
    if (smoother) {
      smoother.scrollTo(targetScroll, true);
    } else {
      window.scrollTo({ behavior: "smooth", top: targetScroll });
    }
  }, []);

  useGSAP(
    () => {
      const browserWindow = globalThis.window;
      if (!browserWindow) {
        return;
      }
      // reduced-motion 直接退出，让浏览器原生滚动接管，pinned 叙事降级为静态版式。
      // Bail for reduced-motion users — keep native scrolling, pinned story degrades to static.
      if (browserWindow.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      // ScrollSmoother + ScrollTrigger 是同源整合，**不要**手动 scrollerProxy 也不要传
      // scroller —— 那是给第三方 smooth scroller（Locomotive、Smooth Scrollbar 等）用的。
      // ScrollTrigger 也会在 viewport resize 时自动 refresh，所以**不要**自己挂 resize
      // listener。pinType 在 ScrollSmoother active 时默认 "transform"，**不要**手动强制。
      // 任何形式的手动 refresh / refresh(true) 链都会跟 ScrollSmoother 打架，造成 pin
      // 跟 smoother 失同步的视觉漂移。
      // ScrollSmoother + ScrollTrigger are first-party — don't add scrollerProxy and don't
      // pass `scroller`; those are for third-party smooth scrollers (Locomotive, Smooth
      // Scrollbar, etc). ScrollTrigger also auto-refreshes on viewport resize, so don't
      // attach manual resize listeners. pinType defaults to "transform" when ScrollSmoother
      // is active, no need to force it. Any manual refresh chain fights the smoother and
      // causes visible pin/scroll desync.

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
        const scene0EntryScale = scenes[0].querySelector<HTMLElement>("[data-entry-scale]");
        const scene0Badge = getBadge(scenes[0]);
        const scene1Badge = getBadge(scenes[1]);
        const scene2Badge = getBadge(scenes[2]);

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

        // 三幕徽标统一初始隐藏 + 缩放 + y 偏移，在各自 dwell 末尾"压轴"出场
        // All three badges share the same hidden initial state, revealed last in each scene's dwell
        const allBadges = [scene0Badge, scene1Badge, scene2Badge].filter(
          (el): el is HTMLElement => el !== null,
        );
        if (allBadges.length > 0) {
          gsap.set(allBadges, { autoAlpha: 0, scale: 0.85, y: -8 });
        }

        // 入场缩放 + 透明度：scene 0 的截图在用户从首屏向下滚的过程中，
        // 从 (scale 1.25, opacity 0) 缩到 (scale 1, opacity 1)，恰好在 pin 启动时落位
        // start "top bottom" = section 上沿到达视口下沿（图刚刚开始入场）
        // end   "top top"    = section 上沿到达视口顶（pin 启动那一刻刚好 scale 1 / opacity 1）
        // Entry scale + fade — chat screenshot transitions from (1.25, 0) → (1, 1) as the section
        // enters the viewport, landing exactly at scale 1 + fully visible right when the pin engages.
        if (scene0EntryScale) {
          gsap.fromTo(
            scene0EntryScale,
            { autoAlpha: 0, scale: 1.25 },
            {
              autoAlpha: 1,
              ease: "none",
              scale: 1,
              scrollTrigger: {
                end: "top top",
                invalidateOnRefresh: true,
                scrub: true,
                start: "top bottom",
                trigger: sectionRef.current,
              },
            },
          );
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
            // ScrollSmoother active 时 ScrollTrigger 会自动选 pinType: "transform"，无需手动指定。
            // ScrollTrigger picks pinType: "transform" automatically when ScrollSmoother is active.
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
        // LIVE CHAT 徽标压轴：在所有正文揭示完成后再弹出，带 back ease 增加节奏感
        // Badge "punctuation" — appears after all text reveals, with a back ease for a snappy entrance
        if (scene0Badge) {
          tl.to(
            scene0Badge,
            {
              autoAlpha: 1,
              duration: 0.18,
              ease: "back.out(1.6)",
              scale: 1,
              y: 0,
            },
            0.46,
          );
        }
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
        // 场景 1 徽标压轴 / Scene 1 badge punctuation
        if (scene1Badge) {
          tl.to(
            scene1Badge,
            {
              autoAlpha: 1,
              duration: 0.14,
              ease: "back.out(1.6)",
              scale: 1,
              y: 0,
            },
            2.04,
          );
        }
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
        // 场景 2 徽标压轴 / Scene 2 badge punctuation
        if (scene2Badge) {
          tl.to(
            scene2Badge,
            {
              autoAlpha: 1,
              duration: 0.18,
              ease: "back.out(1.6)",
              scale: 1,
              y: 0,
            },
            3.66,
          );
        }
        tl.to({}, { duration: 0.8 }, 3.2);

        // mm.add 自带 cleanup —— matchMedia revert 时 gsap 会把这个回调里所有 gsap.set /
        // 时间轴 / ScrollTrigger 自动 revert，pin spacer 也会被销毁，无需手动 refresh。
        // mm.add cleans up automatically — when matchMedia reverts, gsap reverts every
        // gsap.set / timeline / ScrollTrigger created here and removes the pin spacer.
        // No manual refresh chain needed; ScrollTrigger handles resize via its own
        // built-in resize listener.
      });
    },
    { scope: sectionRef },
  );

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
                data-home-scene={i}
                key={block.title}
                ref={(el) => {
                  sceneRefs.current[i] = el;
                }}
                style={i === 0 ? undefined : { opacity: 0, visibility: "hidden" }}
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
