"use client";

import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SVGProps } from "react";
import { SignInRequiredDialog } from "@/components/auth/sign-in-required-dialog";
import { DarkVeil } from "@/components/react-bits/dark-veil";
import DotGrid from "@/components/react-bits/dot-grid";
import { FadeContent } from "@/components/react-bits/fade-content";
import Prism from "@/components/react-bits/prism";
import { SplitText } from "@/components/react-bits/split-text";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

import { authClient } from "@/lib/auth-client";
import Waves from "@/components/react-bits/waves";

const HOVER_OVERLAY_INITIAL = { opacity: 0, scale: 0.85 } as const;
const HOVER_OVERLAY_TRANSITION = {
  opacity: { duration: 0.18, ease: "easeOut" },
  scale: { damping: 22, stiffness: 320, type: "spring" },
  x: { damping: 30, stiffness: 320, type: "spring" },
  y: { damping: 30, stiffness: 320, type: "spring" },
} as const;

type FeatureIconProps = SVGProps<SVGSVGElement>;

const ResumeRadarIcon = ({ className, ...props }: FeatureIconProps) => (
  <svg
    className={className}
    fill="none"
    role="img"
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>简历雷达图标</title>
    <path
      d="M13 7.5h15.5L36 15v25.5H13z"
      fill="currentColor"
      fillOpacity="0.12"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <path d="M28.5 7.5V15H36" stroke="currentColor" strokeWidth="2.5" />
    <path
      d="M18 18h10M18 24h7M18 30h5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.5"
    />
    <path
      d="M31 28.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"
      fill="currentColor"
      fillOpacity="0.2"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <path d="m35 38.5 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
    <path d="M31 31.5v3h3" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    <path
      d="M9 12h4M9 22h4M9 32h4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeOpacity="0.45"
      strokeWidth="2"
    />
  </svg>
);

const RoleContextIcon = ({ className, ...props }: FeatureIconProps) => (
  <svg
    className={className}
    fill="none"
    role="img"
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>岗位语境图标</title>
    <path
      d="M10 17h28v22H10z"
      fill="currentColor"
      fillOpacity="0.12"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <path
      d="M18 17v-4.5A3.5 3.5 0 0 1 21.5 9h5a3.5 3.5 0 0 1 3.5 3.5V17"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <path d="M10 25h28" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" />
    <path
      d="M16 31h6M27 31h5M16 35h3M27 35h7"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.2"
    />
    <path d="M24 23.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" fill="currentColor" />
    <path
      d="M7 11h5M36 11h5M7 43h5M36 43h5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeOpacity="0.45"
      strokeWidth="2"
    />
  </svg>
);

const VoiceInterviewIcon = ({ className, ...props }: FeatureIconProps) => (
  <svg
    className={className}
    fill="none"
    role="img"
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>语音面试图标</title>
    <path
      d="M24 6.5 36.5 12v9.5c0 8.2-4.9 15.6-12.5 19.8-7.6-4.2-12.5-11.6-12.5-19.8V12z"
      fill="currentColor"
      fillOpacity="0.12"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="2.5"
    />
    <path
      d="M18 25c1.7-4.4 3.4-6.6 5.2-6.6 2.6 0 2.4 6.6 5.2 6.6 1.4 0 2.6-1.2 3.6-3.5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.5"
    />
    <path
      d="M17 31h14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeOpacity="0.55"
      strokeWidth="2"
    />
    <path
      d="M19 13.5h10M24 9.5v8"
      stroke="currentColor"
      strokeLinecap="round"
      strokeOpacity="0.45"
      strokeWidth="2"
    />
    <path
      d="M8 21h3M37 21h3M9 28h3M36 28h3"
      stroke="currentColor"
      strokeLinecap="round"
      strokeOpacity="0.45"
      strokeWidth="2"
    />
  </svg>
);

const WorkflowLinkIcon = ({ className, ...props }: FeatureIconProps) => (
  <svg
    className={className}
    fill="none"
    role="img"
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>筛选联动图标</title>
    <path
      d="M12 12h12v10H12zM24 26h12v10H24z"
      fill="currentColor"
      fillOpacity="0.12"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <path
      d="M24 17h5a5 5 0 0 1 5 5v4M24 31h-5a5 5 0 0 1-5-5v-4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.5"
    />
    <path
      d="m31 23 3 3 3-3M17 25l-3-3-3 3"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.5"
    />
    <path
      d="M17 17h2M29 31h2"
      stroke="currentColor"
      strokeLinecap="round"
      strokeOpacity="0.65"
      strokeWidth="2"
    />
    <path
      d="M8 8h4M36 8h4M8 40h4M36 40h4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeOpacity="0.45"
      strokeWidth="2"
    />
  </svg>
);

const highlights = [
  {
    description: "支持一次上传多份 PDF 简历，围绕岗位要求持续追问并输出筛选建议。",
    icon: ResumeRadarIcon,
    title: "聊天式简历初筛",
  },
  {
    description: "输入 JD 或筛选要求后，评估会围绕真实招聘语境展开，而不只是匹配关键词。",
    icon: RoleContextIcon,
    title: "岗位语境驱动",
  },
  {
    description: "发起实时语音面试，查看追问过程、候选人作答节奏与现场记录。",
    icon: VoiceInterviewIcon,
    title: "语音模拟面试",
  },
  {
    description: "从简历初筛到模拟面试使用同一套交互体验，让判断过程更连续。",
    icon: WorkflowLinkIcon,
    title: "筛选到面试联动",
  },
];

