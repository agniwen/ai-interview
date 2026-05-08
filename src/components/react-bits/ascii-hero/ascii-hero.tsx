// 中文：亮色模式 hero 区的 ASCII 流体 hover 背景，复刻 OpenAI Codex 首屏交互
// English: Light-mode hero ASCII fluid hover background, replicating OpenAI Codex hero interaction.
"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

export interface AsciiHeroProps {
  cellSize?: number;
  charset?: string;
  color?: string;
  noiseScale?: number;
  noiseSpeed?: number;
  splatRadius?: number;
  splatStrength?: number;
  densityDissipation?: number;
  velocityDissipation?: number;
  fps?: number;
}

const DEFAULTS = {
  cellSize: 16,
  charset: " ·∙-+*▒▓",
  color: "oklch(0.55 0.03 240 / 0.35)",
  noiseScale: 0.05,
  noiseSpeed: 0.0003,
  splatRadius: 6,
  splatStrength: 1,
  densityDissipation: 0.985,
  velocityDissipation: 0.92,
  fps: 60,
} as const;

export function AsciiHero(props: AsciiHeroProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 中文：监听父容器尺寸变化，同步 canvas 物理像素 + CSS 像素
  // English: track parent size, sync canvas backing-store + CSS size.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.max(1, Math.floor(rect.width));
      const cssH = Math.max(1, Math.floor(rect.height));
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    resize();
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(resize, 200);
    });
    observer.observe(container);

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [mounted]);

  if (!mounted || resolvedTheme !== "light") return null;

  // 中文：消费 props（暂时未使用，避免 lint 警告）/ English: consume props placeholder
  void props;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full overflow-hidden"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
