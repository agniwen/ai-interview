"use client";

import { cn } from "@app/shared/utils";
import { lazy, Suspense, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { useHydrated } from "@/hooks/use-hydrated";

const SkyShader = lazy(() => import("./sky-shader"));

interface SkyBackdropProps {
  className?: string;
  /** 首页首屏：顶部托住文案的柔光 + 底部渐隐到页面底色。 Hero veil: soft top glow and a fade into the page. */
  veil?: boolean;
}

/**
 * 天空背景，首页首屏、登录页与 MCP 页共用。三层：CSS 渐变兜底 → shader 首帧图（SSR 即可见）→
 * WebGPU shader（就绪后淡入）。WebGPU 不可用或减弱动效时停在首帧图上。
 * Shared sky backdrop: CSS gradient fallback → first-frame poster (visible from SSR) → WebGPU shader
 * that fades in once ready. Without WebGPU or with reduced motion the poster stays.
 */
export function SkyBackdrop({ className, veil = false }: SkyBackdropProps) {
  const hydrated = useHydrated();
  const reducedMotion = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const [shaderState, setShaderState] = useState<"loading" | "ready" | "unavailable">("loading");
  // 只在水合后读取 navigator。 navigator is only read after hydration.
  const mountShader =
    hydrated && reducedMotion === false && shaderState !== "unavailable" && "gpu" in navigator;

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 -z-10", className)}
      data-slot="sky-backdrop"
    >
      <div className="sky-backdrop-poster absolute inset-0" data-slot="sky-backdrop-poster" />
      {mountShader ? (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-700 ease-out",
            shaderState === "ready" ? "opacity-100" : "opacity-0",
          )}
          data-slot="sky-backdrop-shader"
        >
          <Suspense fallback={null}>
            <SkyShader
              dark={resolvedTheme === "dark"}
              onReady={() => setShaderState("ready")}
              onUnavailable={() => setShaderState("unavailable")}
            />
          </Suspense>
        </div>
      ) : null}
      {veil ? (
        <div className="sky-backdrop-veil absolute inset-0" data-slot="sky-backdrop-veil" />
      ) : null}
    </div>
  );
}
