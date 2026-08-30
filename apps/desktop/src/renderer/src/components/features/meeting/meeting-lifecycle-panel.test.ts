import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { showMeetingArchivedToast } from "./meeting-archive-toast";
import { canManageMeetingLifecycle } from "./meeting-lifecycle-panel";

afterEach(() => vi.unstubAllGlobals());

describe("Meeting lifecycle panel", () => {
  it("uses the compact sidebar archive toast and restores from its action", () => {
    /* oxlint-disable promise/prefer-await-to-callbacks -- Mirror the browser requestAnimationFrame callback API for Sonner cleanup. */
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    /* oxlint-enable promise/prefer-await-to-callbacks */
    const onRestore = vi.fn();
    const toastId = showMeetingArchivedToast(onRestore);
    const notification = toast.getHistory().find((item) => item.id === toastId);
    if (!notification || !("action" in notification)) {
      throw new Error("Expected an archive toast with a restore action");
    }
    expect(notification.title).toBe("已归档");
    expect(notification.style).toEqual({ paddingBlock: "8px" });
    const { action } = notification;
    if (!isValidElement<{ onClick: () => void }>(action)) {
      throw new Error("Expected a restore button");
    }
    const html = renderToStaticMarkup(action);
    expect(html).toContain("ml-auto");
    expect(html).toContain("撤回");
    action.props.onClick();
    expect(onRestore).toHaveBeenCalledWith(toastId);
    toast.dismiss(toastId);
  });

  it("allows only the Meeting Owner and Workspace administrator to lifecycle-delete", () => {
    expect(canManageMeetingLifecycle("owner")).toBe(true);
    expect(canManageMeetingLifecycle("administrator")).toBe(true);
    expect(canManageMeetingLifecycle("editor")).toBe(false);
    expect(canManageMeetingLifecycle("viewer")).toBe(false);
  });
});
