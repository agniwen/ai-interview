import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserPcmSidecar } from "./browser-pcm-sidecar";

describe("browser PCM sidecar", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("closes the AudioContext when worklet initialization fails", async () => {
    const close = vi.fn<() => Promise<void>>().mockResolvedValue();
    vi.stubGlobal(
      "AudioContext",
      class {
        readonly audioWorklet = {
          addModule: vi.fn().mockRejectedValue(new Error("worklet unavailable")),
        };
        readonly close = close;
      },
    );

    await expect(
      createBrowserPcmSidecar({
        mediaTrack: {} as MediaStreamTrack,
        onFrame: vi.fn(),
      }),
    ).rejects.toThrow("worklet unavailable");
    expect(close).toHaveBeenCalledOnce();
  });
});
