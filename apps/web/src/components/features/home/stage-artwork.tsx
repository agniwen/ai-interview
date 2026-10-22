// 首页面板背景：颗粒感柔和渐变。上浅偏冷、下深偏暖的线性底色 + 四团边缘渐隐的径向色团 +
// 逐物理像素的灰度噪点 + 可选的白色细线纹样。色团用 CSS 缓慢漂移，悬停时按弹簧朝光标偏移。
// Homepage panel backdrop: soft grainy gradient. A light/cool-to-deep/warm linear base, four
// feathered radial blobs, per-physical-pixel grayscale grain and an optional thin white line
// pattern. Blobs drift via CSS and lean toward the cursor on a spring while hovered.
"use client";

import { cn } from "@app/shared/utils";
import {
  m,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useId, useRef } from "react";
import { useHydrated } from "@/hooks/use-hydrated";

/** 色环上相邻的配色组，定义见 globals.css。 Analogous palettes, defined in globals.css. */
export type StageArtworkPalette = "dusk" | "ember" | "harbor" | "moss" | "night" | "sand";
export type StageArtworkPattern = "contours" | "dots" | "lens" | "rays" | "waves";

const NOISE_TILE = 128;
// 噪点围绕中灰取值：overlay 下中灰不改变底色，振幅越小颗粒越细腻。
// Grain sits around mid-grey, which overlay leaves unchanged; a smaller swing keeps it fine.
const NOISE_MID = 128;
const NOISE_SWING = 64;
// 刚度 70、阻尼比 0.86：damping = 2ζ√(k·m)。 Stiffness 70 with a 0.86 damping ratio.
const HOVER_SPRING = { damping: 2 * 0.86 * Math.sqrt(70), mass: 1, stiffness: 70 } as const;
/** 悬停时色团、纹样的最大偏移（占容器百分比）。 Max hover offset as a percentage of the panel. */
const BLOB_SHIFT_PERCENT = 6;
const PATTERN_SHIFT_PERCENT = -2;

let noiseTileUrl: string | undefined;

/** 生成一次 128×128 灰度随机噪点并缓存。 Builds the 128×128 grayscale noise tile once. */
function getNoiseTileUrl(): string | undefined {
  if (noiseTileUrl) {
    return noiseTileUrl;
  }
  const canvas = document.createElement("canvas");
  canvas.width = NOISE_TILE;
  canvas.height = NOISE_TILE;
  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }
  const image = context.createImageData(NOISE_TILE, NOISE_TILE);
  for (let index = 0; index < image.data.length; index += 4) {
    const value = Math.round(NOISE_MID + (Math.random() * 2 - 1) * NOISE_SWING);
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  noiseTileUrl = canvas.toDataURL("image/png");
  return noiseTileUrl;
}

// 纹样在 800×600 画布上预先算好，SSR 与客户端一致。 Patterns are precomputed on an 800×600 canvas.
const PATTERN_WIDTH = 800;
const PATTERN_HEIGHT = 600;

const RAY_COUNT = 44;
const RAYS = Array.from({ length: RAY_COUNT }, (_, index) => {
  const angle = Math.PI * (0.04 + (0.92 * index) / (RAY_COUNT - 1));
  const length = 1100;
  const x = 400 - Math.cos(angle) * length;
  const y = 720 - Math.sin(angle) * length;
  return `M400 720L${x.toFixed(1)} ${y.toFixed(1)}`;
});

const CONTOURS = Array.from({ length: 18 }, (_, index) => {
  const rx = 36 + index * 30;
  return { rx, ry: rx * 0.64 };
});

const WAVE_ROWS = 24;
const WAVE_STEP = 10;
const WAVES = Array.from({ length: WAVE_ROWS }, (_, row) => {
  const baseY = 30 + (row * (PATTERN_HEIGHT - 60)) / (WAVE_ROWS - 1);
  const amplitude = 4 + 22 * Math.sin((Math.PI * row) / (WAVE_ROWS - 1));
  const points: string[] = [];
  for (let x = 0; x <= PATTERN_WIDTH; x += WAVE_STEP) {
    const y = baseY + amplitude * Math.sin(x / 70 + row * 0.45) * Math.sin(x / 260);
    points.push(`${x} ${y.toFixed(1)}`);
  }
  return `M${points.join("L")}`;
});

const DOT_SPACING = 26;

const LENSES = [
  { rotate: -18, width: 260, x: 110, y: 120 },
  { rotate: 24, width: 220, x: 650, y: 90 },
  { rotate: 8, width: 300, x: 160, y: 470 },
  { rotate: -30, width: 240, x: 660, y: 470 },
  { rotate: 62, width: 180, x: 40, y: 300 },
  { rotate: -64, width: 200, x: 770, y: 290 },
  { rotate: 4, width: 280, x: 420, y: 570 },
] as const;

function lensPath(width: number) {
  const half = width / 2;
  const radius = width * 0.78;
  return `M${-half} 0A${radius} ${radius} 0 0 1 ${half} 0A${radius} ${radius} 0 0 1 ${-half} 0Z`;
}

