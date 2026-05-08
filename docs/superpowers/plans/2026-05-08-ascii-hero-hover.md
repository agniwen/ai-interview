# Hero ASCII Fluid Hover Background — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive ASCII fluid background to the homepage hero in light mode that responds to pointer movement (splat/advect/dissipate), coexisting with the existing `Grainient` global background.

**Architecture:** Pure-function fluid simulation (`splat`/`advect`/`dissipate`/`compose`) operating on `Float32Array` density + velocity fields, rendered to a Canvas 2D ASCII grid. Mounted only in light mode under a `next-themes` mounted gate; pauses via `IntersectionObserver` + `visibilitychange`; static fallback under `prefers-reduced-motion`.

**Tech Stack:** React 19 + Next.js 16 (App Router), Canvas 2D, `simplex-noise` v4, `motion/react` (`useReducedMotion`), `next-themes`, Vitest (pure-fn tests, node env — no jsdom).

**Source spec:** `docs/superpowers/specs/2026-05-08-ascii-hero-hover-design.md`

**File structure:**

```
src/components/react-bits/ascii-hero/
  utils.ts              ← pure fns: splat, advect, dissipate, compose
  utils.test.ts         ← unit tests for utils
  ascii-hero.tsx        ← main component (canvas + main loop + pause + reduced-motion)
  index.ts              ← re-exports
src/app/_components/home-shell.tsx   ← mount AsciiHero in hero region
package.json                          ← add simplex-noise dep
```

**Note on testing scope:** Project's `vitest.config.ts` uses `environment: "node"` (no jsdom). Plan covers pure-function unit tests only (which is where logic correctness matters); component mount/render is verified by manual visual acceptance per spec, not added jsdom infra for one component.

---

## Task 1: Add `simplex-noise` dependency

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install package**

```bash
pnpm add simplex-noise@^4.0.3
```

- [ ] **Step 2: Verify it's added**

```bash
grep simplex-noise package.json
```

Expected output:

```
    "simplex-noise": "^4.0.3",
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add simplex-noise dependency for ascii hero background"
```

---

## Task 2: Pure fn — `splat`

Inject Gaussian-falloff density + velocity around a pointer cell.

**Files:**

- Create: `src/components/react-bits/ascii-hero/utils.ts`
- Test: `src/components/react-bits/ascii-hero/utils.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/react-bits/ascii-hero/utils.test.ts`:

```ts
// 中文：splat / advect / dissipate / compose 纯函数单元测试
// English: pure-function unit tests for splat / advect / dissipate / compose
import { describe, expect, it } from "vitest";
import { splat } from "./utils";

describe("splat", () => {
  it("center cell receives full strength, axial neighbors get gaussian falloff, diagonals are excluded by radius cutoff", () => {
    const W = 4;
    const H = 4;
    const density = new Float32Array(W * H);
    const velocity = new Float32Array(W * H * 2);

    splat({
      density,
      velocity,
      W,
      H,
      cx: 2,
      cy: 2,
      vx: 0,
      vy: 0,
      radius: 1,
      strength: 1,
    });

    const expectedAxial = Math.exp(-1 / 0.25); // sigma = radius * 0.5 → 0.5; sigmaSq = 0.25

    expect(density[2 * 4 + 2]).toBeCloseTo(1, 5);
    expect(density[1 * 4 + 2]).toBeCloseTo(expectedAxial, 5);
    expect(density[3 * 4 + 2]).toBeCloseTo(expectedAxial, 5);
    expect(density[2 * 4 + 1]).toBeCloseTo(expectedAxial, 5);
    expect(density[2 * 4 + 3]).toBeCloseTo(expectedAxial, 5);

    // 对角格 distSq = 2 > radiusSq = 1，应被裁掉 / diagonals are excluded
    expect(density[1 * 4 + 1]).toBe(0);
    expect(density[3 * 4 + 3]).toBe(0);
    // 圆心外 / outside the disc
    expect(density[0]).toBe(0);
  });

  it("velocity injection is gaussian-weighted and respects vx/vy direction", () => {
    const W = 4;
    const H = 4;
    const density = new Float32Array(W * H);
    const velocity = new Float32Array(W * H * 2);

    splat({
      density,
      velocity,
      W,
      H,
      cx: 2,
      cy: 2,
      vx: 3,
      vy: -2,
      radius: 1,
      strength: 0,
    });

    const center = 2 * 4 + 2;
    expect(velocity[center * 2]).toBeCloseTo(3, 5);
    expect(velocity[center * 2 + 1]).toBeCloseTo(-2, 5);
  });

  it("clamps to grid bounds when pointer is at edge", () => {
    const W = 4;
    const H = 4;
    const density = new Float32Array(W * H);
    const velocity = new Float32Array(W * H * 2);

    expect(() =>
      splat({
        density,
        velocity,
        W,
        H,
        cx: 0,
        cy: 0,
        vx: 0,
        vy: 0,
        radius: 2,
        strength: 1,
      }),
    ).not.toThrow();
    expect(density[0]).toBeCloseTo(1, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/react-bits/ascii-hero/utils.test.ts`
