# Homepage Notion-style Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the homepage into a full Notion-style scrolling landing page (hero → trust strip → product shot → 3 feature blocks → personas → process tabs → FAQ → secondary CTA → footer) while preserving the existing animated background.

**Architecture:** Decompose the current 503-line `home-page-client.tsx` into focused section components under `src/app/_components/home/`. Reuse `components/ui/*` primitives (Button, Tabs, Accordion, Card, Badge, Separator) with `className` overrides. Add one new helper component `Screenshot` that picks a theme-inverse asset. Animations stay on existing `FadeContent` / `motion/react`.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui (Radix), `motion/react`, existing `react-bits` background components.

**Spec:** `docs/superpowers/specs/2026-04-29-homepage-notion-redesign-design.md`

---

## File Structure

**Create:**

- `src/app/_components/home/background-layers.tsx` — extracts the existing animated background + mask.
- `src/app/_components/home/use-protected-navigation.ts` — shared hook for auth-gated navigation.
- `src/app/_components/home/screenshot.tsx` — theme-inverse `<Image>` wrapper.
- `src/app/_components/home/hero.tsx` — hero (badge, headline, subtitle, dual CTA).
- `src/app/_components/home/trust-strip.tsx` — slim 4-icon label row.
- `src/app/_components/home/product-shot.tsx` — single large screenshot block.
- `src/app/_components/home/feature-blocks.tsx` — 3 alternating text/image blocks.
- `src/app/_components/home/personas.tsx` — 3-column persona cards.
- `src/app/_components/home/process-tabs.tsx` — Tabs-based 4-step switcher.
- `src/app/_components/home/faq.tsx` — Accordion FAQ.
- `src/app/_components/home/cta-section.tsx` — secondary CTA row.
- `src/app/_components/home/footer.tsx` — minimal footer.
- `src/app/_components/home/icons.tsx` — moves the four feature SVG icons out of the page.
- `public/landing/README.md` — explains how to regenerate screenshots.

**Modify:**

- `src/app/_components/home-page-client.tsx` — becomes a thin composer.

**Assets to capture (Chrome DevTools MCP) into `public/landing/`:**

- `chat-light.png`, `chat-dark.png`
- `studio-light.png`, `studio-dark.png`
- `interview-light.png`, `interview-dark.png`
- `process-1-{light,dark}.png` … `process-4-{light,dark}.png` (may reuse cropped portions)

---

## Task 1: Extract background and shared hook (refactor with no behavior change)

**Files:**

- Create: `src/app/_components/home/background-layers.tsx`
- Create: `src/app/_components/home/use-protected-navigation.ts`
- Create: `src/app/_components/home/icons.tsx`
- Modify: `src/app/_components/home-page-client.tsx`

- [ ] **Step 1: Create `icons.tsx` by moving the 4 feature icons**

Move `ResumeRadarIcon`, `RoleContextIcon`, `VoiceInterviewIcon`, `WorkflowLinkIcon` from `home-page-client.tsx` (lines ~32–207) into `src/app/_components/home/icons.tsx`. Export each named icon. Re-import in `home-page-client.tsx` from `./home/icons`.

```ts
// src/app/_components/home/icons.tsx
// 顶部添加：
"use client";
import type { SVGProps } from "react";

export type FeatureIconProps = SVGProps<SVGSVGElement>;

export const ResumeRadarIcon = ({ className, ...props }: FeatureIconProps) => (
  /* paste body */
);
// 同样导出其余三个。
```

- [ ] **Step 2: Create `background-layers.tsx`**

```tsx
// src/app/_components/home/background-layers.tsx
// 用途：把首页固定背景动画 + 遮罩抽出为单一组件 / Extracts fixed homepage background + mask.
"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { DarkVeil } from "@/components/react-bits/dark-veil";
import DotGrid from "@/components/react-bits/dot-grid";
import Prism from "@/components/react-bits/prism";
import Waves from "@/components/react-bits/waves";

export function BackgroundLayers() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
        {isDark ? (
          <>
            <div className="absolute inset-0">
              <DarkVeil
                hueShift={30}
                noiseIntensity={0.02}
                scanlineIntensity={0}
                speed={2}
                scanlineFrequency={0.5}
                warpAmount={0.2}
                resolutionScale={1.5}
              />
            </div>
            <div className="absolute inset-0 mix-blend-screen">
              <DotGrid
                dotSize={3}
                gap={18}
                baseColor="#2a2a3a"
                activeColor="#ffffff"
                proximity={140}
                speedTrigger={120}
                shockRadius={220}
                shockStrength={4}
              />
            </div>
          </>
        ) : (
          <>
            <div className="absolute inset-0">
              <Waves
                lineColor="#f5f5f5"
                backgroundColor="transparent"
                waveSpeedX={0}
                waveSpeedY={0}
                waveAmpX={40}
                waveAmpY={0}
                friction={0.57}
                tension={0.01}
                maxCursorMove={20}
                xGap={18}
                yGap={36}
              />
            </div>
            <div className="absolute inset-0 opacity-60">
              <Prism
                height={4}
                baseWidth={7.5}
                animationType="3drotate"
                glow={1}
                noise={0.1}
                transparent
                scale={3.3}
                hueShift={0}
                colorFrequency={2.5}
                hoverStrength={1}
                inertia={0.05}
                bloom={1}
                timeScale={0.3}
              />
            </div>
          </>
        )}
      </div>
      <div
        aria-hidden="true"
        className="bg-mask pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(to_bottom,oklch(0.985_0.007_236.5/0.48),oklch(0.985_0.007_236.5/0.78)_30vh,oklch(0.985_0.007_236.5/1)_85vh,oklch(0.985_0.007_236.5/1)_100%)] dark:bg-[linear-gradient(to_bottom,oklch(0.145_0_0/0.55),oklch(0.145_0_0/0.82)_30vh,oklch(0.145_0_0/1)_85vh,oklch(0.145_0_0/1)_100%)]"
      />
    </>
  );
}
```

