// 中文：compose 纯函数单元测试
// English: pure-function unit tests for compose
import { describe, expect, it } from "vitest";
import { compose } from "./utils";

describe("compose", () => {
  it("zero noise → luma is 0 everywhere (idle = empty)", () => {
    const W = 2;
    const H = 2;
    const luma = new Float32Array(W * H);
    const noise = () => 0;

    compose({ luma, noise, W, H, noiseScale: 1, noiseSpeed: 1, t: 0 });

    for (let i = 0; i < luma.length; i++) expect(luma[i]).toBe(0);
  });

  it("negative noise clamped to 0", () => {
    const W = 1;
    const H = 1;
    const luma = new Float32Array(1);
    const noise = () => -1;

    compose({ luma, noise, W, H, noiseScale: 1, noiseSpeed: 1, t: 0 });

    expect(luma[0]).toBe(0);
  });

  it("passes scaled coordinates to noise", () => {
    const W = 2;
    const H = 2;
    const luma = new Float32Array(W * H);
    const calls: Array<[number, number, number]> = [];
    const noise = (x: number, y: number, z: number) => {
      calls.push([x, y, z]);
      return 0;
    };

    compose({ luma, noise, W, H, noiseScale: 0.1, noiseSpeed: 0.01, t: 100 });

    expect(calls[0]).toEqual([0, 0, 1]);
    expect(calls[1]).toEqual([0.1, 0, 1]);
    expect(calls[3]).toEqual([0.1, 0.1, 1]);
  });

  it("noise peaks amplified by 4th-power curve, valleys clamped to 0", () => {
    const W = 1;
    const H = 1;
    const luma = new Float32Array(1);

    // 中文：noise 返回 0.5 → sparse = 0.5^4 = 0.0625
    // English: noise returning 0.5 → sparse = 0.5^4 = 0.0625 (very dim, sparse-dot regime)
    compose({ luma, noise: () => 0.5, W, H, noiseScale: 1, noiseSpeed: 1, t: 0 });
    expect(luma[0]).toBeCloseTo(0.0625, 5);

    // 中文：noise 返回 -0.9 → sparse = 0（负半被裁掉）
    // English: noise returning -0.9 → sparse = 0 (negative half clamped)
    compose({ luma, noise: () => -0.9, W, H, noiseScale: 1, noiseSpeed: 1, t: 0 });
    expect(luma[0]).toBe(0);

    // 中文：noise 返回 1.0 → sparse = 1.0（峰值满亮度）
    // English: noise returning 1.0 → sparse = 1.0 (peak full brightness)
    compose({ luma, noise: () => 1.0, W, H, noiseScale: 1, noiseSpeed: 1, t: 0 });
    expect(luma[0]).toBe(1);
  });
});
