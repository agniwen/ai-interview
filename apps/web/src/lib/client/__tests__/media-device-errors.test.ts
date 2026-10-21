import { describe, expect, it } from "vitest";
import { isMediaDeviceError, isUnhandledRejectionEvent } from "../media-device-errors";

const unhandledRejection = {
  exception: {
    values: [
      { mechanism: { handled: false, type: "auto.browser.global_handlers.onunhandledrejection" } },
    ],
  },
};

describe("media device errors", () => {
  it.each([
    ["NotFoundError", "Requested device not found"],
    ["NotReadableError", "Could not start audio source"],
    ["NotReadableError", "Device in use"],
  ])("recognizes capture failure %s: %s", (name, message) => {
    expect(isMediaDeviceError(new DOMException(message, name))).toBe(true);
  });

  it("ignores DOM NotFoundError unrelated to capture devices", () => {
    const error = new DOMException(
      "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
      "NotFoundError",
    );
    expect(isMediaDeviceError(error)).toBe(false);
  });

  it("recognizes events captured from unhandled rejections", () => {
    expect(isUnhandledRejectionEvent(unhandledRejection)).toBe(true);
    expect(
      isUnhandledRejectionEvent({
        exception: { values: [{ mechanism: { handled: true, type: "generic" } }] },
      }),
    ).toBe(false);
  });
});
