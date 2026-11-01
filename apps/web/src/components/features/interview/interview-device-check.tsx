"use client";

import type { TablerIcon } from "@tabler/icons-react";
import { IconCheck, IconMicrophone, IconVideo } from "@tabler/icons-react";
import { cn } from "@app/shared/utils";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type {
  InterviewDeviceKind,
  InterviewDeviceState,
  useInterviewDevicePermissions,
} from "./interview-device-permissions";

type InterviewDevices = ReturnType<typeof useInterviewDevicePermissions>;

const LEVEL_SEGMENT_COUNT = 5;
// RMS of normal speech sits around 0.05–0.2; scale so conversational volume lights most segments.
const LEVEL_GAIN = 6;

function MicrophoneLevelMeter({ stream }: { stream: MediaStream }) {
  const segmentsRef = useRef<HTMLSpanElement[]>([]);

  useEffect(() => {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) {
      return;
    }
    const context = new AudioContextClass();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let frame = 0;

    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        sum += sample * sample;
      }
      const level = Math.min(1, Math.sqrt(sum / samples.length) * LEVEL_GAIN);
      const active = Math.round(level * LEVEL_SEGMENT_COUNT);
      for (const [index, segment] of segmentsRef.current.entries()) {
        segment.dataset.active = String(index < active);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close();
    };
  }, [stream]);

  return (
    <span aria-hidden className="flex h-3 items-end gap-0.5">
      {Array.from({ length: LEVEL_SEGMENT_COUNT }, (_, index) => (
        <span
          className="w-1 rounded-full bg-foreground/15 transition-colors duration-75 data-[active=true]:bg-green"
          data-active="false"
          key={index}
          ref={(node) => {
            if (node) {
              segmentsRef.current[index] = node;
            }
          }}
          style={{ height: `${40 + index * 15}%` }}
        />
      ))}
    </span>
  );
}

function CameraPreview({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.srcObject = stream;
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      aria-label="摄像头预览"
      autoPlay
      className="aspect-video w-full -scale-x-100 rounded-lg bg-muted object-cover"
      muted
      playsInline
      ref={videoRef}
    />
  );
}

function DeviceAction({
  kind,
  onRequest,
  state,
}: {
  kind: InterviewDeviceKind;
  onRequest: (kind: InterviewDeviceKind) => void;
  state: InterviewDeviceState;
}) {
  switch (state.status) {
    case "checking":
    case "requesting": {
      return <Spinner aria-label="正在检测" className="text-muted-foreground" />;
    }
    case "granted": {
      return (
        <span className="flex items-center gap-2 text-green text-xs">
          {kind === "microphone" && state.stream ? (
            <MicrophoneLevelMeter stream={state.stream} />
          ) : null}
          <IconCheck aria-hidden className="size-4" />
          <span className="sr-only">已就绪</span>
        </span>
      );
    }
    case "prompt": {
      return (
        <Button onClick={() => onRequest(kind)} size="xs" type="button" variant="outline">
          授予权限
        </Button>
      );
    }
    case "unsupported": {
      return null;
    }
    default: {
      return (
        <Button onClick={() => onRequest(kind)} size="xs" type="button" variant="outline">
          重试
        </Button>
      );
    }
  }
}

function MicrophonePicker({ devices, disabled }: { devices: InterviewDevices; disabled: boolean }) {
  return (
    <Select
      disabled={disabled}
      onValueChange={(value: string | null) => {
        if (value) {
          void devices.selectMicrophone(value);
        }
      }}
      value={devices.microphoneSelection}
    >
      <SelectTrigger
        aria-label="选择麦克风"
        className="h-7 min-w-0 max-w-full border-0 bg-transparent px-1.5 text-muted-foreground text-xs shadow-none hover:bg-component"
        size="sm"
      >
        <SelectValue placeholder="选择麦克风" />
      </SelectTrigger>
      <SelectContent align="start">
        {devices.microphoneOptions.map((option) => (
          <SelectItem key={option.deviceId} value={option.deviceId}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DeviceRow({
  icon: Icon,
  kind,
  onRequest,
  picker,
  state,
  title,
}: {
  icon: TablerIcon;
  kind: InterviewDeviceKind;
  onRequest: (kind: InterviewDeviceKind) => void;
  picker?: React.ReactNode;
  state: InterviewDeviceState;
  title: string;
}) {
  const hasProblem = state.status === "denied" || state.status === "unavailable";
  const isUnsupported = state.status === "unsupported";

  return (
    <li className="px-3.5 py-3">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="shrink-0 font-medium text-sm">{title}</span>
          {picker ??
            (state.status === "granted" && state.label ? (
              <span className="truncate text-muted-foreground text-xs">{state.label}</span>
            ) : null)}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DeviceAction kind={kind} onRequest={onRequest} state={state} />
        </div>
      </div>
      {state.detail ? (
        <p
          className={cn(
            "mt-1.5 text-xs leading-5",
            hasProblem || isUnsupported ? "text-warning-foreground" : "text-muted-foreground",
          )}
          role={hasProblem ? "alert" : undefined}
        >
          {state.detail}
        </p>
      ) : null}
      {kind === "camera" && state.status === "granted" && state.stream ? (
        <div className="mt-3">
          <CameraPreview stream={state.stream} />
        </div>
      ) : null}
    </li>
  );
}

export function InterviewDeviceCheck({
  devices,
  recordingEnabled,
}: {
  devices: InterviewDevices;
  recordingEnabled: boolean;
}) {
  const headingId = useId();
  const onRequest = (kind: InterviewDeviceKind) => {
    void devices.request(kind);
  };

  return (
    <section aria-labelledby={headingId}>
      <h2
        className="border-border/70 border-y px-3.5 py-2 text-muted-foreground text-xs"
        id={headingId}
      >
        您的设备
      </h2>
      <ul className="divide-y divide-border/70">
        <DeviceRow
          icon={IconMicrophone}
          kind="microphone"
          onRequest={onRequest}
          picker={
            devices.microphoneOptions.length > 0 &&
            (devices.microphone.status === "granted" ||
              devices.microphone.status === "requesting") ? (
              <MicrophonePicker
                devices={devices}
                disabled={devices.microphone.status === "requesting"}
              />
            ) : undefined
          }
          state={devices.microphone}
          title="麦克风"
        />
        {recordingEnabled ? (
          <DeviceRow
            icon={IconVideo}
            kind="camera"
            onRequest={onRequest}
            state={devices.camera}
            title="摄像头"
          />
        ) : null}
      </ul>
    </section>
  );
}
