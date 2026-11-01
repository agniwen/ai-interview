type PinchZoomOptions = {
  getZoom: () => number;
  maxZoom: number;
  minZoom: number;
  onPreview: (scale: number, clientX: number, clientY: number) => void;
  onPreviewEnd: () => void;
  onZoom: (zoom: number, clientX: number, clientY: number) => void;
};

export function attachPdfPinchZoom(viewport: HTMLElement, options: PinchZoomOptions) {
  let pinch: {
    clientX: number;
    clientY: number;
    distance: number;
    nextZoom: number;
    zoom: number;
  } | null = null;
  const previousTouchAction = viewport.style.touchAction;
  viewport.style.touchAction = "pan-x pan-y";

  const getDistance = (touches: TouchList) =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  const startPinch = (event: TouchEvent) => {
    if (pinch) options.onPreviewEnd();
    pinch = null;
    if (event.touches.length !== 2) return;
    event.preventDefault();
    const zoom = options.getZoom();
    pinch = {
      clientX: (event.touches[0].clientX + event.touches[1].clientX) / 2,
      clientY: (event.touches[0].clientY + event.touches[1].clientY) / 2,
      distance: getDistance(event.touches),
      nextZoom: zoom,
      zoom,
    };
  };
  const movePinch = (event: TouchEvent) => {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    if (!pinch) {
      startPinch(event);
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
    pinch.nextZoom = nextZoom;
    pinch.clientX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
    pinch.clientY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
    options.onPreview(nextZoom / pinch.zoom, pinch.clientX, pinch.clientY);
  };
  const finishPinch = (event: TouchEvent, cancelled = false) => {
    if ((!cancelled && event.touches.length >= 2) || !pinch) return;
    const finished = pinch;
    pinch = null;
    options.onPreviewEnd();
    if (finished.nextZoom !== options.getZoom()) {
      options.onZoom(finished.nextZoom, finished.clientX, finished.clientY);
    }
  };

  viewport.addEventListener("touchstart", startPinch, { passive: false });
  viewport.addEventListener("touchmove", movePinch, { passive: false });
  const endPinch = (event: TouchEvent) => finishPinch(event);
  const cancelPinch = (event: TouchEvent) => finishPinch(event, true);
  viewport.addEventListener("touchend", endPinch);
  viewport.addEventListener("touchcancel", cancelPinch);
  return () => {
    if (pinch) options.onPreviewEnd();
    viewport.style.touchAction = previousTouchAction;
    viewport.removeEventListener("touchstart", startPinch);
    viewport.removeEventListener("touchmove", movePinch);
    viewport.removeEventListener("touchend", endPinch);
    viewport.removeEventListener("touchcancel", cancelPinch);
  };
}
