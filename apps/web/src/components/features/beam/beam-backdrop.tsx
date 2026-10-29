"use client";

import { cn } from "@app/shared/utils";
import { lazy, Suspense, useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { waitForEntranceAnimations, waitForIdle } from "@/lib/client/entrance-animations";

const BeamShader = lazy(() => import("./beam-shader"));

interface BeamBackdropProps {
  /** 定位与尺寸由调用方决定。 Position and size come from the caller. */
  className?: string;
}

/**
 * 登录页右侧的光束卡片。CSS 渐变兜底（SSR 即可见）→ WebGPU shader 就绪后淡入；
 * WebGPU 不可用或减弱动效时停在渐变上。
 * Login side card beam backdrop: a CSS gradient fallback visible from SSR, with the WebGPU shader fading in once ready. Without WebGPU or with reduced motion the
 * gradient stays.
 */
export function BeamBackdrop({ className }: BeamBackdropProps) {
  const reducedMotion = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const [shaderState, setShaderState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [quietStart, setQuietStart] = useState(false);
  // 等入场动画结束后的空闲时段再加载 shader 分包并初始化 WebGPU。
  // Load the shader chunk and start WebGPU only in the idle period after entrance animations.
  useEffect(() => {
    let active = true;
    async function waitForQuietStart() {
      await waitForEntranceAnimations();
      await waitForIdle();
      if (active) {
        setQuietStart(true);
      }
    }
    void waitForQuietStart();
    return () => {
      active = false;
    };
  }, []);
  // 只在水合后（effect 之后）读取 navigator。 navigator is only read after hydration (post-effect).
  const mountShader =
    quietStart && reducedMotion === false && shaderState !== "unavailable" && "gpu" in navigator;

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none overflow-hidden", className)}
      data-slot="beam-backdrop"
    >
      <div className="beam-backdrop-fallback absolute inset-0" />
      {mountShader ? (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-700 ease-out",
            shaderState === "ready" ? "opacity-100" : "opacity-0",
          )}
        >
          <Suspense fallback={null}>
            <BeamShader
              dark={resolvedTheme === "dark"}
              onReady={() => setShaderState("ready")}
              onUnavailable={() => setShaderState("unavailable")}
            />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}