Note: the mask gradient is intentionally extended so the animated background fades to a flat surface beyond ~85vh — this keeps long-scroll content readable.

- [ ] **Step 3: Create `use-protected-navigation.ts`**

```ts
// src/app/_components/home/use-protected-navigation.ts
// 用途：登录态门控的导航 hook / auth-gated navigation hook.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function useProtectedNavigation() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const navigate = (href: string) => {
    if (isPending) return;
    if (session?.user) {
      router.push(href);
      return;
    }
    setPendingPath(href);
  };

  return {
    isPending,
    navigate,
    pendingPath,
    setPendingPath,
  };
}
```

- [ ] **Step 4: Slim down `home-page-client.tsx` to use the new pieces (still rendering current Hero + 4 cards, no visual change yet)**

Replace background JSX with `<BackgroundLayers />`. Replace inline auth state with `useProtectedNavigation`. Keep the existing Hero markup and 4-card grid in place for now — Task 4 onward will replace them.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck`
Expected: PASS, no errors.

Run: `pnpm lint`
Expected: PASS (or only pre-existing warnings).

In Chrome DevTools MCP, reload `http://localhost:3000` in light mode then dark mode; visually confirm the background, hero, and 4-card grid look identical to before this task.

- [ ] **Step 6: Commit**

```bash
git add src/app/_components/home/ src/app/_components/home-page-client.tsx
git commit -m "refactor(home): extract background layers and protected nav hook"
```

---

## Task 2: Add `Screenshot` component (theme-inverse image)

**Files:**

- Create: `src/app/_components/home/screenshot.tsx`
- Create: `public/landing/README.md`

- [ ] **Step 1: Create `screenshot.tsx`**

```tsx
// src/app/_components/home/screenshot.tsx
// 用途：根据当前主题反向选择截图（暗色页面用亮色截图，反之亦然）
// Purpose: pick the theme-inverse screenshot asset.
"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type ScreenshotProps = {
  alt: string;
  className?: string;
  height: number;
  lightSrc: string; // shown on dark UI
  darkSrc: string; // shown on light UI
  priority?: boolean;
  width: number;
};

export function Screenshot({
  alt,
  className,
  height,
  lightSrc,
  darkSrc,
  priority,
  width,
}: ScreenshotProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 未挂载时使用 darkSrc 作为占位避免 hydration 错配
  // Before mount, render darkSrc placeholder to avoid hydration mismatch.
  const src = mounted ? (resolvedTheme === "dark" ? lightSrc : darkSrc) : darkSrc;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-primary/15 bg-primary/5 ring-1 ring-primary/10 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.45)] backdrop-blur",
        className,
      )}
    >
      <Image
        alt={alt}
        className="h-auto w-full"
        height={height}
        priority={priority}
        src={src}
        width={width}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create `public/landing/README.md`**

```markdown
# Landing Page Screenshots

Screenshots used in the homepage. Naming: `<surface>-{light,dark}.png`.

Surfaces:

- `chat` — `/chat` main view
- `studio` — `/studio/interviews` list
- `interview` — `/interview/<id>` voice interview screen
- `process-1` … `process-4` — process step thumbnails

To regenerate: open the app at the desired theme and route, capture the viewport, save under this folder. Recommended viewport: 1440×900.
```

- [ ] **Step 3: Add placeholder PNGs**

Until real screenshots are captured (Task 11), add 1×1 transparent PNG placeholders so `next/image` does not 404 during development.

```bash
mkdir -p public/landing
# 创建一个 1x1 透明 PNG / Create a 1x1 transparent PNG
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xff\xff?\x00\x05\xfe\x02\xfe\xa3\x35\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82' > public/landing/_placeholder.png
for name in chat studio interview process-1 process-2 process-3 process-4; do
  for theme in light dark; do
    cp public/landing/_placeholder.png "public/landing/${name}-${theme}.png"
  done
