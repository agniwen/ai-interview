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
