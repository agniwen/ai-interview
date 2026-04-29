// 用途：把首页固定背景动画 + 遮罩抽出为单一组件
// Purpose: extracts the fixed homepage background animation + mask into one component.
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
              <Waves
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
              />
            </div>
            <div className="absolute inset-0 opacity-60">
              <Prism
                animationType="3drotate"
                baseWidth={7.5}
                bloom={1}
                colorFrequency={2.5}
                glow={1}
                height={4}
                hoverStrength={1}
                hueShift={0}
                inertia={0.05}
                noise={0.1}
                scale={3.3}
                timeScale={0.3}
                transparent
              />
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
