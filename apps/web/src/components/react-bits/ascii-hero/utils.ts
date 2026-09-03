// 中文：ASCII Hero 字符场的纯函数（无 DOM/Canvas 依赖，便于单测）
// English: Pure-function primitives for the AsciiHero character field (DOM/Canvas-free, unit-testable).

export interface ComposeArgs {
  luma: Float32Array;
  noise: (x: number, y: number, t: number) => number; // 中文：返回 [-1, 1] / English: returns [-1, 1]
  W: number;
  H: number;
  noiseScale: number;
  noiseSpeed: number;
  t: number;
}

export function compose(args: ComposeArgs): void {
  const { luma, noise, W, H, noiseScale, noiseSpeed, t } = args;
  const tScaled = t * noiseSpeed;

  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const idx = j * W + i;
      // 中文：noise 正半部分应用 4 次幂曲线，让大多数 cell 留空，只有峰值处出现零星点
      // English: apply a 4th-power curve to the positive half of noise so most cells stay
      // empty and only peaks render — sparse dots.
      const n = noise(i * noiseScale, j * noiseScale, tScaled);
      luma[idx] = n > 0 ? n * n * n * n : 0;
    }
  }
}
