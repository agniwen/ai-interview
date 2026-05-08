// 用途：把首页固定背景动画 + 遮罩抽出为单一组件
// Purpose: extracts the fixed homepage background animation + mask into one component.
"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { AsciiHero } from "@/components/react-bits/ascii-hero";
import { DarkVeil } from "@/components/react-bits/dark-veil";
import DotGrid from "@/components/react-bits/dot-grid";
import Grainient from "@/components/react-bits/grainient";

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
                resolutionScale={1.5}
                scanlineFrequency={0.5}
                scanlineIntensity={0}
                speed={2}
                warpAmount={0.2}
              />
            </div>
            <div className="absolute inset-0 mix-blend-screen">
              <DotGrid
                activeColor="#ffffff"
                baseColor="#2a2a3a"
                dotSize={3}
                gap={18}
                proximity={140}
                shockRadius={220}
                shockStrength={4}
                speedTrigger={120}
              />
            </div>
          </>
        ) : (
          <>
            <div className="absolute inset-0">
              {/* <Waves
                backgroundColor="transparent"
                friction={0.57}
                lineColor="#f5f5f5"
                maxCursorMove={20}
                tension={0.01}
                waveAmpX={40}
                waveAmpY={0}
                waveSpeedX={0}
                waveSpeedY={0}
                xGap={18}
                yGap={36}
              /> */}
            </div>
            <div className="absolute inset-0 opacity-100">
              <Grainient
                color1="#b9d6e6"
                color2="#279cff"
                color3="#B497CF"
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
            {/* 亮色模式 hover 交互层：流体 ASCII canvas，叠在 Grainient 之上、bg-mask 之下
                Light-mode hover layer: fluid ASCII canvas, sits above Grainient and below bg-mask. */}
            <div className="absolute inset-0">
              <AsciiHero />
            </div>
          </>
        )}
      </div>
      {/* 保持原首页 mask，背景动画始终可见 / Preserve original mask so bg animation stays visible. */}
      <div
        aria-hidden="true"
        className="bg-mask pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(to_bottom,oklch(0.985_0.007_236.5/0.48),oklch(0.985_0.007_236.5/0.68)_42%,oklch(0.985_0.007_236.5/0.82)_100%)] opacity-80 dark:bg-[linear-gradient(to_bottom,oklch(0.145_0_0/0.55),oklch(0.145_0_0/0.72)_42%,oklch(0.145_0_0/0.88)_100%)]"
      />
    </>
  );
}