export default function HomePageClient() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  const callbackURL = useMemo(() => pendingPath ?? "/chat", [pendingPath]);
  const [hoveredHighlight, setHoveredHighlight] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [hoverRect, setHoverRect] = useState<{
    height: number;
    width: number;
    x: number;
    y: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (hoveredHighlight === null) {
      return;
    }
    const measure = () => {
      const grid = gridRef.current;
      const card = cardRefs.current[hoveredHighlight];
      if (!(grid && card)) {
        return;
      }
      const gridBox = grid.getBoundingClientRect();
      const cardBox = card.getBoundingClientRect();
      setHoverRect({
        height: cardBox.height,
        width: cardBox.width,
        x: cardBox.left - gridBox.left,
        y: cardBox.top - gridBox.top,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [hoveredHighlight]);

  const cardCallbacks = useMemo(
    () =>
      highlights.map((_, index) => ({
        onMouseEnter: () => setHoveredHighlight(index),
        ref: (node: HTMLDivElement | null) => {
          cardRefs.current[index] = node;
        },
      })),
    [],
  );

  const handleGridLeave = useMemo(() => () => setHoveredHighlight(null), []);

  const handleProtectedNavigation = (href: string) => {
    if (isPending) {
      return;
    }

    if (session?.user) {
      router.push(href);
      return;
    }

    setPendingPath(href);
  };

  const handleInterviewClick = () => {
    handleProtectedNavigation("/studio/interviews");
  };

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed  inset-0 -z-20 overflow-hidden">
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
            <div className="absolute inset-0 mix-blend-screen ">
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
        className="bg-mask pointer-events-none opacity-80 fixed inset-0 -z-10 bg-[linear-gradient(to_bottom,oklch(0.985_0.007_236.5/0.48),oklch(0.985_0.007_236.5/0.68)_42%,oklch(0.985_0.007_236.5/0.82)_100%)] dark:bg-[linear-gradient(to_bottom,oklch(0.145_0_0/0.55),oklch(0.145_0_0/0.72)_42%,oklch(0.145_0_0/0.88)_100%)]"
      />

      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <ScrollArea className="fixed inset-0">
        <main
          className="relative mx-auto flex min-h-dvh w-full max-w-6xl items-center justify-center px-5 py-16 sm:px-8 sm:py-20 lg:py-24"
          id="main-content"
        >
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
                  className="group h-11 min-w-[12em]  gap-0 backdrop-blur-md border-primary/40 hover:bg-primary/40! bg-primary/20! rounded-r-none rounded-l-xl px-8 text-sm sm:h-12 sm:px-10 sm:text-base"
                  disabled={isPending}
                  onClick={() => handleProtectedNavigation("/chat")}
                  type="button"
                  variant="outline"
                >
                  <span>开始简历筛选</span>
                  <span className="inline-flex max-w-0 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:ml-2 group-hover:max-w-4 group-hover:opacity-100">
                    <ArrowRightIcon aria-hidden="true" className="size-4" />
                  </span>
                </Button>
                <Button
                  className="group h-11 min-w-[12em]  gap-0 rounded-r-xl rounded-l-none border-background bg-background/60 px-8 text-sm backdrop-blur-md hover:bg-background/80 sm:h-12 sm:px-10 sm:text-base"
                  disabled={isPending}
                  onClick={handleInterviewClick}
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

            <div
              className="relative mt-16 grid auto-rows-fr grid-cols-2 gap-4 sm:mt-24 sm:gap-6 lg:mt-28 lg:grid-cols-4"
              id="features"
              onMouseLeave={handleGridLeave}
              ref={gridRef}
            >
              {hoverRect ? (
                <motion.span
                  animate={{
                    height: hoverRect.height,
                    opacity: hoveredHighlight === null ? 0 : 1,
                    scale: hoveredHighlight === null ? 0.85 : 1,
                    width: hoverRect.width,
                    x: hoverRect.x,
                    y: hoverRect.y,
                  }}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 left-0 z-0 rounded-2xl border border-white/55 bg-white/32 shadow-[0_24px_50px_-34px_rgba(32,76,140,0.7)] ring-1 ring-white/35 backdrop-blur-xl dark:border-white/15 dark:bg-white/5 dark:shadow-[0_24px_50px_-28px_rgba(0,0,0,0.9)] dark:ring-white/10"
                  initial={HOVER_OVERLAY_INITIAL}
                  transition={HOVER_OVERLAY_TRANSITION}
                />
              ) : null}
              {highlights.map((item, index) => {
                const Icon = item.icon;
                const callbacks = cardCallbacks[index];

                return (
                  <FadeContent
                    className="relative z-10 h-full w-full rounded-2xl p-5 text-center sm:p-6"
                    delay={0.34 + index * 0.1}
                    key={item.title}
                    onMouseEnter={callbacks.onMouseEnter}
                    ref={callbacks.ref}
                  >
                    <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-[1.25rem] border border-primary/10 bg-primary/8 text-primary shadow-[0_0_34px_-22px_currentColor] ring-1 ring-primary/10 dark:bg-primary/10">
                      <Icon
                        aria-hidden="true"
                        className="size-9 drop-shadow-[0_0_12px_currentColor]"
                      />
                    </div>
                    <h3 className="relative font-semibold text-foreground text-sm sm:text-base">
                      {item.title}
                    </h3>
                    <p className="relative mx-auto mt-2 max-w-[28ch] text-foreground/70 text-xs leading-relaxed sm:text-[13px]">
                      {item.description}
                    </p>
                  </FadeContent>
                );
              })}
            </div>
          </section>
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
