import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showMeetingDeletionError, showMeetingDeletionSuccess } from "./meeting-deletion-toast";

beforeEach(() => {
  /* oxlint-disable promise/prefer-await-to-callbacks -- Mirror the browser requestAnimationFrame callback API for Sonner cleanup. */
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  /* oxlint-enable promise/prefer-await-to-callbacks */
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("meeting deletion toast", () => {
  it.each([
    ["success", showMeetingDeletionSuccess, "success"],
    ["error", showMeetingDeletionError, "error"],
  ] as const)("dismisses existing toasts before showing a %s notification", (_, show, method) => {
    const dismissSpy = vi.spyOn(toast, "dismiss");
    const notifySpy = vi.spyOn(toast, method);

    const toastId = show("删除反馈");

    expect(dismissSpy).toHaveBeenCalledWith();
    expect(dismissSpy.mock.invocationCallOrder[0]).toBeLessThan(
      notifySpy.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    toast.dismiss(toastId);
  });
});
