// getUserMedia failures for a missing or busy capture device. Names alone are
// not enough: DOM operations also throw NotFoundError, so the message must
// refer to a capture device or source.
const MEDIA_DEVICE_ERROR_NAMES = new Set([
  "DevicesNotFoundError",
  "NotFoundError",
  "NotReadableError",
  "OverconstrainedError",
  "TrackStartError",
]);

const MEDIA_DEVICE_MESSAGE_PATTERN = /device|source/i;

/**
 * Detects capture-device failures that LiveKit raises from internal device
 * switching (for example after a headset disconnects) without a caller to
 * catch them.
 */
export function isMediaDeviceError(reason: unknown): reason is Error {
  return (
    reason instanceof Error &&
    MEDIA_DEVICE_ERROR_NAMES.has(reason.name) &&
    MEDIA_DEVICE_MESSAGE_PATTERN.test(reason.message)
  );
}

interface SentryExceptionEvent {
  exception?: { values?: { mechanism?: { handled?: boolean; type?: string } }[] };
}

/** Whether Sentry captured the event from the global unhandled-rejection handler. */
export function isUnhandledRejectionEvent(event: SentryExceptionEvent): boolean {
  const mechanism = event.exception?.values?.at(-1)?.mechanism;
  return mechanism?.handled === false && Boolean(mechanism.type?.includes("onunhandledrejection"));
}
