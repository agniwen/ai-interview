// 中文：splat / advect / dissipate / compose 纯函数单元测试
// English: pure-function unit tests for splat / advect / dissipate / compose
import { describe, expect, it } from "vitest";
import { advect, dissipate, splat } from "./utils";

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
