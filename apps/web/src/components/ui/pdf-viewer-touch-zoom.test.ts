// @vitest-environment jsdom

import { expect, it, vi } from "vitest";
import { attachPdfPinchZoom } from "./pdf-viewer-touch-zoom";

function touchEvent(type: string, points: [number, number][]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: points.map(([clientX, clientY]) => ({ clientX, clientY })),
  });
  return event;
}

it("zooms the PDF on a two-finger gesture without allowing page zoom", () => {
  const viewport = document.createElement("div");
  viewport.style.touchAction = "auto";
  let zoom = 1;
  const onZoom = vi.fn((nextZoom: number) => {
    zoom = nextZoom;
  });
  const onPreview = vi.fn();
  const onPreviewEnd = vi.fn();
  const detach = attachPdfPinchZoom(viewport, {
    getZoom: () => zoom,
    maxZoom: 2.5,
    minZoom: 0.25,
    onPreview,
    onPreviewEnd,
    onZoom,
  });

  expect(viewport.style.touchAction).toBe("pan-x pan-y");
  const oneFinger = touchEvent("touchstart", [[10, 20]]);
  viewport.dispatchEvent(oneFinger);
  expect(oneFinger.defaultPrevented).toBe(false);

  const start = touchEvent("touchstart", [
    [10, 20],
    [110, 20],
  ]);
  viewport.dispatchEvent(start);
  expect(start.defaultPrevented).toBe(true);
  const move = touchEvent("touchmove", [
    [0, 20],
    [150, 20],
  ]);
  viewport.dispatchEvent(move);
  expect(move.defaultPrevented).toBe(true);
  expect(onPreview).toHaveBeenCalledWith(1.5, 75, 20);
  expect(onZoom).not.toHaveBeenCalled();

  viewport.dispatchEvent(
    touchEvent("touchmove", [
      [0, 20],
      [180, 20],
    ]),
  );
  expect(onPreview).toHaveBeenLastCalledWith(1.8, 90, 20);

  viewport.dispatchEvent(touchEvent("touchend", []));
  expect(onPreviewEnd).toHaveBeenCalledTimes(1);
  expect(onZoom).toHaveBeenLastCalledWith(1.8, 90, 20);

  viewport.dispatchEvent(
    touchEvent("touchstart", [
      [10, 20],
      [110, 20],
    ]),
  );
  viewport.dispatchEvent(
    touchEvent("touchmove", [
      [25, 20],
      [95, 20],
    ]),
  );
  viewport.dispatchEvent(touchEvent("touchend", []));
  expect(onZoom).toHaveBeenLastCalledWith(1.26, 60, 20);
  expect(onZoom).toHaveBeenCalledTimes(2);

  viewport.dispatchEvent(
    touchEvent("touchstart", [
      [10, 20],
      [110, 20],
    ]),
  );
  viewport.dispatchEvent(
    touchEvent("touchmove", [
      [0, 20],
      [110, 20],
    ]),
  );
  viewport.dispatchEvent(
    touchEvent("touchcancel", [
      [0, 20],
      [110, 20],
    ]),
  );
  expect(onZoom).toHaveBeenCalledTimes(3);
  viewport.dispatchEvent(
    touchEvent("touchstart", [
      [10, 20],
      [110, 20],
    ]),
  );
  viewport.dispatchEvent(
    touchEvent("touchmove", [
      [0, 20],
      [120, 20],
    ]),
  );
  viewport.dispatchEvent(touchEvent("touchend", []));
  expect(onZoom).toHaveBeenCalledTimes(4);

  detach();
  expect(viewport.style.touchAction).toBe("auto");
  viewport.dispatchEvent(
    touchEvent("touchmove", [
      [0, 20],
      [200, 20],
    ]),
  );
  expect(onZoom).toHaveBeenCalledTimes(4);
});
