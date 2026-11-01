"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type InterviewDeviceKind = "microphone" | "camera";

export type InterviewDeviceStatus =
  | "checking"
  | "prompt"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable"
  | "unsupported";

export interface InterviewDeviceState {
  detail: string | null;
  label: string | null;
  status: InterviewDeviceStatus;
  stream: MediaStream | null;
}

const DEVICE_NAMES = {
  camera: "摄像头",
  microphone: "麦克风",
} satisfies Record<InterviewDeviceKind, string>;

const DENIED_ERROR_NAMES = new Set(["NotAllowedError", "PermissionDeniedError", "SecurityError"]);
const MISSING_ERROR_NAMES = new Set([
  "NotFoundError",
  "DevicesNotFoundError",
  "OverconstrainedError",
]);
const BUSY_ERROR_NAMES = new Set(["NotReadableError", "TrackStartError", "AbortError"]);

const initialDeviceState: InterviewDeviceState = {
  detail: null,
  label: null,
  status: "checking",
  stream: null,
};

function deniedDetail(kind: InterviewDeviceKind) {
  return `已被阻止，请在地址栏允许使用${DEVICE_NAMES[kind]}`;
}

function stillBlockedDetail(kind: InterviewDeviceKind) {
  return `仍被阻止：点击地址栏左侧的图标，将${DEVICE_NAMES[kind]}设为「允许」，页面会自动恢复`;
}

/** Maps a getUserMedia failure to the state shown on the device row. */
export function classifyMediaError(
  kind: InterviewDeviceKind,
  name: string,
): Pick<InterviewDeviceState, "detail" | "status"> {
  if (DENIED_ERROR_NAMES.has(name)) {
    return { detail: deniedDetail(kind), status: "denied" };
  }
  if (MISSING_ERROR_NAMES.has(name)) {
    return {
      detail: `未找到${DEVICE_NAMES[kind]}`,
      status: "unavailable",
    };
  }
  if (BUSY_ERROR_NAMES.has(name)) {
    return {
      detail: `${DEVICE_NAMES[kind]}被其他应用占用`,
      status: "unavailable",
    };
  }
  return { detail: `${DEVICE_NAMES[kind]}暂不可用`, status: "unavailable" };
}

/** Maps a Permissions API state to the row state shown before any capture is attempted. */
export function deviceStateFromPermission(
  kind: InterviewDeviceKind,
  state: PermissionState,
): Pick<InterviewDeviceState, "detail" | "status"> {
  if (state === "denied") {
    return { detail: deniedDetail(kind), status: "denied" };
  }
  if (state === "granted") {
    return { detail: null, status: "requesting" };
  }
  return { detail: null, status: "prompt" };
}

/**
 * Voice start needs a working microphone; muted start stays available so candidates can still
 * fall back to the existing text mode.
 */
export function resolveInterviewStartAvailability({
  isBusy,
  microphoneStatus,
}: {
  isBusy: boolean;
  microphoneStatus: InterviewDeviceStatus;
}) {
  return {
    mutedStartDisabled: isBusy,
    voiceStartDisabled: isBusy || microphoneStatus !== "granted",
  };
}

export interface InterviewMicrophoneOption {
  deviceId: string;
  label: string;
}

/** System-default alias that follows OS input changes; LiveKit keeps tracking it after connect. */
export const DEFAULT_MICROPHONE_ID = "default";

function constraintsFor(
  kind: InterviewDeviceKind,
  microphoneId: string | null,
): MediaStreamConstraints {
  if (kind === "camera") {
    return { video: true };
  }
  const audio: MediaTrackConstraints = {
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
  };
  if (microphoneId) {
    audio.deviceId = { exact: microphoneId };
  }
  return { audio };
}

/** Lists capture inputs that expose an id, labelling unnamed ones by position. */
export function toMicrophoneOptions(devices: MediaDeviceInfo[]): InterviewMicrophoneOption[] {
  return devices
    .filter((device) => device.kind === "audioinput" && device.deviceId)
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `麦克风 ${index + 1}`,
    }));
}

function stopStream(stream: MediaStream | null | undefined) {
  for (const track of stream?.getTracks() ?? []) {
    track.stop();
  }
}

/**
 * Tracks microphone/camera permission for the entry page and keeps a preview stream for each
 * granted device. Call `release` before LiveKit captures the devices for the interview.
 */
