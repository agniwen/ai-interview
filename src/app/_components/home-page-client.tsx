"use client";

import {
  ArrowRightIcon,
  BriefcaseBusinessIcon,
  FileSearch2Icon,
  MessageCircleMoreIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SignInRequiredDialog } from "@/components/auth/sign-in-required-dialog";
import { DarkVeil } from "@/components/react-bits/dark-veil";
import DotGrid from "@/components/react-bits/dot-grid";
import { FadeContent } from "@/components/react-bits/fade-content";
import Prism from "@/components/react-bits/prism";
import { SplitText } from "@/components/react-bits/split-text";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

import { authClient } from "@/lib/auth-client";

const highlights = [
  {
    description: "支持一次上传多份 PDF 简历，围绕岗位要求持续追问并输出筛选建议。",
    icon: FileSearch2Icon,
    title: "聊天式简历初筛",
  },
  {
    description: "输入 JD 或筛选要求后，评估会围绕真实招聘语境展开，而不只是匹配关键词。",
    icon: BriefcaseBusinessIcon,
    title: "岗位语境驱动",
  },
  {
    description: "发起实时语音面试，查看追问过程、候选人作答节奏与现场记录。",
    icon: ShieldCheckIcon,
    title: "语音模拟面试",
  },
  {
    description: "从简历初筛到模拟面试使用同一套交互体验，让判断过程更连续。",
    icon: MessageCircleMoreIcon,
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
          <Prism
            height={4}
            baseWidth={7.5}
            animationType="3drotate"
            glow={1}
            noise={0.2}
            transparent
            scale={3.3}
            hueShift={0}
            colorFrequency={2.5}
            hoverStrength={1}
            inertia={0.05}
            bloom={1}
            timeScale={0.3}
          />
        )}
      </div>
      <div
        aria-hidden="true"
        className="bg-mask pointer-events-none opacity-80 fixed inset-0 -z-10 bg-[linear-gradient(to_bottom,oklch(0.985_0.007_236.5/0.48),oklch(0.985_0.007_236.5/0.68)_42%,oklch(0.985_0.007_236.5/0.82)_100%)] dark:bg-[linear-gradient(to_bottom,oklch(0.145_0_0/0.55),oklch(0.145_0_0/0.72)_42%,oklch(0.145_0_0/0.88)_100%)]"
      />

      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>

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
                className="group h-11  gap-0 backdrop-blur-md border-primary/40 hover:bg-primary/40! bg-primary/20! rounded-r-none rounded-l-xl px-8 text-sm sm:h-12 sm:px-10 sm:text-base"
                disabled={isPending}
                onClick={() => handleProtectedNavigation("/chat")}
                type="button"
                variant="outline"
              >
                <span>进入简历筛选</span>
                <span className="inline-flex max-w-0 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:ml-2 group-hover:max-w-4 group-hover:opacity-100">
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                </span>
              </Button>
              <Button
                className="group  h-11  gap-0 rounded-r-xl rounded-l-none border-background bg-background/60 px-8 text-sm backdrop-blur-md hover:bg-background/80 sm:h-12 sm:px-10 sm:text-base"
                disabled={isPending}
                onClick={handleInterviewClick}
                type="button"
                variant="outline"
              >
                <span>进入模拟面试</span>
                <span className="inline-flex max-w-0 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:ml-2 group-hover:max-w-4 group-hover:opacity-100">
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                </span>
              </Button>
            </div>
          </FadeContent>

          <div
            className="mt-16 grid grid-cols-2 gap-4 sm:mt-24 sm:gap-6 lg:mt-28 lg:grid-cols-4"
            id="features"
          >
            {highlights.map((item, index) => {
              const Icon = item.icon;

              return (
                <FadeContent
                  className="group relative w-full overflow-hidden rounded-2xl border border-transparent bg-transparent p-5 text-center shadow-none ring-0 backdrop-blur-0 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-white/55 hover:bg-white/32 hover:shadow-[0_24px_50px_-34px_rgba(32,76,140,0.7)] hover:ring-white/35 hover:backdrop-blur-xl sm:p-6 dark:hover:border-white/15 dark:hover:bg-white/5 dark:hover:shadow-[0_24px_50px_-28px_rgba(0,0,0,0.9)] dark:hover:ring-white/10"
                  delay={0.34 + index * 0.1}
                  key={item.title}
                >
                  <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-primary/8 text-primary ring-1 ring-primary/10">
                    <Icon aria-hidden="true" className="size-6" />
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

      <SignInRequiredDialog
        callbackURL={callbackURL}
        onOpenChange={(open) => !open && setPendingPath(null)}
        open={pendingPath !== null}
        title={
          pendingPath === "/studio/interviews"
            ? "登录后即可进入模拟面试管理"
            : "登录后即可进入简历筛选"
        }
      />
    </>
  );
}
