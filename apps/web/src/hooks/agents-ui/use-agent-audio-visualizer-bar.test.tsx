// @vitest-environment jsdom

import type { AgentState } from "@livekit/components-react";
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAgentAudioVisualizerBarAnimator } from "./use-agent-audio-visualizer-bar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.restoreAllMocks());

describe("agent bar animation", () => {
  it("commits the first frame immediately and never commits an old frame when state or columns change", () => {
    let tick: FrameRequestCallback | undefined;
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      tick = callback;
      return 1;
    });
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const commits: number[][] = [];
    function Probe({ state, columns }: { state: AgentState; columns: number }) {
      const frame = useAgentAudioVisualizerBarAnimator(state, columns, 100);
      useLayoutEffect(() => {
        commits.push(frame);
      });
      return <output>{frame.join(",")}</output>;
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      act(() => root.render(<Probe state="connecting" columns={5} />));
      expect(commits).toEqual([[0, 4]]);
      act(() => {
        now = 100;
        tick?.(now);
      });
      expect(container.textContent).toBe("1,3");
      commits.length = 0;
      act(() => root.render(<Probe state="listening" columns={5} />));
      expect(commits).toEqual([[2]]);
      act(() => {
        now = 200;
        tick?.(now);
      });
      expect(container.textContent).toBe("-1");
      commits.length = 0;
      act(() => root.render(<Probe state="listening" columns={7} />));
      expect(commits).toEqual([[3]]);
      commits.length = 0;
      act(() => root.render(<Probe state="speaking" columns={3} />));
      expect(commits).toEqual([[0, 1, 2]]);
    } finally {
      act(() => root.unmount());
    }
    expect(cancel).toHaveBeenCalled();
  });
});
