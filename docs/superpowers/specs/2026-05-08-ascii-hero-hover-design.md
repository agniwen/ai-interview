# 首页 Hero ASCII 流体 hover 背景

**日期**: 2026-05-08
**作者**: @sakurawen + Claude
**状态**: Draft

## 背景

亮色模式首页 hero 当前背景是 `Grainient`（GLSL 噪声渐变 shader），不响应鼠标。OpenAI Codex 官网首屏背景是一个鼠标可交互的 Canvas 2D ASCII 字符场——鼠标移动时往一个 2D 流体场注入扰动，字符密度随鼠标轨迹拖尾、扩散、衰减。希望在亮色模式 hero 区复刻这个交互。

Codex bundle 里的关键术语（`charset`、`luma`、`mask`、`densityDissipation`、`velocityDissipation`、`splash`、`pointermove`、`requestAnimationFrame`）表明它是一个简化版 fluid simulation：底图按亮度采样成字符密度，鼠标 splat 注入速度+密度，advect+dissipate 演化，逐帧重绘。本设计采用同一思路，底图改为纯过程化 simplex 噪声以避免引入资源。

## 目标

1. 亮色模式 hero 区出现 ASCII 字符流体背景，鼠标移动留下可见拖尾，离开后柔和衰减消失
2. 与现有 `Grainient` 全局背景共存（不替换）
3. 暗色模式不受影响（继续 `DotGrid`）
4. 满足 `prefers-reduced-motion`、tab 不可见、滚出视口等场景的性能/能耗约束
5. 不引入 WebGL，纯 Canvas 2D，bundle 增量 ≤ 5KB（不含 simplex-noise 依赖 ~3KB）

## 非目标

- 暗色模式集成（保持 DotGrid 现状）
- 全局背景替换（仅 hero 区，不进 `BackgroundLayers`）
- 移动端长按/手势交互（仅 pointermove，触控走系统默认）
- 像素级 1:1 还原 Codex 视觉（charset/颜色/参数允许差异）

## 架构总览

```
src/components/react-bits/ascii-hero.tsx        ← 新组件（自包含）
src/app/_components/home-shell.tsx              ← 改：在 hero 区父级挂载
```

层叠结构（亮色模式 hero 区）：

```
z-0   hero 文字 / CTA（<section>）
─────────────────────────────────
-z-10 AsciiHero canvas        ← 新增
─────────────────────────────────
-z-20 Grainient（全局 fixed 背景层）
```

`AsciiHero` 是 `absolute inset-x-0 top-0 h-[hero高度] pointer-events-none`，挂在 hero `<section>` 同级父级里；hero `<section>` 设 `relative` 让 z-index 生效。

主题/动画偏好门控（沿用 `BackgroundLayers` 模式）：

```
useTheme() + mounted gate → resolvedTheme === "light" 才挂载
useReducedMotion() → 渲染单帧静态噪声 ASCII，不绑 pointermove
```

## 组件接口

```tsx
interface AsciiHeroProps {
  cellSize?: number; // 默认 16（CSS px，单格边长）
  charset?: string; // 默认 " ·∙-+*▒▓"（8 级密度）
  color?: string; // 默认 "oklch(0.55 0.03 240 / 0.35)"
  noiseScale?: number; // 默认 0.05（simplex 空间频率）
  noiseSpeed?: number; // 默认 0.0003（simplex 时间频率）
  splatRadius?: number; // 默认 6（cell 单位，高斯注入半径）
  splatStrength?: number; // 默认 1.0（splat 峰值密度增量）
  densityDissipation?: number; // 默认 0.985（每帧密度衰减系数）
  velocityDissipation?: number; // 默认 0.92（每帧速度衰减系数）
  fps?: number; // 默认 60（rAF 节流目标帧率）
}
```

`home-shell.tsx` 默认调用 `<AsciiHero />`，全部用默认值。

## 内部数据结构

每次 resize 重建（W = ⌈cssWidth / cellSize⌉，H = ⌈cssHeight / cellSize⌉）：

```ts
velocity: Float32Array(W * H * 2); // [vx, vy] 交错存储
density: Float32Array(W * H);
prevDensity: Float32Array(W * H); // advect 用 ping-pong
charBuffer: Uint8Array(W * H); // 上一帧字符索引，用于 dirty rect
pointerQueue: Array<{ x: number; y: number; dx: number; dy: number }>;
```

`charBuffer` 记录上一帧字符索引，仅在新索引不同时调用 `fillText`，减少绘制开销。

## 主循环

每帧（rAF + fps 节流）：

```
1. splat:   消费 pointerQueue → 给鼠标格周围 splatRadius 内的 cell
            按高斯权重注入 velocity（来自 dx/dy）+ density（来自 splatStrength）

2. advect:  对每个 cell (i, j)，反向追踪源点 (i - vx*dt, j - vy*dt)，
            从 prevDensity 双线性采样写入 density

3. dissip:  density   *= densityDissipation
            velocity  *= velocityDissipation

4. compose: luma[i] = clamp(
              (simplex3D(i*noiseScale, j*noiseScale, t*noiseSpeed) + 1) * 0.5
              + density[i],
              0, 1
            )

5. render:  for each cell:
              const idx = floor(luma * (charset.length - 1))
              if (idx !== charBuffer[i]):
                ctx.clearRect(cell)
                ctx.fillText(charset[idx], i*cellSize, j*cellSize)
                charBuffer[i] = idx

6. swap:    [density, prevDensity] = [prevDensity, density]
```

