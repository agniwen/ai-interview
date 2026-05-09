// 中文：亮色模式背景的 ASCII 噪声字符场，按时间演化的稀疏点（无指针交互）
// English: Light-mode background ASCII noise field — sparse dots animating via time-driven noise (no pointer interaction).
"use client";

import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { createNoise3D } from "simplex-noise";
import { compose } from "./utils";

export interface AsciiHeroProps {
  cellSize?: number;
  charset?: string;
  color?: string;
  noiseScale?: number;
  noiseSpeed?: number;
  fps?: number;
}

const DEFAULTS = {
  cellSize: 16,
  charset: " ·∙-+*▒▓",
  color: "rgba(255, 255, 255, 0.6)",
  noiseScale: 0.05,
  noiseSpeed: 0.0003,
  fps: 60,
} as const;

export function AsciiHero(props: AsciiHeroProps) {
  // 中文：用 useMemo 稳定 cfg 引用，避免 effect 在每次渲染时重建
  // English: stabilize cfg reference via useMemo so the effect doesn't re-mount on every render.
  const cfg = useMemo(
    () => ({ ...DEFAULTS, ...props }),
    [props.cellSize, props.charset, props.color, props.noiseScale, props.noiseSpeed, props.fps],
  );
  const { resolvedTheme } = useTheme();
  const prefersReduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || resolvedTheme !== "light") return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const noise3D = createNoise3D();

    let W = 0;
    let H = 0;
    let cssW = 0;
    let cssH = 0;
    let luma = new Float32Array(0);
    let charBuffer = new Uint8Array(0);
    let rafId = 0;
    let lastFrame = 0;
    const frameInterval = 1000 / cfg.fps;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      cssW = Math.max(1, Math.floor(rect.width));
      cssH = Math.max(1, Math.floor(rect.height));
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${cfg.cellSize}px ui-monospace, SF Mono, monospace`;
      ctx.textBaseline = "top";
      ctx.fillStyle = cfg.color;

      W = Math.max(1, Math.ceil(cssW / cfg.cellSize));
      H = Math.max(1, Math.ceil(cssH / cfg.cellSize));
      luma = new Float32Array(W * H);
      charBuffer = new Uint8Array(W * H).fill(255);
    };

    const renderFrame = (t: number) => {
      compose({
        luma,
        noise: noise3D,
        W,
        H,
        noiseScale: cfg.noiseScale,
        noiseSpeed: cfg.noiseSpeed,
        t,
      });
      const charsetLen = cfg.charset.length;
      const cellSize = cfg.cellSize;
      for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) {
          const idx = j * W + i;
          const v = luma[idx];
          const cidx = Math.min(charsetLen - 1, Math.max(0, Math.floor(v * charsetLen)));
          if (cidx === charBuffer[idx]) continue;
          charBuffer[idx] = cidx;
          ctx.clearRect(i * cellSize, j * cellSize, cellSize, cellSize);
          const ch = cfg.charset[cidx];
          if (ch !== " ") ctx.fillText(ch, i * cellSize, j * cellSize);
        }
      }
    };

    // 中文：prefers-reduced-motion 渲染单帧静态画面，跳过 rAF
    // English: prefers-reduced-motion renders a single static frame, skips rAF.
    if (prefersReduced) {
      resize();
      renderFrame(0);
      const observer = new ResizeObserver(() => {
        resize();
        renderFrame(0);
      });
      observer.observe(container);
      return () => observer.disconnect();
    }

    const tick = (now: number) => {
      if (now - lastFrame >= frameInterval) {
        lastFrame = now;
        renderFrame(now);
      }
      rafId = requestAnimationFrame(tick);
    };

    resize();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(resize, 200);
    });
    observer.observe(container);

    let tabVisible = !document.hidden;

    const start = () => {
      if (!rafId && tabVisible) {
        lastFrame = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };
    const stop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    // 中文：标签页隐藏时暂停 rAF / English: pause rAF when tab is hidden.
    const onVisibility = () => {
      tabVisible = !document.hidden;
      if (tabVisible) start();
      else stop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    start();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [mounted, resolvedTheme, cfg, prefersReduced]);

  if (!mounted || resolvedTheme !== "light") return null;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
