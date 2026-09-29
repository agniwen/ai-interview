type PinchZoomOptions = {
  getZoom: () => number;
  maxZoom: number;
  minZoom: number;
  onZoom: (zoom: number, clientX: number, clientY: number) => void;
};

export function attachPdfPinchZoom(viewport: HTMLElement, options: PinchZoomOptions) {
  let pinch: { distance: number; zoom: number } | null = null;
  const previousTouchAction = viewport.style.touchAction;
  viewport.style.touchAction = "pan-x pan-y";

  const getDistance = (touches: TouchList) =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  const startPinch = (event: TouchEvent) => {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    pinch = { distance: getDistance(event.touches), zoom: options.getZoom() };
  };
  const movePinch = (event: TouchEvent) => {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    if (!pinch) {
      pinch = { distance: getDistance(event.touches), zoom: options.getZoom() };
      return;
    }
    if (pinch.distance === 0) return;
    const nextZoom = Math.max(
      options.minZoom,
      Math.min(
        options.maxZoom,
        Number(((pinch.zoom * getDistance(event.touches)) / pinch.distance).toFixed(2)),
      ),
    );
    if (nextZoom === options.getZoom()) return;
    options.onZoom(
      nextZoom,
      (event.touches[0].clientX + event.touches[1].clientX) / 2,
      (event.touches[0].clientY + event.touches[1].clientY) / 2,
    );
  };
  const endPinch = (event: TouchEvent) => {
    if (event.touches.length < 2) pinch = null;
  };

  viewport.addEventListener("touchstart", startPinch, { passive: false });
  viewport.addEventListener("touchmove", movePinch, { passive: false });
  viewport.addEventListener("touchend", endPinch);
  viewport.addEventListener("touchcancel", endPinch);
  return () => {
    viewport.style.touchAction = previousTouchAction;
    viewport.removeEventListener("touchstart", startPinch);
    viewport.removeEventListener("touchmove", movePinch);
    viewport.removeEventListener("touchend", endPinch);
    viewport.removeEventListener("touchcancel", endPinch);
  };
}
