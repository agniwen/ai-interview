// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  APP_WATERMARK_HOST_ATTR,
  getWatermarkText,
  startAppWatermark,
} from "../app-watermark-lifecycle";

afterEach(() => {
  for (const node of document.querySelectorAll(`[${APP_WATERMARK_HOST_ATTR}]`)) {
    node.remove();
  }
});

function deferred() {
  let settle!: () => void;
  // oxlint-disable-next-line promise/avoid-new -- Test fixture needs a controllable pending promise.
  const promise = new Promise<undefined>((resolve) => {
    settle = () => {
      resolve();
    };
  });
  return { promise, resolve: settle };
}

describe("app watermark lifecycle", () => {
  it("uses a stable text key so identical content does not look like a change", () => {
    const first = getWatermarkText(["王小明", "ID: 1234****cdef"]);
    const second = getWatermarkText(["王小明", "ID: 1234****cdef"]);

    expect(first).toBe(second);
    expect(first).toBe("王小明\nID: 1234****cdef");
  });

  it("mounts the watermark on a dedicated host and tears host plus instance down", async () => {
    const created: unknown[] = [];
    let destroyed = 0;

    const stop = startAppWatermark({
      createWatermark: () => {
        const instance = {
          create() {
            created.push(instance);
            return Promise.resolve();
          },
          destroy() {
            destroyed += 1;
          },
        };
        return instance;
      },
      text: "王小明\nID: 1234****cdef",
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelectorAll(`[${APP_WATERMARK_HOST_ATTR}]`)).toHaveLength(1);
    expect(created).toHaveLength(1);

    stop();

    expect(destroyed).toBe(1);
    expect(document.querySelectorAll(`[${APP_WATERMARK_HOST_ATTR}]`)).toHaveLength(0);
  });

  it("destroys a watermark whose create() finishes after stop()", async () => {
    const pendingCreate = deferred();
    let destroyed = 0;

    const stop = startAppWatermark({
      createWatermark: () => ({
        create() {
          return pendingCreate.promise;
        },
        destroy() {
          destroyed += 1;
        },
      }),
      text: "用户\nID: u1234567",
    });

    stop();
    pendingCreate.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(destroyed).toBeGreaterThanOrEqual(1);
    expect(document.querySelectorAll(`[${APP_WATERMARK_HOST_ATTR}]`)).toHaveLength(0);
  });
});
