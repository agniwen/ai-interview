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
  const detach = attachPdfPinchZoom(viewport, {
    getZoom: () => zoom,
    maxZoom: 2.5,
    minZoom: 0.25,
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
  expect(onZoom).toHaveBeenCalledWith(1.5, 75, 20);

  viewport.dispatchEvent(touchEvent("touchend", []));
  detach();
  expect(viewport.style.touchAction).toBe("auto");
  viewport.dispatchEvent(
    touchEvent("touchmove", [
      [0, 20],
      [200, 20],
    ]),
  );
  expect(onZoom).toHaveBeenCalledTimes(1);
});
