// 用途：把首页固定背景动画 + 遮罩抽出为单一组件
// Purpose: extracts the fixed homepage background animation + mask into one component.
"use client";

import { MeshGradient } from "@paper-design/shaders-react";
import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import type { ComponentProps, ComponentType } from "react";
import { useEffect, useState } from "react";
import { AsciiHero } from "@/components/react-bits/ascii-hero";
import Grainient from "@/components/react-bits/grainient";

interface BackgroundLayerComponents {
  AsciiHero: ComponentType<ComponentProps<typeof AsciiHero>>;
  Grainient: ComponentType<ComponentProps<typeof Grainient>>;
  MeshGradient: ComponentType<ComponentProps<typeof MeshGradient>>;
}

interface BackgroundLayersViewProps {
  components: BackgroundLayerComponents;
  mounted: boolean;
  prefersReducedMotion: boolean;
  resolvedTheme: string | undefined;
}

export function BackgroundLayersView({
  components,
  mounted,
  prefersReducedMotion,
  resolvedTheme,
}: BackgroundLayersViewProps) {
  const {
    AsciiHero: AsciiHeroComponent,
    Grainient: GrainientComponent,
    MeshGradient: MeshGradientComponent,
  } = components;
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
        {isDark ? (
          <>
            <div className="absolute inset-0">
              <MeshGradientComponent
                colors={["#e3ebff", "#1d4ed8", "#3e68df", "#7699ef"]}
                distortion={0.8}
                grainMixer={0}
                grainOverlay={0}
                height="100%"
                maxPixelCount={1_920_000}
                speed={prefersReducedMotion ? 0 : 0.35}
                swirl={0.1}
                width="100%"
              />
            </div>
            <div className="absolute inset-0">
              <AsciiHeroComponent />
            </div>
          </>
        ) : (
          <>
            <div className="absolute inset-0 opacity-100">
              <GrainientComponent
                color1="#d6e2fa"
                color2="#1D4ED8"
                color3="#7999e4"
                timeSpeed={0.5}
                colorBalance={0}
                warpStrength={1}
                warpFrequency={5}
                warpSpeed={2}
                warpAmplitude={50}
                blendAngle={0}
                blendSoftness={0.05}
                rotationAmount={500}
                noiseScale={3}
                grainAmount={0.1}
                grainScale={2}
                grainAnimated={false}
                contrast={1.5}
                gamma={1}
                saturation={1}
                centerX={0}
                centerY={0}
                zoom={0.9}
              />
            </div>
            <div className="absolute inset-0">
              <AsciiHeroComponent />
            </div>
          </>
        )}
      </div>
      <div
        aria-hidden="true"
        className="bg-mask pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(to_bottom,oklch(0.985_0.007_236.5/0.48),oklch(0.985_0.007_236.5/0.68)_42%,oklch(0.985_0.007_236.5/0.82)_100%)] opacity-80 dark:bg-[linear-gradient(to_bottom,oklch(0.145_0_0/0.55),oklch(0.145_0_0/0.72)_42%,oklch(0.145_0_0/0.88)_100%)] dark:opacity-0"
      />
    </>
  );
}

export function BackgroundLayers() {
  const { resolvedTheme } = useTheme();
  const prefersReducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <BackgroundLayersView
      components={{ AsciiHero, Grainient, MeshGradient }}
      mounted={mounted}
      prefersReducedMotion={prefersReducedMotion ?? false}
      resolvedTheme={resolvedTheme}
    />
  );
}
