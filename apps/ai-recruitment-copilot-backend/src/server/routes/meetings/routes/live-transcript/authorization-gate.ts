import type {
  MeetingLiveTranscriptAuthorization,
  MeetingLiveTranscriptTrack,
} from "@arc/shared/meeting-transcription";

interface AuthorizationIdentity {
  captureId: string;
  organizationId: string;
  track: MeetingLiveTranscriptTrack;
  userId: string;
}

interface AuthorizationGateOptions {
  maxGrantsPerCaptureTrack?: number;
  maxGrantsPerOrganization?: number;
  maxGrantsPerUser?: number;
  now?: () => number;
  windowMs?: number;
}

interface RateWindow {
  count: number;
  resetsAt: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_GRANTS_PER_CAPTURE_TRACK = 10;
const DEFAULT_MAX_GRANTS_PER_USER = 20;
const DEFAULT_MAX_GRANTS_PER_ORGANIZATION = 100;

export class LiveTranscriptAuthorizationRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Live transcript authorization rate limit exceeded");
    this.name = "LiveTranscriptAuthorizationRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function activeGrantKey(input: AuthorizationIdentity): string {
  return `${input.organizationId}:${input.userId}:${input.captureId}:${input.track}`;
}

export function createLiveTranscriptAuthorizationGate(options: AuthorizationGateOptions = {}) {
  const captureTrackWindows = new Map<string, RateWindow>();
  const inFlightGrants = new Map<string, Promise<MeetingLiveTranscriptAuthorization>>();
  const organizationWindows = new Map<string, RateWindow>();
  const userWindows = new Map<string, RateWindow>();
  const now = options.now ?? Date.now;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;

  const currentWindow = (windows: Map<string, RateWindow>, key: string, timestamp: number) => {
    const existing = windows.get(key);
    if (existing && existing.resetsAt > timestamp) {
      return existing;
    }
    const next = { count: 0, resetsAt: timestamp + windowMs };
    windows.set(key, next);
    return next;
  };

  const assertWithinLimit = (window: RateWindow, limit: number, timestamp: number) => {
    if (window.count >= limit) {
      throw new LiveTranscriptAuthorizationRateLimitError(
        Math.max(1, Math.ceil((window.resetsAt - timestamp) / 1000)),
      );
    }
  };

  return {
    issue: async (
      input: AuthorizationIdentity,
      mint: () => Promise<MeetingLiveTranscriptAuthorization>,
    ): Promise<MeetingLiveTranscriptAuthorization> => {
      const timestamp = now();
      for (const windows of [captureTrackWindows, organizationWindows, userWindows]) {
        for (const [windowKey, window] of windows) {
          if (window.resetsAt <= timestamp) {
            windows.delete(windowKey);
          }
        }
      }
      const key = activeGrantKey(input);
      const inFlight = inFlightGrants.get(key);
      if (inFlight) {
        return inFlight;
      }

      const captureTrackWindow = currentWindow(captureTrackWindows, key, timestamp);
      const userWindow = currentWindow(
        userWindows,
        `${input.organizationId}:${input.userId}`,
        timestamp,
      );
      const organizationWindow = currentWindow(
        organizationWindows,
        input.organizationId,
        timestamp,
      );
      assertWithinLimit(
        captureTrackWindow,
        options.maxGrantsPerCaptureTrack ?? DEFAULT_MAX_GRANTS_PER_CAPTURE_TRACK,
        timestamp,
      );
      assertWithinLimit(
        userWindow,
        options.maxGrantsPerUser ?? DEFAULT_MAX_GRANTS_PER_USER,
        timestamp,
      );
      assertWithinLimit(
        organizationWindow,
        options.maxGrantsPerOrganization ?? DEFAULT_MAX_GRANTS_PER_ORGANIZATION,
        timestamp,
      );
      captureTrackWindow.count += 1;
      userWindow.count += 1;
      organizationWindow.count += 1;

      const grant = mint();
      inFlightGrants.set(key, grant);
      try {
        return await grant;
      } finally {
        if (inFlightGrants.get(key) === grant) {
          inFlightGrants.delete(key);
        }
      }
    },
  };
}

export const liveTranscriptAuthorizationGate = createLiveTranscriptAuthorizationGate();