function PatternLines({ pattern }: { pattern: StageArtworkPattern }) {
  const dotPatternId = useId();
  switch (pattern) {
    case "rays": {
      return RAYS.map((d) => <path d={d} key={d} />);
    }
    case "contours": {
      return CONTOURS.map(({ rx, ry }) => <ellipse cx={420} cy={330} key={rx} rx={rx} ry={ry} />);
    }
    case "waves": {
      return WAVES.map((d) => <path d={d} key={d} />);
    }
    case "dots": {
      return (
        <>
          <defs>
            <pattern
              height={DOT_SPACING}
              id={dotPatternId}
              patternUnits="userSpaceOnUse"
              width={DOT_SPACING}
            >
              <circle
                className="home-grain-dot"
                cx={DOT_SPACING / 2}
                cy={DOT_SPACING / 2}
                r={1.8}
              />
            </pattern>
          </defs>
          <rect fill={`url(#${dotPatternId})`} height="100%" stroke="none" width="100%" />
        </>
      );
    }
    case "lens": {
      return LENSES.map(({ rotate, width, x, y }) => (
        <path
          d={lensPath(width)}
          key={`${x}-${y}`}
          transform={`translate(${x} ${y}) rotate(${rotate})`}
        />
      ));
    }
    default: {
      return null;
    }
  }
}

interface StageArtworkProps {
  className?: string;
  palette: StageArtworkPalette;
  pattern?: StageArtworkPattern;
}

/**
 * 铺满父元素的颗粒渐变背景。悬停监听挂在父元素上，因为前景 UI 盖在背景之上。
 * Grainy gradient filling its parent. Hover is read from the parent since foreground UI covers it.
 */
export function StageArtwork({ className, palette, pattern }: StageArtworkProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  // 噪点只在客户端生成（缓存一次），按 devicePixelRatio 缩放让一个噪点对应一个物理像素。
  // The cached noise tile is client-only and scaled so one grain maps to one physical pixel.
  const hydrated = useHydrated();
  const noiseUrl = hydrated ? getNoiseTileUrl() : undefined;
  const noiseSize = hydrated ? NOISE_TILE / window.devicePixelRatio : NOISE_TILE;

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const glowX = useMotionValue(0);
  const glowY = useMotionValue(0);
  const hovering = useMotionValue(0);
  const springX = useSpring(pointerX, HOVER_SPRING);
  const springY = useSpring(pointerY, HOVER_SPRING);
  const springGlowX = useSpring(glowX, HOVER_SPRING);
  const springGlowY = useSpring(glowY, HOVER_SPRING);
  const glowOpacity = useSpring(hovering, HOVER_SPRING);
  const blobX = useTransform(springX, (value) => `${value * BLOB_SHIFT_PERCENT}%`);
  const blobY = useTransform(springY, (value) => `${value * BLOB_SHIFT_PERCENT}%`);
  const patternX = useTransform(springX, (value) => `${value * PATTERN_SHIFT_PERCENT}%`);
  const patternY = useTransform(springY, (value) => `${value * PATTERN_SHIFT_PERCENT}%`);
  const glow = useMotionTemplate`radial-gradient(22rem circle at ${springGlowX}px ${springGlowY}px, rgb(255 255 255 / 0.32), transparent 70%)`;

  useEffect(() => {
    const host = rootRef.current?.parentElement;
    if (!host || reducedMotion) {
      return;
    }
    const handleMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }
      const rect = host.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (hovering.get() === 0) {
        // 光晕从光标处淡入，而不是从上次位置滑过来。 The glow fades in at the cursor, not from its last spot.
        springGlowX.jump(x);
        springGlowY.jump(y);
      }
      pointerX.set(x / rect.width - 0.5);
      pointerY.set(y / rect.height - 0.5);
      glowX.set(x);
      glowY.set(y);
      hovering.set(1);
    };
    const handleLeave = () => {
      pointerX.set(0);
      pointerY.set(0);
      hovering.set(0);
    };
    host.addEventListener("pointermove", handleMove);
    host.addEventListener("pointerleave", handleLeave);
    return () => {
      host.removeEventListener("pointermove", handleMove);
      host.removeEventListener("pointerleave", handleLeave);
    };
  }, [glowX, glowY, hovering, pointerX, pointerY, reducedMotion, springGlowX, springGlowY]);

  return (
    <div
      aria-hidden="true"
      className={cn("home-grain pointer-events-none absolute inset-0 overflow-hidden", className)}
      data-palette={palette}
      data-slot="home-stage-artwork"
      ref={rootRef}
    >
      <m.div className="absolute -inset-[12%]" style={{ x: blobX, y: blobY }}>
        <div className="home-grain-blob home-grain-blob-1" />
        <div className="home-grain-blob home-grain-blob-2" />
        <div className="home-grain-blob home-grain-blob-3" />
        <div className="home-grain-blob home-grain-blob-4" />
      </m.div>
      {pattern ? (
        <m.svg
          className="home-grain-pattern absolute -top-[4%] -left-[4%] size-[108%]"
          fill="none"
          key={pattern}
          preserveAspectRatio="xMidYMid slice"
          style={{ x: patternX, y: patternY }}
          viewBox={`0 0 ${PATTERN_WIDTH} ${PATTERN_HEIGHT}`}
        >
          <PatternLines pattern={pattern} />
        </m.svg>
      ) : null}
      <m.div className="absolute inset-0" style={{ background: glow, opacity: glowOpacity }} />
      {noiseUrl ? (
        <div
          className="absolute inset-0 opacity-40 mix-blend-overlay"
          style={{
            backgroundImage: `url(${noiseUrl})`,
            backgroundSize: `${noiseSize}px ${noiseSize}px`,
          }}
        />
      ) : null}
      <div className="absolute inset-0 hidden bg-black/20 dark:block" />
    </div>
  );
}