done
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/home/screenshot.tsx public/landing/
git commit -m "feat(home): add Screenshot helper and landing asset placeholders"
```

---

## Task 3: Hero section component

**Files:**

- Create: `src/app/_components/home/hero.tsx`

- [ ] **Step 1: Create `hero.tsx` — encapsulates the existing Hero markup**

```tsx
// src/app/_components/home/hero.tsx
// 用途：首页 Hero 区，保留原有视觉与 CTA / Hero section preserving original visuals + CTAs.
"use client";

import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import { FadeContent } from "@/components/react-bits/fade-content";
import { SplitText } from "@/components/react-bits/split-text";
import { Button } from "@/components/ui/button";

type HeroProps = {
  isPending: boolean;
  onResumeFiltering: () => void;
  onWorkbench: () => void;
};

export function Hero({ isPending, onResumeFiltering, onWorkbench }: HeroProps) {
  return (
    <section className="relative w-full text-center">
      <FadeContent>
        <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/8 px-3 py-1 font-medium text-[11px] text-primary sm:text-xs">
          <SparklesIcon aria-hidden="true" className="size-3" />
          招聘协作工作台
        </p>
      </FadeContent>

      <h1 className="pixel-title mt-6 mx-auto max-w-5xl text-balance font-bold text-[2rem] text-foreground leading-[1.15] tracking-tight sm:mt-8 sm:text-6xl lg:text-[4.5rem]">
        <SplitText text="从简历筛选到模拟面试，用同一套工作流完成候选人评估" />
      </h1>

      <FadeContent className="mt-5 mx-auto max-w-2xl sm:mt-7" delay={0.1}>
        <p className="font-serif text-sm text-muted-foreground leading-relaxed sm:text-lg sm:leading-[1.8]">
          先用聊天式方式完成简历初筛，再进入实时语音模拟面试，连续查看候选人的亮点、风险、追问过程与回答表现，让招聘判断更完整。
        </p>
      </FadeContent>

      <FadeContent className="mt-8 flex items-center justify-center sm:mt-10" delay={0.2}>
        <div className="inline-flex items-stretch">
          <Button
            className="group h-11 min-w-[12em] gap-0 backdrop-blur-md border-primary/40 hover:bg-primary/40! bg-primary/20! rounded-r-none rounded-l-xl px-8 text-sm sm:h-12 sm:px-10 sm:text-base"
            disabled={isPending}
            onClick={onResumeFiltering}
            type="button"
            variant="outline"
          >
            <span>开始简历筛选</span>
            <span className="inline-flex max-w-0 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:ml-2 group-hover:max-w-4 group-hover:opacity-100">
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </span>
          </Button>
          <Button
            className="group h-11 min-w-[12em] gap-0 rounded-r-xl rounded-l-none border-background bg-background/60 px-8 text-sm backdrop-blur-md hover:bg-background/80 sm:h-12 sm:px-10 sm:text-base"
            disabled={isPending}
            onClick={onWorkbench}
            type="button"
            variant="outline"
          >
            <span>进入工作台</span>
            <span className="inline-flex max-w-0 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:ml-2 group-hover:max-w-4 group-hover:opacity-100">
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </span>
          </Button>
        </div>
      </FadeContent>
    </section>
  );
}
```

- [ ] **Step 2: Wire Hero into `home-page-client.tsx` (replace inline Hero JSX, keep 4-card grid for now)**

- [ ] **Step 3: Verify visually in Chrome DevTools MCP — Hero unchanged**

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/home/hero.tsx src/app/_components/home-page-client.tsx
git commit -m "refactor(home): extract Hero section component"
```

---

## Task 4: Trust strip (replaces 4-card grid)

**Files:**

- Create: `src/app/_components/home/trust-strip.tsx`
- Modify: `src/app/_components/home-page-client.tsx`

- [ ] **Step 1: Create `trust-strip.tsx`**

