import { afterEach, describe, expect, it, vi } from "vitest";
import { playbackDelay, runDemoPlayback } from "./demo-playback";
import type { DemoPlaybackPort } from "./demo-playback";

afterEach(() => vi.useRealTimers());

function createPort() {
  return {
    click: vi.fn(),
    move: vi.fn(() => Promise.resolve(true)),
    ready: vi.fn(() => Promise.resolve(true)),
    reset: vi.fn(),
  } satisfies DemoPlaybackPort;
}

describe("demo playback", () => {
  it("moves before activating a target and cancels immediately when a user takes over", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const port = createPort();
    const playback = runDemoPlayback(
      port,
      [{ caption: "查看候选人", target: "candidate" }],
      controller.signal,
    );
    await vi.advanceTimersByTimeAsync(1800);
    expect(port.move).toHaveBeenCalledWith("candidate", "查看候选人");
    expect(port.click).not.toHaveBeenCalled();
    controller.abort();
    await playback;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(port.click).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits for visibility and never activates a missing target", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const port = createPort();
    const visible = Promise.withResolvers<boolean>();
    port.ready.mockImplementationOnce(() => visible.promise);
    port.move.mockResolvedValue(false);
    const playback = runDemoPlayback(
      port,
      [{ caption: "详情", target: "missing" }],
      controller.signal,
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(port.reset).not.toHaveBeenCalled();
    visible.resolve(true);
    await vi.advanceTimersByTimeAsync(1800);
    await playback;
    expect(port.click).not.toHaveBeenCalled();
  });

  it("activates each target once and cleans up the loop delay", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const port = createPort();
    const playback = runDemoPlayback(
      port,
      [{ caption: "阶段", hold: 100, target: "stage" }],
      controller.signal,
    );
    await vi.advanceTimersByTimeAsync(2140);
    expect(port.click).toHaveBeenCalledExactlyOnceWith("stage");
    controller.abort();
    await playback;
    expect(vi.getTimerCount()).toBe(0);
    expect(await playbackDelay(100, controller.signal)).toBe(false);
  });

  it("reveals the clicked region within the step hold before moving on", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const reveal = vi.fn((_selector: string, _budget: number) => Promise.resolve(true));
    const port = { ...createPort(), reveal } satisfies DemoPlaybackPort;
    const playback = runDemoPlayback(
      port,
      [
        { caption: "评价", hold: 3000, reveal: "panel", target: "tab" },
        { caption: "下一步", target: "next" },
      ],
      controller.signal,
    );
    await vi.advanceTimersByTimeAsync(1800 + 240);
    expect(port.click).toHaveBeenCalledExactlyOnceWith("tab");
    expect(reveal).toHaveBeenCalledExactlyOnceWith("panel", 2300);
    await vi.advanceTimersByTimeAsync(2999);
    expect(port.move).not.toHaveBeenCalledWith("next", "下一步");
    await vi.advanceTimersByTimeAsync(1);
    expect(port.move).toHaveBeenCalledWith("next", "下一步");
    controller.abort();
    await playback;
  });
});
