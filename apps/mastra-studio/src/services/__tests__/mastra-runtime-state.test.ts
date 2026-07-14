import { describe, expect, it } from "vitest";

import { getCanSendWhileStreaming } from "../mastra-runtime-state";

describe("getCanSendWhileStreaming", () => {
  it("allows server-side queued sends while a subscription thread is active", () => {
    expect(
      getCanSendWhileStreaming({
        isSupportedModel: true,
        threadId: "thread-1",
        threadSignalsEnabled: true,
        threadSignalsUnsupported: false,
      }),
    ).toBe(true);
  });

  it.each([
    {
      isSupportedModel: false,
      threadId: "thread-1",
      threadSignalsEnabled: true,
      threadSignalsUnsupported: false,
    },
    {
      isSupportedModel: true,
      threadId: "thread-1",
      threadSignalsEnabled: false,
      threadSignalsUnsupported: false,
    },
    {
      isSupportedModel: true,
      threadId: undefined,
      threadSignalsEnabled: true,
      threadSignalsUnsupported: false,
    },
    {
      isSupportedModel: true,
      threadId: "thread-1",
      threadSignalsEnabled: true,
      threadSignalsUnsupported: true,
    },
  ])("blocks sends when subscription send support is unavailable: %o", (options) => {
    expect(getCanSendWhileStreaming(options)).toBe(false);
  });
});