export function useInterviewDevicePermissions({ cameraEnabled }: { cameraEnabled: boolean }) {
  const [microphone, setMicrophone] = useState<InterviewDeviceState>(initialDeviceState);
  const [camera, setCamera] = useState<InterviewDeviceState>(initialDeviceState);
  const streamsRef = useRef(new Map<InterviewDeviceKind, MediaStream>());
  const disposedRef = useRef(false);
  const pendingRef = useRef(new Set<InterviewDeviceKind>());
  const blockedRef = useRef(new Set<InterviewDeviceKind>());
  // Candidate's explicit microphone choice; null keeps the system default.
  const preferredMicrophoneRef = useRef<string | null>(null);
  const [preferredMicrophoneId, setPreferredMicrophoneId] = useState<string | null>(null);
  const [capturedMicrophoneId, setCapturedMicrophoneId] = useState<string | null>(null);
  const [microphoneOptions, setMicrophoneOptions] = useState<InterviewMicrophoneOption[]>([]);

  const refreshMicrophoneOptions = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (!disposedRef.current) {
      setMicrophoneOptions(toMicrophoneOptions(devices));
    }
  }, []);

  const setDevice = useCallback(
    (
      kind: InterviewDeviceKind,
      update: (current: InterviewDeviceState) => InterviewDeviceState,
    ) => {
      if (disposedRef.current) {
        return;
      }
      (kind === "camera" ? setCamera : setMicrophone)(update);
    },
    [],
  );

  const releaseDevice = useCallback(
    (kind: InterviewDeviceKind) => {
      stopStream(streamsRef.current.get(kind));
      streamsRef.current.delete(kind);
      setDevice(kind, (current) => ({ ...current, stream: null }));
    },
    [setDevice],
  );

  const request = useCallback(
    async (kind: InterviewDeviceKind) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setDevice(kind, () => ({
          detail: "当前浏览器不支持，请使用最新版 Chrome、Edge 或 Safari",
          label: null,
          status: "unsupported",
          stream: null,
        }));
        return;
      }
      if (pendingRef.current.has(kind)) {
        return;
      }
      pendingRef.current.add(kind);
      const wasBlocked = blockedRef.current.has(kind);
      setDevice(kind, (current) => ({ ...current, detail: null, status: "requesting" }));
      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          constraintsFor(kind, kind === "microphone" ? preferredMicrophoneRef.current : null),
        );
        if (disposedRef.current) {
          stopStream(stream);
          return;
        }
        blockedRef.current.delete(kind);
        stopStream(streamsRef.current.get(kind));
        streamsRef.current.set(kind, stream);
        const [track] = stream.getTracks();
        track?.addEventListener("ended", () => {
          if (streamsRef.current.get(kind) !== stream) {
            return;
          }
          streamsRef.current.delete(kind);
          setDevice(kind, () => ({
            detail: `${DEVICE_NAMES[kind]}已断开`,
            label: null,
            status: "unavailable",
            stream: null,
          }));
        });
        setDevice(kind, () => ({
          detail: null,
          label: track?.label || null,
          status: "granted",
          stream,
        }));
        if (kind === "microphone") {
          setCapturedMicrophoneId(track?.getSettings().deviceId ?? null);
          // Device labels are only exposed once capture permission is granted.
          void refreshMicrophoneOptions();
        }
      } catch (error) {
        const next = classifyMediaError(kind, error instanceof Error ? error.name : "");
        if (next.status === "denied") {
          blockedRef.current.add(kind);
        }
        // Browsers refuse silently once access is blocked; tell the candidate the retry ran.
        const detail =
          wasBlocked && next.status === "denied" ? stillBlockedDetail(kind) : next.detail;
        setDevice(kind, () => ({ ...next, detail, label: null, stream: null }));
      } finally {
        pendingRef.current.delete(kind);
      }
    },
    [refreshMicrophoneOptions, setDevice],
  );

  useEffect(() => {
    const { mediaDevices } = navigator;
    if (!mediaDevices?.addEventListener) {
      return;
    }
    const onDeviceChange = () => {
      void refreshMicrophoneOptions();
    };
    mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => mediaDevices.removeEventListener("devicechange", onDeviceChange);
  }, [refreshMicrophoneOptions]);

  useEffect(() => {
    disposedRef.current = false;
    const kinds: InterviewDeviceKind[] = cameraEnabled ? ["microphone", "camera"] : ["microphone"];
    const cleanups: (() => void)[] = [];
    const streams = streamsRef.current;

    const sync = async (kind: InterviewDeviceKind) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        await request(kind);
        return;
      }
      let permission: PermissionStatus;
      try {
        // SAFETY: "camera" and "microphone" are permission names in Chromium and Safari; browsers that
        // do not recognize them reject the query, which the catch below handles.
        permission = await navigator.permissions.query({ name: kind as PermissionName });
      } catch {
        // Firefox and older Safari reject camera/microphone queries; ask on demand instead.
        setDevice(kind, (current) => ({ ...current, detail: null, status: "prompt" }));
        return;
      }
      if (disposedRef.current) {
        return;
      }
      const apply = () => {
        const next = deviceStateFromPermission(kind, permission.state);
        if (next.status === "requesting") {
          // A granted change also fires right after our own request succeeds.
          if (!streamsRef.current.has(kind)) {
            void request(kind);
          }
          return;
        }
        if (next.status === "denied") {
          blockedRef.current.add(kind);
        }
        releaseDevice(kind);
        setDevice(kind, (current) => ({ ...current, ...next, label: null }));
      };
      apply();
      permission.addEventListener("change", apply);
      cleanups.push(() => permission.removeEventListener("change", apply));
    };

    for (const kind of kinds) {
      void sync(kind);
    }

    return () => {
      disposedRef.current = true;
      for (const cleanup of cleanups) {
        cleanup();
      }
      for (const stream of streams.values()) {
        stopStream(stream);
      }
      streams.clear();
    };
  }, [cameraEnabled, releaseDevice, request, setDevice]);

  const release = useCallback(() => {
    releaseDevice("microphone");
    releaseDevice("camera");
  }, [releaseDevice]);

  const selectMicrophone = useCallback(
    async (deviceId: string) => {
      preferredMicrophoneRef.current = deviceId;
      setPreferredMicrophoneId(deviceId);
      await request("microphone");
    },
    [request],
  );

  const hasDefaultOption = microphoneOptions.some(
    (option) => option.deviceId === DEFAULT_MICROPHONE_ID,
  );
  const fallbackMicrophoneId = hasDefaultOption ? DEFAULT_MICROPHONE_ID : capturedMicrophoneId;

  return {
    camera,
    microphone,
    microphoneOptions,
    /** Device shown as selected in the picker. */
    microphoneSelection: preferredMicrophoneId ?? fallbackMicrophoneId,
    /** Device LiveKit should capture; the system default alias unless the candidate chose one. */
    microphoneStartDeviceId: preferredMicrophoneId ?? DEFAULT_MICROPHONE_ID,
    release,
    request,
    selectMicrophone,
  };
}
