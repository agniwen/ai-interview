// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ConnectionState } from "livekit-client";
import { expect, it, vi } from "vitest";
import { useConfirmInterviewConnection } from "../use-confirm-interview-connection";

// SAFETY: React test environment flag for act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function Probe({ state }: { state: ConnectionState }) {
  useConfirmInterviewConnection(state, "interview", "round");
  return null;
}
it("cancels pending retries on disconnect and confirms the next connection once", async () => {
  vi.useFakeTimers();
  const post = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(new Response(null, { status: 409 })),
  );
  vi.stubGlobal("fetch", post);
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(() => root.render(<Probe state={ConnectionState.Connected} />));
    expect(post).toHaveBeenCalledTimes(1);
    const signal = post.mock.calls[0]?.[1]?.signal;
    await act(() => root.render(<Probe state={ConnectionState.Disconnected} />));
    expect(signal?.aborted).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(post).toHaveBeenCalledTimes(1);
    post.mockResolvedValue(Response.json({ success: true }));
    await act(() => root.render(<Probe state={ConnectionState.Connected} />));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(post).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
