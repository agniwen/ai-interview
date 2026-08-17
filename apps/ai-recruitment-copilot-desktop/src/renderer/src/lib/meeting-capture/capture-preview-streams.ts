export interface CapturePreviewStreams {
  microphone: MediaStream | null;
  system: MediaStream | null;
}

const EMPTY_STREAMS = {
  microphone: null,
  system: null,
} satisfies CapturePreviewStreams;

let streams: CapturePreviewStreams = { ...EMPTY_STREAMS };
const listeners = new Set<(next: CapturePreviewStreams) => void>();

function emit(): void {
  for (const listener of listeners) {
    listener(streams);
  }
}

/**
 * 录制源在 start 时发布可分析的预览流；stop/dispose 时清空。仅供 UI 可视化，不参与落盘。
 * Capture source publishes analysable preview streams on start and clears them on stop/dispose. UI metering only.
 */
export function setCapturePreviewStreams(next: CapturePreviewStreams): void {
  streams = next;
  emit();
}

export function clearCapturePreviewStreams(): void {
  streams = EMPTY_STREAMS;
  emit();
}

export function getCapturePreviewStreams(): CapturePreviewStreams {
  return streams;
}

export function observeCapturePreviewStreams(
  listener: (next: CapturePreviewStreams) => void,
): () => void {
  listeners.add(listener);
  listener(streams);
  return () => listeners.delete(listener);
}
