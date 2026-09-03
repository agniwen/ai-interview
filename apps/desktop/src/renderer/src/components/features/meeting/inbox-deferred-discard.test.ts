import { describe, expect, it, vi } from "vitest";
import { createDeferredInboxDiscard } from "./inbox-deferred-discard";

describe("deferred Inbox recording discard", () => {
  it("does not delete before the toast disappears and commits once afterward", async () => {
    vi.useFakeTimers();
    const commit = vi.fn(() => Promise.resolve());
    const discard = createDeferredInboxDiscard({ commit });

    discard.afterToastDismissed();
    discard.afterToastDismissed();
    expect(commit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(commit).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("keeps the recording when the user undoes before the toast disappears", async () => {
    vi.useFakeTimers();
    const commit = vi.fn(() => Promise.resolve());
    const discard = createDeferredInboxDiscard({ commit });

    discard.undo();
    discard.afterToastDismissed();
    await vi.runAllTimersAsync();

    expect(commit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