```tsx
// src/app/_components/home/trust-strip.tsx
// 用途：将原 4 张特性卡缩成一条小标签条，作为 Hero 下的速览
// Purpose: collapse the original 4 feature cards into a slim label row under Hero.
"use client";

import { FadeContent } from "@/components/react-bits/fade-content";
import { ResumeRadarIcon, RoleContextIcon, VoiceInterviewIcon, WorkflowLinkIcon } from "./icons";

const items = [
  { Icon: ResumeRadarIcon, label: "聊天式简历初筛" },
  { Icon: RoleContextIcon, label: "岗位语境驱动" },
  { Icon: VoiceInterviewIcon, label: "语音模拟面试" },
  { Icon: WorkflowLinkIcon, label: "筛选到面试联动" },
];

export function TrustStrip() {
  return (
    <FadeContent className="mt-12 sm:mt-16" delay={0.3}>
      <ul className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-6 gap-y-3 text-foreground/70 text-xs sm:gap-x-10 sm:text-sm">
        {items.map(({ Icon, label }) => (
          <li className="inline-flex items-center gap-2" key={label}>
            <span className="inline-flex size-7 items-center justify-center rounded-lg border border-primary/15 bg-primary/8 text-primary">
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <span className="font-medium">{label}</span>
          </li>
        ))}
      </ul>
    </FadeContent>
  );
}
```

- [ ] **Step 2: Replace the 4-card grid in `home-page-client.tsx` with `<TrustStrip />`**

Remove all hover-overlay state (`hoveredHighlight`, `hoverRect`, `useLayoutEffect`, `cardRefs`, `cardCallbacks`, `handleGridLeave`, `gridRef`, `motion.span` overlay, `highlights` array). Delete the now-unused `motion` import if no longer referenced. Render `<TrustStrip />` after `<Hero />`.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

In Chrome DevTools MCP, reload home page; confirm Hero is followed by a single horizontal label row instead of the 4-card grid; confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/home/ src/app/_components/home-page-client.tsx
git commit -m "feat(home): replace highlight grid with slim trust strip"
```

---

## Task 5: Section primitive + Product hero shot

**Files:**

- Create: `src/app/_components/home/section.tsx`
- Create: `src/app/_components/home/product-shot.tsx`
- Modify: `src/app/_components/home-page-client.tsx`

- [ ] **Step 1: Create a small `Section` wrapper to enforce consistent spacing**

```tsx
// src/app/_components/home/section.tsx
// 用途：统一长落地页各分区的纵向节奏 / Consistent vertical rhythm for landing sections.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionProps = {
  children: ReactNode;
  className?: string;
  id?: string;
  width?: "default" | "wide";
};

export function Section({ children, className, id, width = "default" }: SectionProps) {
  return (
    <section
      className={cn(
        "mx-auto w-full px-5 py-24 sm:px-8 sm:py-28 lg:py-32",
        width === "wide" ? "max-w-7xl" : "max-w-6xl",
        className,
      )}
      id={id}
    >
      {children}
    </section>
  );
}

type EyebrowProps = { children: ReactNode };
export function Eyebrow({ children }: EyebrowProps) {
  return (
    <p className="font-medium text-primary text-xs uppercase tracking-[0.18em] sm:text-[13px]">
      {children}
    </p>
  );
}

type SectionTitleProps = { children: ReactNode; className?: string };
export function SectionTitle({ children, className }: SectionTitleProps) {
  return (
    <h2
      className={cn(
        "mt-3 max-w-3xl font-bold text-3xl text-foreground leading-[1.2] tracking-tight sm:text-4xl lg:text-5xl",
        className,
      )}
    >
      {children}
    </h2>
  );
}

type SectionLeadProps = { children: ReactNode; className?: string };
export function SectionLead({ children, className }: SectionLeadProps) {
  return (
    <p
      className={cn(
        "mt-4 max-w-2xl text-base text-muted-foreground leading-relaxed sm:text-lg",
        className,
      )}
    >
      {children}
    </p>
  );
}
```

- [ ] **Step 2: Create `product-shot.tsx`**

```tsx
// src/app/_components/home/product-shot.tsx
// 用途：Hero 下方的产品主截图大图 / Hero shot of the primary product surface.
"use client";

import { FadeContent } from "@/components/react-bits/fade-content";
import { Screenshot } from "./screenshot";
import { Section } from "./section";

export function ProductShot() {
  return (
    <Section className="!py-16 sm:!py-20" width="wide">
      <FadeContent>
        <Screenshot
          alt="工作台主界面预览"
          darkSrc="/landing/studio-dark.png"
          height={1100}
          lightSrc="/landing/studio-light.png"
          priority
          width={1760}
        />
      </FadeContent>
    </Section>
  );
}
```

- [ ] **Step 3: Render `<ProductShot />` after `<TrustStrip />` in `home-page-client.tsx`**

The hero `<main>` currently centers content vertically with `items-center justify-center min-h-dvh`. Update this so the homepage scrolls instead: change the wrapper to `flex flex-col` (no centering on long page) and ensure the Hero block is wrapped in its own min-height container. Specifically:

```tsx
<main className="relative flex w-full flex-col items-stretch" id="main-content">
  <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col items-center justify-center px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
    <Hero ... />
    <TrustStrip />
  </div>
  <ProductShot />
  {/* future sections appended here */}
</main>
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