Expected: FAIL with `Cannot find module './utils'` or similar.

- [ ] **Step 3: Implement `splat`**

Create `src/components/react-bits/ascii-hero/utils.ts`:

```ts
// 中文：ASCII Hero 流体场的纯函数（无 DOM/Canvas 依赖，便于单测）
// English: Pure-function fluid-field primitives for AsciiHero (DOM/Canvas-free, unit-testable).

export interface SplatArgs {
  density: Float32Array;
  velocity: Float32Array;
  W: number;
  H: number;
  cx: number; // 中文：鼠标格中心 / English: pointer cell center (cell coords, float)
  cy: number;
  vx: number; // 中文：注入的速度分量 / English: velocity to inject
  vy: number;
  radius: number; // 中文：注入半径（cell 单位）/ English: injection radius in cells
  strength: number; // 中文：密度峰值 / English: peak density delta
}

export function splat(args: SplatArgs): void {
  const { density, velocity, W, H, cx, cy, vx, vy, radius, strength } = args;
  const sigma = radius * 0.5;
  const sigmaSq = sigma * sigma;
  const radiusSq = radius * radius;

  const i0 = Math.max(0, Math.floor(cx - radius));
  const i1 = Math.min(W - 1, Math.ceil(cx + radius));
  const j0 = Math.max(0, Math.floor(cy - radius));
  const j1 = Math.min(H - 1, Math.ceil(cy + radius));

  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = i - cx;
      const dy = j - cy;
      const distSq = dx * dx + dy * dy;
      if (distSq > radiusSq) continue;
      const weight = Math.exp(-distSq / sigmaSq);
      const idx = j * W + i;
      density[idx] += strength * weight;
      velocity[idx * 2] += vx * weight;
      velocity[idx * 2 + 1] += vy * weight;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/react-bits/ascii-hero/utils.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/react-bits/ascii-hero/utils.ts src/components/react-bits/ascii-hero/utils.test.ts
git commit -m "feat(ascii-hero): add splat pure function with gaussian injection"
```

---

## Task 3: Pure fn — `advect`

Semi-Lagrangian advection: for each cell, trace back along velocity, bilinear-sample previous density.

**Files:**

- Modify: `src/components/react-bits/ascii-hero/utils.ts`
- Modify: `src/components/react-bits/ascii-hero/utils.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/components/react-bits/ascii-hero/utils.test.ts`:

