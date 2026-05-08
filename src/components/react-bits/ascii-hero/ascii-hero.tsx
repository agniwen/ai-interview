// 中文：亮色模式 hero 区的 ASCII 流体 hover 背景，复刻 OpenAI Codex 首屏交互
// English: Light-mode hero ASCII fluid hover background, replicating OpenAI Codex hero interaction.
"use client";

import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { createNoise3D } from "simplex-noise";
import { advect, compose, dissipate, splat } from "./utils";

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
  // 中文：用 useMemo 稳定 cfg 引用，避免 effect 在每次渲染时重建（无 prop 改变时引用恒定）
  // English: stabilize cfg reference via useMemo so the effect doesn't re-mount on every render.
  const cfg = useMemo(
    () => ({ ...DEFAULTS, ...props }),
    [
      props.cellSize,
      props.charset,
      props.color,
      props.noiseScale,
      props.noiseSpeed,
      props.splatRadius,
      props.splatStrength,
      props.densityDissipation,
      props.velocityDissipation,
      props.fps,
    ],
  );
  const { resolvedTheme } = useTheme();
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
    let density = new Float32Array(0);
    let prevDensity = new Float32Array(0);
    let luma = new Float32Array(0);
    let charBuffer = new Uint8Array(0);
    // 中文：速度场（每格存 vx/vy 两分量）和指针状态 / English: velocity field (vx,vy per cell) and pointer state
    let velocity = new Float32Array(0);
    let pointer: { cx: number; cy: number; vx: number; vy: number } | null = null;
    let lastPointer: { cx: number; cy: number } | null = null;
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
      density = new Float32Array(W * H);
      prevDensity = new Float32Array(W * H);
      velocity = new Float32Array(W * H * 2);
      luma = new Float32Array(W * H);
      charBuffer = new Uint8Array(W * H).fill(255);
    };

    const tick = (now: number) => {
      if (now - lastFrame >= frameInterval) {
        lastFrame = now;

        // 1. splat
        // 中文：消费待处理的指针事件，注入密度+速度 / English: consume pending pointer event, inject density+velocity
        if (pointer) {
          splat({
            density,
            velocity,
            W,
            H,
            cx: pointer.cx,
            cy: pointer.cy,
            vx: pointer.vx,
            vy: pointer.vy,
            radius: cfg.splatRadius,
            strength: cfg.splatStrength,
          });
          pointer = null;
        }

        // 2. swap then advect: density → prevDensity, then write fresh density from prevDensity using current velocity
        // 中文：交换乒乓缓冲区，再用速度场对前一帧密度做半拉格朗日平流，写入当前帧 / English: ping-pong buffers, then semi-Lagrangian advect from prevDensity into density using velocity
        const swap = density;
        density = prevDensity;
        prevDensity = swap;
        advect({ density, prevDensity, velocity, W, H, dt: 1 });

        // 3. dissipate
        dissipate(density, cfg.densityDissipation);
        dissipate(velocity, cfg.velocityDissipation);

        // 4. compose
        compose({
          luma,
          density,
          noise: noise3D,
          W,
          H,
          noiseScale: cfg.noiseScale,
          noiseSpeed: cfg.noiseSpeed,
          t: now,
        });

        // 5. render (unchanged from task 7)
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

    // 中文：监听全局指针移动，将坐标转换为 cell 单位并记录速度 / English: track pointer in cell coords with velocity
    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / cfg.cellSize;
      const cy = (e.clientY - rect.top) / cfg.cellSize;
      if (lastPointer) {
        pointer = {
          cx,
          cy,
          vx: cx - lastPointer.cx,
          vy: cy - lastPointer.cy,
        };
      } else {
        pointer = { cx, cy, vx: 0, vy: 0 };
      }
      lastPointer = { cx, cy };
    };
    // 中文：指针离开时重置追踪，避免下次进入产生错误速度 / English: reset tracking on leave to avoid spurious velocity on re-entry
    const handlePointerLeave = () => {
      lastPointer = null;
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerleave", handlePointerLeave);

    rafId = requestAnimationFrame(tick);

    return () => {
      // 中文：清除指针监听，避免组件卸载后泄漏 / English: remove pointer listeners to avoid leaks after unmount
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      cancelAnimationFrame(rafId);
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [mounted, resolvedTheme, cfg]);

  if (!mounted || resolvedTheme !== "light") return null;

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