Reload home in Chrome DevTools; Hero still fills first viewport, scrolling reveals the product screenshot inside a glass card. Check both light and dark themes.

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/home/section.tsx src/app/_components/home/product-shot.tsx src/app/_components/home-page-client.tsx
git commit -m "feat(home): add section primitives and product hero shot"
```

---

## Task 6: Three alternating feature blocks

**Files:**

- Create: `src/app/_components/home/feature-blocks.tsx`
- Modify: `src/app/_components/home-page-client.tsx`

- [ ] **Step 1: Create `feature-blocks.tsx`**

```tsx
// src/app/_components/home/feature-blocks.tsx
// 用途：Notion 风格左右交替的三段特性介绍 / Notion-style alternating feature blocks.
"use client";

import { CheckIcon } from "lucide-react";
import { FadeContent } from "@/components/react-bits/fade-content";
import { cn } from "@/lib/utils";
import { Screenshot } from "./screenshot";
import { Eyebrow, Section, SectionLead, SectionTitle } from "./section";

type Block = {
  bullets: string[];
  darkSrc: string;
  eyebrow: string;
  imageAlt: string;
  imageHeight: number;
  imageWidth: number;
  lead: string;
  lightSrc: string;
  title: string;
};

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

export function FeatureBlocks() {
  return (
    <Section width="wide">
      <div className="space-y-24 sm:space-y-28">
        {blocks.map((block, index) => {
          const reversed = index % 2 === 1;
          return (
            <FadeContent
              className={cn(
                "grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16",
                reversed && "lg:[&>:first-child]:order-2",
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
            </FadeContent>
          );
        })}
      </div>
    </Section>
  );
}
```

- [ ] **Step 2: Render `<FeatureBlocks />` after `<ProductShot />`**

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

Reload home; scroll past Hero/ProductShot to confirm 3 blocks render with alternating layouts on `lg+` and stacked on mobile (resize the viewport in DevTools).

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/home/feature-blocks.tsx src/app/_components/home-page-client.tsx
git commit -m "feat(home): add alternating feature blocks"
```

---

## Task 7: Personas section

**Files:**

- Create: `src/app/_components/home/personas.tsx`
- Modify: `src/app/_components/home-page-client.tsx`

- [ ] **Step 1: Create `personas.tsx`**

```tsx
// src/app/_components/home/personas.tsx
// 用途：三角色分区（HR / 业务面试官 / 候选人） / Three-persona section.
"use client";

import { BriefcaseIcon, MicIcon, UsersIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { FadeContent } from "@/components/react-bits/fade-content";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eyebrow, Section, SectionLead, SectionTitle } from "./section";

type Persona = {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  description: string;
  role: string;
  title: string;
};

const personas: Persona[] = [
  {
    Icon: BriefcaseIcon,
    description:
      "在工作台配置岗位、面试问题与面试官设定，向候选人发送模拟面试链接，集中查看每个候选人的评估结果。",
    role: "HR / 招聘负责人",
    title: "把招聘流程沉淀为可复用的工作流",
  },
  {
    Icon: UsersIcon,
    description:
      "通过聊天式筛选快速浏览简历，查看 AI 给出的亮点、风险与追问过程，决定是否安排深入面试。",
    role: "业务面试官 / 用人经理",
    title: "判断更快、依据更完整",
  },
  {
    Icon: MicIcon,
    description:
      "通过链接进入实时语音模拟面试，完整经历追问与作答流程，提交后得到一致的结构化记录。",
    role: "候选人",
    title: "贴近真实节奏的面试体验",
  },
];

export function Personas() {
  return (
    <Section className="bg-muted/30 rounded-3xl">
      <Eyebrow>For Every Role</Eyebrow>
      <SectionTitle>不同角色，同一套招聘工作流</SectionTitle>
      <SectionLead>
        从招聘负责人配置流程，到面试官评估候选人，再到候选人参与模拟面试，每一步都在同一个产品里完成，记录与上下文不再分散。
      </SectionLead>

      <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3 sm:gap-6">
        {personas.map(({ Icon, description, role, title }, index) => (
          <FadeContent delay={0.1 * index} key={role}>
            <Card className="h-full border-primary/15 bg-background/60 backdrop-blur">
              <CardHeader>
                <div className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon aria-hidden="true" className="size-5" />
                </div>
                <p className="font-medium text-primary text-xs uppercase tracking-wider">{role}</p>
                <CardTitle className="mt-2 text-lg sm:text-xl">{title}</CardTitle>
                <CardDescription className="mt-2 text-sm leading-relaxed">
                  {description}
                </CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </FadeContent>
        ))}
      </div>
    </Section>
  );
}
```

- [ ] **Step 2: Render `<Personas />` after `<FeatureBlocks />`**

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

Visual: 3 cards on `md+`, stacked on mobile.

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/home/personas.tsx src/app/_components/home-page-client.tsx
git commit -m "feat(home): add personas section"
```

---

## Task 8: Process tabs

**Files:**

- Create: `src/app/_components/home/process-tabs.tsx`
- Modify: `src/app/_components/home-page-client.tsx`

- [ ] **Step 1: Create `process-tabs.tsx`**

```tsx
// src/app/_components/home/process-tabs.tsx
// 用途：从简历到评估的 4 步骤交互式标签切换 / Interactive 4-step process tabs.
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Screenshot } from "./screenshot";
import { Eyebrow, Section, SectionLead, SectionTitle } from "./section";

type Step = {
  body: string;
  darkSrc: string;
  imageAlt: string;
  label: string;
  number: string;
  title: string;
  value: string;
  lightSrc: string;
};

const steps: Step[] = [
  {
    body: "在工作台维护岗位描述、关键能力要求与面试官人设，作为后续筛选与面试的统一上下文。",
    darkSrc: "/landing/process-1-dark.png",
    imageAlt: "上传 JD 与岗位配置界面",
    label: "上传 JD",
    lightSrc: "/landing/process-1-light.png",
    number: "01",
    title: "在工作台设定岗位语境",
    value: "step-1",
  },
  {
    body: "上传一批 PDF 简历，AI 围绕岗位要求展开聊天式追问，输出每位候选人的亮点、风险与建议。",
    darkSrc: "/landing/process-2-dark.png",
    imageAlt: "聊天式简历筛选界面",
    label: "简历筛选",
    lightSrc: "/landing/process-2-light.png",
    number: "02",
    title: "聊天式完成简历初筛",
    value: "step-2",
  },
  {
    body: "向候选人发送语音面试链接,AI 按岗位语境进行实时追问,完整记录对话节奏与作答内容。",
    darkSrc: "/landing/process-3-dark.png",
    imageAlt: "实时语音面试界面",
    label: "语音面试",
    lightSrc: "/landing/process-3-light.png",
    number: "03",
    title: "发起实时语音模拟面试",
    value: "step-3",
  },
  {
    body: "面试结束后查看结构化评估、对话记录与时间线,与简历阶段的判断对照,做出最终决定。",
    darkSrc: "/landing/process-4-dark.png",
    imageAlt: "面试评估结果界面",
    label: "查看评估",
    lightSrc: "/landing/process-4-light.png",
    number: "04",
    title: "查看完整评估与对话记录",
    value: "step-4",
  },
];

export function ProcessTabs() {
  return (
    <Section width="wide">
      <Eyebrow>How It Works</Eyebrow>
      <SectionTitle>从一份 JD 到一次完整评估，四步贯通</SectionTitle>
      <SectionLead>每一步都在同一个产品里完成,候选人上下文与团队判断不会断开。</SectionLead>

      <Tabs className="mt-10" defaultValue="step-1">
        <TabsList className="h-auto w-full max-w-3xl flex-wrap gap-1 bg-muted/40 p-1.5">
          {steps.map((step) => (
            <TabsTrigger
              className="flex-1 min-w-[6rem] py-2 text-xs sm:text-sm"
              key={step.value}
              value={step.value}
            >
              <span className="mr-1.5 font-mono text-[10px] text-foreground/50 sm:text-xs">
                {step.number}
              </span>
              {step.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {steps.map((step) => (
          <TabsContent className="mt-8" key={step.value} value={step.value}>
            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-12">
              <div>
                <p className="font-mono text-primary text-sm">{step.number}</p>
                <h3 className="mt-2 font-bold text-2xl text-foreground tracking-tight sm:text-3xl">
                  {step.title}
                </h3>
                <p className="mt-3 text-base text-muted-foreground leading-relaxed">{step.body}</p>
              </div>
              <Screenshot
                alt={step.imageAlt}
                darkSrc={step.darkSrc}
                height={900}
                lightSrc={step.lightSrc}
                width={1440}
              />
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </Section>
  );
}
```

- [ ] **Step 2: Render `<ProcessTabs />` after `<Personas />`**

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

Click each of the 4 tabs in the browser; the right-hand screenshot/content should update with no console errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/home/process-tabs.tsx src/app/_components/home-page-client.tsx
git commit -m "feat(home): add process tabs section"
```

---

## Task 9: FAQ + Secondary CTA + Footer

**Files:**

- Create: `src/app/_components/home/faq.tsx`
- Create: `src/app/_components/home/cta-section.tsx`
- Create: `src/app/_components/home/footer.tsx`
- Modify: `src/app/_components/home-page-client.tsx`

- [ ] **Step 1: Create `faq.tsx`**

```tsx
// src/app/_components/home/faq.tsx
// 用途：5 条常见问题 / Top 5 FAQs.
"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Eyebrow, Section, SectionTitle } from "./section";

const faqs = [
  {
    answer:
      "简历内容与面试录音仅用于本次评估并安全存储,不会用于训练任何模型。需要时可在工作台清理历史记录。",
    question: "上传的简历和面试录音会被怎样使用？",
  },
  {
    answer:
      "AI 评估基于岗位语境与候选人作答给出结构化判断,定位是辅助参考,不替代人类决策。建议结合面试官的现场判断使用。",
    question: "AI 给出的评估结果靠不靠谱？是否会替代人工面试？",
  },
  {
    answer:
      "目前对常见的工程、产品、设计、运营、销售类岗位适配良好。其它专业岗位也可使用,但建议在 JD 与面试官人设中明确专业要求,以提高追问质量。",
    question: "支持哪些岗位或行业？",
  },
  {
    answer: "招聘方需要登录后进入工作台。候选人无需注册,通过模拟面试链接即可直接进入语音面试。",
    question: "招聘方和候选人的接入方式是怎样的？",
  },
  {
    answer:
      "建议使用现代浏览器(Chrome / Edge / Safari)与稳定网络,佩戴耳机以获得更好的语音体验。系统会在面试开始前检测麦克风。",
    question: "候选人参加语音面试有什么设备或网络要求？",
  },
];

export function Faq() {
  return (
    <Section>
      <Eyebrow>FAQ</Eyebrow>
      <SectionTitle>常见问题</SectionTitle>
      <Accordion className="mt-10 max-w-3xl" collapsible type="single">
        {faqs.map((item, index) => (
          <AccordionItem key={item.question} value={`faq-${index}`}>
            <AccordionTrigger className="text-left text-base sm:text-lg">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-relaxed sm:text-base">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}
```

- [ ] **Step 2: Create `cta-section.tsx`**

```tsx
// src/app/_components/home/cta-section.tsx
// 用途：页脚上方的二次 CTA / Secondary CTA above footer.
"use client";

import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, SectionTitle } from "./section";

type CtaSectionProps = {
  isPending: boolean;
  onResumeFiltering: () => void;
  onWorkbench: () => void;
};

export function CtaSection({ isPending, onResumeFiltering, onWorkbench }: CtaSectionProps) {
  return (
    <Section>
      <div className="rounded-3xl border border-primary/15 bg-primary/5 px-8 py-16 text-center backdrop-blur sm:px-12 sm:py-20">
        <SectionTitle className="mx-auto text-balance">准备好让招聘流程更连续了吗？</SectionTitle>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground leading-relaxed sm:text-lg">
          从一份简历开始,在同一个工作台里完成筛选、面试与评估。
        </p>
        <div className="mt-8 inline-flex items-stretch">
          <Button
            className="group h-11 min-w-[12em] gap-0 rounded-l-xl rounded-r-none border-primary/40 bg-primary/20! px-8 text-sm backdrop-blur-md hover:bg-primary/40! sm:h-12 sm:px-10 sm:text-base"
            disabled={isPending}
            onClick={onResumeFiltering}
            type="button"
            variant="outline"
          >
            <span>开始简历筛选</span>
            <span className="inline-flex max-w-0 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:ml-2 group-hover:max-w-4 group-hover:opacity-100">
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </span>
          </Button>
          <Button
            className="group h-11 min-w-[12em] gap-0 rounded-l-none rounded-r-xl border-background bg-background/60 px-8 text-sm backdrop-blur-md hover:bg-background/80 sm:h-12 sm:px-10 sm:text-base"
            disabled={isPending}
            onClick={onWorkbench}
            type="button"
            variant="outline"
          >
            <span>进入工作台</span>
            <span className="inline-flex max-w-0 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:ml-2 group-hover:max-w-4 group-hover:opacity-100">
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </span>
          </Button>
        </div>
      </div>
    </Section>
  );
}
```

- [ ] **Step 3: Create `footer.tsx`**

```tsx
// src/app/_components/home/footer.tsx
// 用途：极简页脚 / Minimal footer.
import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export function HomeFooter() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">
      <Separator className="mb-8 bg-border/60" />
      <div className="flex flex-col items-center justify-between gap-4 text-foreground/70 text-xs sm:flex-row sm:text-sm">
        <p>© {new Date().getFullYear()} 招聘协作工作台</p>
        <nav className="flex items-center gap-5">
          <Link className="transition-colors hover:text-foreground" href="/chat">
            产品
          </Link>
          <Link className="transition-colors hover:text-foreground" href="/login">
            登录
          </Link>
        </nav>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Wire all three into `home-page-client.tsx` after `<ProcessTabs />`**

```tsx
<ProcessTabs />
<Faq />
<CtaSection
  isPending={isPending}
  onResumeFiltering={() => navigate("/chat")}
  onWorkbench={() => navigate("/studio/interviews")}
/>
<HomeFooter />
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

In the browser, scroll the full page top-to-bottom; expand each FAQ item; click each CTA button while logged out (sign-in dialog should appear) and logged in (should navigate). Test in both themes.

- [ ] **Step 6: Commit**

```bash
git add src/app/_components/home/ src/app/_components/home-page-client.tsx
git commit -m "feat(home): add FAQ, secondary CTA, and footer"
```

---

## Task 10: Final composer cleanup

**Files:**

- Modify: `src/app/_components/home-page-client.tsx`

- [ ] **Step 1: Final state of `home-page-client.tsx`**

Replace the entire file content with:

```tsx
// src/app/_components/home-page-client.tsx
"use client";

import { useMemo } from "react";
import { SignInRequiredDialog } from "@/components/auth/sign-in-required-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BackgroundLayers } from "./home/background-layers";
import { CtaSection } from "./home/cta-section";
import { Faq } from "./home/faq";
import { FeatureBlocks } from "./home/feature-blocks";
import { HomeFooter } from "./home/footer";
import { Hero } from "./home/hero";
import { Personas } from "./home/personas";
import { ProcessTabs } from "./home/process-tabs";
import { ProductShot } from "./home/product-shot";
import { TrustStrip } from "./home/trust-strip";
import { useProtectedNavigation } from "./home/use-protected-navigation";

export default function HomePageClient() {
  const { isPending, navigate, pendingPath, setPendingPath } = useProtectedNavigation();

  const callbackURL = useMemo(() => pendingPath ?? "/chat", [pendingPath]);
  const onResumeFiltering = () => navigate("/chat");
  const onWorkbench = () => navigate("/studio/interviews");

  return (
    <>
      <BackgroundLayers />

      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <ScrollArea className="fixed inset-0">
        <main className="relative flex w-full flex-col items-stretch" id="main-content">
          <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col items-center justify-center px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
            <Hero
              isPending={isPending}
              onResumeFiltering={onResumeFiltering}
              onWorkbench={onWorkbench}
            />
            <TrustStrip />
          </div>
          <ProductShot />
          <FeatureBlocks />
          <Personas />
          <ProcessTabs />
          <Faq />
          <CtaSection
            isPending={isPending}
            onResumeFiltering={onResumeFiltering}
            onWorkbench={onWorkbench}
          />
          <HomeFooter />
        </main>
      </ScrollArea>

      <SignInRequiredDialog
        callbackURL={callbackURL}
        onOpenChange={(open) => !open && setPendingPath(null)}
        open={pendingPath !== null}
        title={
          pendingPath === "/studio/interviews"
            ? "登录后即可进入模拟面试工作台"
            : "登录后即可进入简历筛选"
        }
      />
    </>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

Run: `pnpm dlx ultracite fix`
Expected: no remaining issues.

Full visual scroll-through in both light and dark themes.

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/home-page-client.tsx
git commit -m "refactor(home): finalize composer with all section components"
```

---

## Task 11: Capture real screenshots and replace placeholders

**Files:**

- Modify: `public/landing/*.png`

- [ ] **Step 1: Make sure dev server is running**

Run: `pnpm dev`
Expected: server up at `http://localhost:3000`.

- [ ] **Step 2: Capture light-theme screenshots**

Using Chrome DevTools MCP:

1. Set the app theme to light (toggle the ThemeToggle if needed).
2. For each surface, navigate, set viewport to 1440×900, and take a full-page screenshot:
   - `http://localhost:3000/chat` → save as `public/landing/chat-light.png`
   - `http://localhost:3000/studio/interviews` → save as `public/landing/studio-light.png`
   - `http://localhost:3000/interview/<a-real-id>` (or a representative interview surface) → save as `public/landing/interview-light.png`

Process step thumbnails — reuse cropped or alternative views:

- `process-1-light.png` — `/studio/job-descriptions` (or JD detail)
- `process-2-light.png` — `/chat` mid-conversation
- `process-3-light.png` — `/interview/<id>` voice surface
- `process-4-light.png` — `/studio/interviews` results / detail

- [ ] **Step 3: Capture dark-theme screenshots**

Repeat Step 2 with the app set to dark theme; save each as `*-dark.png`.

- [ ] **Step 4: Verify visual quality**

Reload the home page; confirm screenshots are crisp and themed inversely.

- [ ] **Step 5: Commit**

```bash
git add public/landing/
git commit -m "chore(home): add landing page screenshots"
```

---

## Final Verification

- [ ] `pnpm typecheck` — PASS
- [ ] `pnpm lint` — PASS
- [ ] `pnpm dlx ultracite fix` — no remaining issues
- [ ] Visual: scroll the full homepage in both light and dark themes; click both CTAs in each theme; expand all FAQs; switch all 4 process tabs; verify mobile breakpoint at 375px and tablet at 768px in DevTools.
- [ ] No console errors or hydration warnings.