```ts
import { advect } from "./utils";

describe("advect", () => {
  it("uniform velocity (1, 0) shifts density right by one column with zero-clamp at left edge", () => {
    const W = 4;
    const H = 4;
    const prevDensity = new Float32Array(W * H);
    const density = new Float32Array(W * H);
    const velocity = new Float32Array(W * H * 2);

    // 中文：在 column=1 写入密度 1，速度场设为 (1, 0)
    // English: place density=1 at column 1, set velocity to (1, 0)
    for (let j = 0; j < H; j++) {
      prevDensity[j * W + 1] = 1;
      for (let i = 0; i < W; i++) {
        velocity[(j * W + i) * 2] = 1;
      }
    }

    advect({ density, prevDensity, velocity, W, H, dt: 1 });

    for (let j = 0; j < H; j++) {
      expect(density[j * W + 0]).toBeCloseTo(0, 5);
      expect(density[j * W + 1]).toBeCloseTo(0, 5);
      expect(density[j * W + 2]).toBeCloseTo(1, 5); // shifted right
      expect(density[j * W + 3]).toBeCloseTo(0, 5);
    }
  });

  it("zero velocity preserves density exactly", () => {
    const W = 3;
    const H = 3;
    const prevDensity = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
    const density = new Float32Array(W * H);
    const velocity = new Float32Array(W * H * 2);

    advect({ density, prevDensity, velocity, W, H, dt: 1 });

    for (let i = 0; i < W * H; i++) {
      expect(density[i]).toBeCloseTo(prevDensity[i], 5);
    }
  });

  it("fractional velocity bilinearly blends source samples", () => {
    const W = 3;
    const H = 1;
    const prevDensity = new Float32Array([0, 1, 0]);
    const density = new Float32Array(W * H);
    const velocity = new Float32Array(W * H * 2);
    // 中文：每格 vx = 0.5，cell 1 反推到 x=0.5，应得 (0+1)/2 = 0.5
    // English: vx = 0.5, cell 1 traces back to x=0.5 → bilinear sample 0.5
    for (let i = 0; i < W; i++) velocity[i * 2] = 0.5;

    advect({ density, prevDensity, velocity, W, H, dt: 1 });

    expect(density[1]).toBeCloseTo(0.5, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/react-bits/ascii-hero/utils.test.ts`
Expected: FAIL with `advect is not exported` or similar.

- [ ] **Step 3: Implement `advect`**

Append to `src/components/react-bits/ascii-hero/utils.ts`:

```ts
export interface AdvectArgs {
  density: Float32Array; // 中文：本帧输出 / English: output this frame
  prevDensity: Float32Array; // 中文：上一帧密度（采样源）/ English: source from prev frame
  velocity: Float32Array;
  W: number;
  H: number;
  dt: number;
}

export function advect(args: AdvectArgs): void {
  const { density, prevDensity, velocity, W, H, dt } = args;
  const wMax = W - 1;
  const hMax = H - 1;

  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const idx = j * W + i;
      const vx = velocity[idx * 2];
      const vy = velocity[idx * 2 + 1];
      let x = i - vx * dt;
      let y = j - vy * dt;
      if (x < 0) x = 0;
      else if (x > wMax) x = wMax;
      if (y < 0) y = 0;
      else if (y > hMax) y = hMax;

      const i0 = Math.floor(x);
      const j0 = Math.floor(y);
      const i1 = i0 < wMax ? i0 + 1 : i0;
      const j1 = j0 < hMax ? j0 + 1 : j0;
      const tx = x - i0;
      const ty = y - j0;
      const a = prevDensity[j0 * W + i0];
      const b = prevDensity[j0 * W + i1];
      const c = prevDensity[j1 * W + i0];
      const d = prevDensity[j1 * W + i1];
      density[idx] = (1 - tx) * (1 - ty) * a + tx * (1 - ty) * b + (1 - tx) * ty * c + tx * ty * d;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/react-bits/ascii-hero/utils.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/components/react-bits/ascii-hero/utils.ts src/components/react-bits/ascii-hero/utils.test.ts
git commit -m "feat(ascii-hero): add semi-lagrangian advect with bilinear sampling"
```

---

## Task 4: Pure fn — `dissipate`

In-place exponential decay of an array.

**Files:**

- Modify: `src/components/react-bits/ascii-hero/utils.ts`
- Modify: `src/components/react-bits/ascii-hero/utils.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/components/react-bits/ascii-hero/utils.test.ts`:

