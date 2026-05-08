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