## 关键实现细节

### Simplex 噪声

引 `simplex-noise` v4（~3KB gzip）。无需 seed 持久化。

### DPR 处理

```ts
canvas.width = cssWidth * dpr;
canvas.height = cssHeight * dpr;
canvas.style.width = cssWidth + "px";
canvas.style.height = cssHeight + "px";
ctx.scale(dpr, dpr);
ctx.font = `${cellSize}px ui-monospace, SF Mono, monospace`;
ctx.textBaseline = "top";
ctx.fillStyle = color;
```

### Pointer 节流

```ts
let pendingPointer: PointerEvent | null = null;
canvas.addEventListener("pointermove", (e) => {
  pendingPointer = e;
});
// 在 rAF 主循环开头消费 pendingPointer，最多每帧一次 splat
```

避免高刷新率鼠标（500–8000Hz）注入过密导致积累爆炸。

### 暂停策略

| 信号                             | 行为                         |
| -------------------------------- | ---------------------------- |
| `IntersectionObserver` 离开视口  | `cancelAnimationFrame`       |
| `document.visibilitychange` 隐藏 | `cancelAnimationFrame`       |
| 重新可见且仍在视口               | 重新 `requestAnimationFrame` |

### Resize

`ResizeObserver` 监听父级宽高，200ms debounce 后重建所有缓冲区，重设 canvas 尺寸。

### Reduced Motion 退化

`useReducedMotion() === true`：

- 不绑 pointermove
- 主循环只跑一次（compose + render，density 全 0），输出静态噪声 ASCII
- 不启 rAF 循环

## 边界 & 退化总表

| 场景                     | 行为                                           |
| ------------------------ | ---------------------------------------------- |
| `prefers-reduced-motion` | 单帧静态噪声 ASCII，不绑 pointer               |
| 暗色主题                 | 不挂载（继续 DotGrid）                         |
| 主题切换 light↔dark      | next-themes 触发 re-render，组件 mount/unmount |
| Hero 滚出视口            | rAF 暂停                                       |
| Tab 隐藏                 | rAF 暂停                                       |
| 窗口 resize              | 200ms debounce 重建缓冲                        |
| Canvas 2D 不可用         | 不挂载（极端浏览器，兜底为 Grainient 单层）    |
| pointer 抬起到 canvas 外 | 自然停 splat，density 自衰减归零               |

## 性能预算

- 典型桌面 hero 区 1440×500，cellSize=16 → grid 90×31 ≈ 2800 cell
- 每帧成本：splat O(splatRadius²) ≈ 144 + advect O(W×H) ≈ 2800 + render O(dirty) 平均 ≪ 2800
- 预期 60fps 在 M1 Air 不掉帧；中端 Windows 笔记本 ≥ 50fps
- 若实测掉帧：第一档降 fps→30；第二档增 cellSize→20（grid 减半）

## 测试

动画效果不可断言，只测纯函数与挂载契约：

1. **纯函数单测**（`ascii-hero.utils.test.ts`）：
   - `splat()`：W=4, H=4 网格，鼠标 (2, 2)，半径 1，验证邻域 density/velocity 增量符合高斯
   - `advect()`：固定速度场 (1, 0)，验证 density 整体右移一格（边界归零）
   - `dissipate()`：验证 `density *= 0.985` 后总能量缩减 1.5%
   - `compose()`：density=0 时 luma 仅由 noise 决定；density 满时 luma 为 1
2. **挂载快照**（RTL）：
   - 亮色主题挂载，断言渲染了 `<canvas aria-hidden="true">`
   - 暗色主题挂载，断言无 canvas
   - reduced-motion 挂载，断言不绑 pointermove
3. **视觉验收**：`pnpm dev` 起来手动确认拖尾、衰减、滚动暂停、reduced-motion 静态、主题切换

## 已知风险

1. **simplex-noise 包**：v4 是 ESM-only，需确认 Next.js 16 / Turbopack 兼容。如不兼容，回退到自实现 value-noise（增 30 行）。
2. **字体回退**：`ui-monospace` 在非 Apple 系统回退到 `SF Mono` → `monospace`，不同字体宽高比差异会让网格视觉略不齐。可接受，因为字符是装饰，不要求严格对齐。
3. **iOS Safari pointermove**：触控设备上 pointermove 行为不同，splat 注入可能稀疏。本设计不专门优化触控；接受触控端动效弱化。
4. **主题切换瞬间闪烁**：next-themes mounted gate 已规避，与现有 `BackgroundLayers` 一致。

## 实现顺序（建议）

1. 写纯函数 `splat / advect / dissipate / compose` + 单测
2. 搭壳：组件骨架 + canvas mount + DPR + resize
3. 接主循环 + pointer 节流 + 静态噪声渲染（先不接 splat）
4. 接 splat → 完整流体回路
5. 接暂停（IntersectionObserver + visibilitychange）+ reduced-motion
6. 集成到 `home-shell.tsx`，亮色模式人眼验收
7. 性能 profile（M1 + Windows 中端），必要时调 cellSize / fps
