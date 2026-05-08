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

export function dissipate(arr: Float32Array, factor: number): void {
  for (let i = 0; i < arr.length; i++) arr[i] *= factor;
}

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