```ts
import { dissipate } from "./utils";

describe("dissipate", () => {
  it("multiplies every element by factor", () => {
    const arr = new Float32Array([1, 2, 3, 4]);
    dissipate(arr, 0.5);
    expect(Array.from(arr)).toEqual([0.5, 1, 1.5, 2]);
  });

  it("factor 0.985 reduces total energy by 1.5%", () => {
    const arr = new Float32Array(100).fill(1);
    dissipate(arr, 0.985);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i];
    expect(sum).toBeCloseTo(98.5, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/react-bits/ascii-hero/utils.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `dissipate`**

Append to `src/components/react-bits/ascii-hero/utils.ts`:

```ts
export function dissipate(arr: Float32Array, factor: number): void {
  for (let i = 0; i < arr.length; i++) arr[i] *= factor;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/react-bits/ascii-hero/utils.test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/components/react-bits/ascii-hero/utils.ts src/components/react-bits/ascii-hero/utils.test.ts
git commit -m "feat(ascii-hero): add dissipate decay primitive"
```

---

## Task 5: Pure fn — `compose`

Combine `[-1, 1]` noise sample with current density into a clamped `[0, 1]` luma map.

**Files:**

- Modify: `src/components/react-bits/ascii-hero/utils.ts`
- Modify: `src/components/react-bits/ascii-hero/utils.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/components/react-bits/ascii-hero/utils.test.ts`:

```ts
import { compose } from "./utils";

describe("compose", () => {
  it("with zero density and zero noise, luma is 0.5 everywhere", () => {
    const W = 2;
    const H = 2;
    const luma = new Float32Array(W * H);
    const density = new Float32Array(W * H);
    const noise = () => 0;

    compose({
      luma,
      density,
      noise,
      W,
      H,
      noiseScale: 1,
      noiseSpeed: 1,
      t: 0,
    });

    for (let i = 0; i < luma.length; i++) expect(luma[i]).toBeCloseTo(0.5, 5);
  });

  it("density saturates to 1 even with negative noise", () => {
    const W = 2;
    const H = 2;
    const luma = new Float32Array(W * H);
    const density = new Float32Array(W * H).fill(2);
    const noise = () => -1;

    compose({
      luma,
      density,
      noise,
      W,
      H,
      noiseScale: 1,
      noiseSpeed: 1,
      t: 0,
    });

    for (let i = 0; i < luma.length; i++) expect(luma[i]).toBe(1);
  });

  it("clamps to 0 when noise is -1 and density is 0", () => {
    const W = 1;
    const H = 1;
    const luma = new Float32Array(1);
    const density = new Float32Array(1);
    const noise = () => -1;

    compose({
      luma,
      density,
      noise,
      W,
      H,
      noiseScale: 1,
      noiseSpeed: 1,
      t: 0,
    });

    expect(luma[0]).toBe(0);
  });

  it("passes scaled coordinates to noise", () => {
    const W = 2;
    const H = 2;
    const luma = new Float32Array(W * H);
    const density = new Float32Array(W * H);
    const calls: Array<[number, number, number]> = [];
    const noise = (x: number, y: number, z: number) => {
      calls.push([x, y, z]);
      return 0;
    };

    compose({
      luma,
      density,
      noise,
      W,
      H,
      noiseScale: 0.1,
      noiseSpeed: 0.01,
      t: 100,
    });

    expect(calls[0]).toEqual([0, 0, 1]);
    expect(calls[1]).toEqual([0.1, 0, 1]);
    expect(calls[3]).toEqual([0.1, 0.1, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/react-bits/ascii-hero/utils.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `compose`**

Append to `src/components/react-bits/ascii-hero/utils.ts`:

```ts
export interface ComposeArgs {
  luma: Float32Array;
  density: Float32Array;
  noise: (x: number, y: number, t: number) => number; // 中文：返回 [-1, 1] / English: returns [-1, 1]
  W: number;
  H: number;
  noiseScale: number;
  noiseSpeed: number;
  t: number;
}

export function compose(args: ComposeArgs): void {
  const { luma, density, noise, W, H, noiseScale, noiseSpeed, t } = args;
  const tScaled = t * noiseSpeed;

  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const idx = j * W + i;
      const n = (noise(i * noiseScale, j * noiseScale, tScaled) + 1) * 0.5;
      const v = n + density[idx];
      luma[idx] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/react-bits/ascii-hero/utils.test.ts`
Expected: PASS (12 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/components/react-bits/ascii-hero/utils.ts src/components/react-bits/ascii-hero/utils.test.ts
git commit -m "feat(ascii-hero): add compose noise+density-to-luma primitive"
```

---

## Task 6: Component shell — canvas mount, DPR, resize

Create the React component skeleton: a `<canvas>` that sizes itself to its parent with DPR scaling, no animation yet. This step is non-TDD (DOM/refs); verify visually.

**Files:**

- Create: `src/components/react-bits/ascii-hero/ascii-hero.tsx`
- Create: `src/components/react-bits/ascii-hero/index.ts`

- [ ] **Step 1: Implement the shell**

Create `src/components/react-bits/ascii-hero/ascii-hero.tsx`:

```tsx
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
```

- [ ] **Step 2: Create the barrel re-export**

Create `src/components/react-bits/ascii-hero/index.ts`:

```ts
export { AsciiHero } from "./ascii-hero";
export type { AsciiHeroProps } from "./ascii-hero";
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/react-bits/ascii-hero/ascii-hero.tsx src/components/react-bits/ascii-hero/index.ts
git commit -m "feat(ascii-hero): add component shell with canvas + DPR + resize"
```

---

## Task 7: Static noise render (no splat / no advect)

Wire `simplex-noise` + `compose` + ASCII grid render. Static animated noise only — no pointer interaction yet. This validates the render pipeline.

**Files:**

- Modify: `src/components/react-bits/ascii-hero/ascii-hero.tsx`

- [ ] **Step 1: Replace `ascii-hero.tsx` with render-pipeline version**

Read the file first (it was just written), then replace its contents:

```tsx
// 中文：亮色模式 hero 区的 ASCII 流体 hover 背景，复刻 OpenAI Codex 首屏交互
// English: Light-mode hero ASCII fluid hover background, replicating OpenAI Codex hero interaction.
"use client";

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
      density = new Float32Array(W * H);
      luma = new Float32Array(W * H);
      charBuffer = new Uint8Array(W * H).fill(255);
    };

    const tick = (now: number) => {
      if (now - lastFrame >= frameInterval) {
        lastFrame = now;

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
    rafId = requestAnimationFrame(tick);

    return () => {
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
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/react-bits/ascii-hero/ascii-hero.tsx
git commit -m "feat(ascii-hero): wire simplex-noise + compose + ascii render"
```

---

## Task 8: Mount in `home-shell.tsx` for in-progress visual check

Get the static noise rendering on screen. This catches integration bugs early before adding interactivity.

**Files:**

- Modify: `src/app/_components/home-shell.tsx`

- [ ] **Step 1: Read the current home-shell to find the hero region**

Run: `grep -n "Hero\|<section" src/app/_components/home-shell.tsx`

Identify the JSX block where `<Hero ... />` is rendered. Note its parent — that parent must end up with `position: relative` for the absolute-positioned `AsciiHero` to clip to it.

- [ ] **Step 2: Add `AsciiHero` mount**

In `home-shell.tsx`, add the import at the top of the imports list:

```tsx
import { AsciiHero } from "@/components/react-bits/ascii-hero";
```

Locate the JSX wrapping `<Hero ... />`. Wrap it (or add to its existing wrapper) so the structure is:

```tsx
<div className="relative">
  <AsciiHero />
  <Hero {...heroProps} />
</div>
```

If a wrapping container with `relative` already exists, just add `<AsciiHero />` inside it as the first child. The hero contents stay above (default stacking) while `AsciiHero` is `-z-10`.

- [ ] **Step 3: Run dev server and visually confirm**

Run: `pnpm dev`
Open http://localhost:3000 in light mode. Expected:

- A subtle ASCII character cloud is visible behind the hero text and CTAs
- Characters slowly shift over time
- No pointer interaction yet — that's task 10
- Hero text and buttons remain crisp and clickable
- Toggle to dark mode → ASCII layer disappears (DotGrid still works)
- Toggle back to light → ASCII layer reappears

If anything looks broken (positioning, z-index, theme gate), fix in `ascii-hero.tsx` or `home-shell.tsx` before continuing.

- [ ] **Step 4: Stop dev server, run lint and typecheck**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/home-shell.tsx
git commit -m "feat(home): mount AsciiHero in light-mode hero region"
```

---

## Task 9: Pointer wiring + splat injection

Add pointer tracking and `splat` calls on `pointermove`. Density now responds to mouse, but no advection yet — splats just decay in place after task 10.

**Files:**

- Modify: `src/components/react-bits/ascii-hero/ascii-hero.tsx`

- [ ] **Step 1: Read the current `ascii-hero.tsx`**

Run: `cat src/components/react-bits/ascii-hero/ascii-hero.tsx | head -20`

Confirm imports include `compose` from `./utils`.

- [ ] **Step 2: Update imports and inner state**

Modify `src/components/react-bits/ascii-hero/ascii-hero.tsx`:

Change the import line:

```tsx
import { compose } from "./utils";
```

To:

```tsx
import { compose, dissipate, splat } from "./utils";
```

Inside the `useEffect` body, after `let charBuffer = new Uint8Array(0);` add:

```tsx
let velocity = new Float32Array(0);
let pointer: { cx: number; cy: number; vx: number; vy: number } | null = null;
let lastPointer: { cx: number; cy: number } | null = null;
```

In the `resize` function, after `density = new Float32Array(W * H);` add:

```tsx
velocity = new Float32Array(W * H * 2);
```

After the `resize` and `observer` setup but before `rafId = requestAnimationFrame(tick);`, add:

```tsx
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
const handlePointerLeave = () => {
  lastPointer = null;
};
window.addEventListener("pointermove", handlePointerMove);
window.addEventListener("pointerleave", handlePointerLeave);
```

In the `tick` function, at the very start of the `if (now - lastFrame >= frameInterval) {` block, add:

```tsx
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
dissipate(density, cfg.densityDissipation);
dissipate(velocity, cfg.velocityDissipation);
```

In the cleanup `return () => { ... }`, add before `cancelAnimationFrame(rafId);`:

```tsx
window.removeEventListener("pointermove", handlePointerMove);
window.removeEventListener("pointerleave", handlePointerLeave);
```

- [ ] **Step 3: Verify the file compiles**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Visually verify pointer interaction**

Run: `pnpm dev`
Open http://localhost:3000 in light mode. Expected:

- Moving the mouse across the hero region brightens characters around the cursor
- Stopping the mouse causes the brightened cells to fade out smoothly (dissipation)
- No "trail" yet — bright spot stays at cursor position then fades. That's task 10.

- [ ] **Step 5: Stop dev server, commit**

```bash
git add src/components/react-bits/ascii-hero/ascii-hero.tsx
git commit -m "feat(ascii-hero): wire pointermove splat + dissipation"
```

---

## Task 10: Add advection to complete the fluid loop

With `advect` wired, density follows the velocity field, producing the wake/trail effect characteristic of Codex's hero.

**Files:**

- Modify: `src/components/react-bits/ascii-hero/ascii-hero.tsx`

- [ ] **Step 1: Update imports and add ping-pong buffer**

In `ascii-hero.tsx`, change the import line:

```tsx
import { compose, dissipate, splat } from "./utils";
```

To:

```tsx
import { advect, compose, dissipate, splat } from "./utils";
```

Inside the `useEffect`, alongside `let density = new Float32Array(0);` add:

```tsx
let prevDensity = new Float32Array(0);
```

In the `resize` function, after `density = new Float32Array(W * H);` add:

```tsx
prevDensity = new Float32Array(W * H);
```

- [ ] **Step 2: Insert advect step in the main loop**

In the `tick` function, change the order of operations inside the frame block to:

```tsx
// 1. splat
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
```

This replaces the existing block inside `if (now - lastFrame >= frameInterval) { ... }`.

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Visually verify the fluid trail**

Run: `pnpm dev`
Open http://localhost:3000 in light mode. Expected:

- Moving the cursor produces a visible wake/trail that drifts in the direction of motion
- Sudden swipes create splash-like spreads
- After cursor stops, the trail keeps drifting briefly then fades
- This matches Codex hero behavior

If the trail is too violent → lower `splatStrength` or raise `velocityDissipation` (closer to 1 means slower decay; we want faster, so lower it). If too subtle → opposite.

- [ ] **Step 5: Stop dev server, commit**

```bash
git add src/components/react-bits/ascii-hero/ascii-hero.tsx
git commit -m "feat(ascii-hero): add semi-lagrangian advect for fluid wake"
```

---

## Task 11: Pause when off-screen or tab hidden

Use `IntersectionObserver` and `visibilitychange` to stop rAF when not visible.

**Files:**

- Modify: `src/components/react-bits/ascii-hero/ascii-hero.tsx`

- [ ] **Step 1: Add visibility tracking inside the `useEffect`**

After the `ResizeObserver` setup but before `rafId = requestAnimationFrame(tick);`, add:

```tsx
let inViewport = true;
let tabVisible = !document.hidden;

const start = () => {
  if (!rafId && inViewport && tabVisible) {
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

const intersection = new IntersectionObserver((entries) => {
  inViewport = entries[0]?.isIntersecting ?? true;
  if (inViewport) start();
  else stop();
});
intersection.observe(container);

const onVisibility = () => {
  tabVisible = !document.hidden;
  if (tabVisible) start();
  else stop();
};
document.addEventListener("visibilitychange", onVisibility);
```

- [ ] **Step 2: Replace `rafId = requestAnimationFrame(tick);` startup with `start();`**

So the line that previously read:

```tsx
rafId = requestAnimationFrame(tick);
```

becomes:

```tsx
start();
```

- [ ] **Step 3: Update cleanup**

In the `return () => { ... }` cleanup, replace `cancelAnimationFrame(rafId);` with:

```tsx
stop();
intersection.disconnect();
document.removeEventListener("visibilitychange", onVisibility);
```

- [ ] **Step 4: Verify and visually test**

Run: `pnpm typecheck`
Run: `pnpm dev`

Expected:

- Scroll the page so hero is fully off-screen → no animation cost (verify in DevTools Performance: rAF callbacks stop)
- Switch tabs and come back → animation resumes from a quiescent state (no accumulated time-warp jitter)
- Scroll back to hero → animation resumes

- [ ] **Step 5: Stop dev server, commit**

```bash
git add src/components/react-bits/ascii-hero/ascii-hero.tsx
git commit -m "feat(ascii-hero): pause rAF when off-screen or tab hidden"
```

---

## Task 12: Reduced-motion fallback

When `prefers-reduced-motion: reduce` is set, render a single static frame and skip all animation/pointer wiring.

**Files:**

- Modify: `src/components/react-bits/ascii-hero/ascii-hero.tsx`

- [ ] **Step 1: Add `useReducedMotion` and branch the effect**

At the top of `ascii-hero.tsx`, change imports:

```tsx
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
```

To:

```tsx
import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
```

In the component body, after `const { resolvedTheme } = useTheme();`, add:

```tsx
const prefersReduced = useReducedMotion();
```

Change the dependency array of the main `useEffect` from `[mounted, resolvedTheme, cfg]` to `[mounted, resolvedTheme, cfg, prefersReduced]`.

Inside the effect, just after `if (!ctx) return;`, add an early-exit branch:

```tsx
if (prefersReduced) {
  const noise3D = createNoise3D();
  const resize = () => {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${cfg.cellSize}px ui-monospace, SF Mono, monospace`;
    ctx.textBaseline = "top";
    ctx.fillStyle = cfg.color;

    const W = Math.max(1, Math.ceil(cssW / cfg.cellSize));
    const H = Math.max(1, Math.ceil(cssH / cfg.cellSize));
    const density = new Float32Array(W * H);
    const luma = new Float32Array(W * H);
    compose({
      luma,
      density,
      noise: noise3D,
      W,
      H,
      noiseScale: cfg.noiseScale,
      noiseSpeed: cfg.noiseSpeed,
      t: 0,
    });
    const charsetLen = cfg.charset.length;
    const cellSize = cfg.cellSize;
    ctx.clearRect(0, 0, cssW, cssH);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const idx = j * W + i;
        const v = luma[idx];
        const cidx = Math.min(charsetLen - 1, Math.max(0, Math.floor(v * charsetLen)));
        const ch = cfg.charset[cidx];
        if (ch !== " ") ctx.fillText(ch, i * cellSize, j * cellSize);
      }
    }
  };
  resize();
  const observer = new ResizeObserver(() => resize());
  observer.observe(container);
  return () => observer.disconnect();
}
```

The remainder of the effect (the animated path) runs only when `prefersReduced` is `false`.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: no errors.

Run: `pnpm dev`. In Chrome DevTools, open the Rendering tab → "Emulate CSS media feature prefers-reduced-motion: reduce". Expected:

- A static ASCII frame renders
- Moving the cursor does nothing (no pointer listeners attached)
- No CPU activity for the canvas in the Performance panel after initial render
- Toggle off the emulation → animated mode resumes (component re-mounts via dep change)

- [ ] **Step 3: Stop dev server, commit**

```bash
git add src/components/react-bits/ascii-hero/ascii-hero.tsx
git commit -m "feat(ascii-hero): static fallback under prefers-reduced-motion"
```

---

## Task 13: Final verification — full project verify + visual acceptance

Run the project's standard verification suite and a manual smoke test across the agreed scenarios.

**Files:** none (verification only)

- [ ] **Step 1: Run pure-fn unit tests**

Run: `pnpm test src/components/react-bits/ascii-hero/utils.test.ts`
Expected: 12 tests pass.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: no errors. If Ultracite rewrites anything, accept the rewrite and amend the most recent commit:

```bash
git add -u
git commit --amend --no-edit
```

- [ ] **Step 4: Manual visual acceptance matrix**

Run: `pnpm dev`. Verify each scenario in turn:

| #   | Scenario                                                        | Expected                                                           |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | Light mode, idle                                                | Slowly drifting ASCII cloud behind hero text, cursor not over hero |
| 2   | Light mode, mouse over hero                                     | Visible wake/trail following cursor, fading after stop             |
| 3   | Light mode, fast swipe                                          | Splash-like spread                                                 |
| 4   | Toggle to dark mode                                             | ASCII layer disappears; DotGrid + DarkVeil intact                  |
| 5   | Toggle back to light                                            | ASCII layer reappears                                              |
| 6   | Scroll past hero                                                | rAF stops (verify in DevTools Performance — no callbacks)          |
| 7   | Switch to another tab > 5s, return                              | Animation resumes cleanly                                          |
| 8   | Resize window                                                   | Grid rebuilds at new size after ~200ms; no flicker                 |
| 9   | DevTools → Rendering → Emulate `prefers-reduced-motion: reduce` | Static frame, no animation                                         |
| 10  | Click "开始简历筛选" / "进入工作台" CTA                         | Buttons remain clickable; ASCII layer doesn't intercept            |

Document any failed scenarios as follow-up work; do not block the commit if items 1–5 and 10 pass and the rest are minor.

- [ ] **Step 5: Performance spot-check**

Open Chrome DevTools → Performance, record 3 seconds while moving the cursor over the hero. Expected:

- Frame rate ≥ 50fps on the recording machine (M1 / mid-tier Windows laptop)
- No long tasks (>50ms) attributable to the canvas pipeline
- If frames drop: bump `cellSize` to 20 or `fps` to 30 in `DEFAULTS` and re-record

- [ ] **Step 6: Final commit (only if step 5 required tuning)**

If you tuned defaults:

```bash
git add src/components/react-bits/ascii-hero/ascii-hero.tsx
git commit -m "perf(ascii-hero): tune defaults for sustained 60fps"
```

If no tuning was needed, this task produces no commit.

---

## Done

The feature is complete when:

- All 12 utils tests pass
- Typecheck and lint are clean
- The 10-row visual acceptance matrix passes
- Performance spot-check shows ≥ 50fps with cursor active
