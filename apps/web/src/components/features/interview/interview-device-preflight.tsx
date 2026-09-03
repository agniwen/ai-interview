"use client";

import type { TablerIcon } from "@tabler/icons-react";
import {
  IconCircleCheck,
  IconMicrophone,
  IconRefresh,
  IconVideo,
  IconWifi,
} from "@tabler/icons-react";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DeviceCheckStatus = "idle" | "checking" | "passed" | "warning" | "failed";

interface DeviceCheckResult {
  camera: DeviceCheckStatus;
  microphone: DeviceCheckStatus;
  network: DeviceCheckStatus;
  message: string | null;
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function formatMediaError(error: Error) {
  if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
    return "浏览器权限未允许";
  }
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return "未找到可用设备";
  }
  if (error.name === "NotReadableError") {
    return "设备可能被其他应用占用";
  }
  return error.message || "设备不可用";
}

async function checkMediaDevice(constraints: MediaStreamConstraints) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stopStream(stream);
    return { ok: true, reason: null };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? formatMediaError(error) : "设备不可用" };
  }
}

function DeviceCheckBadge({ status }: { status: DeviceCheckStatus }) {
  switch (status) {
    case "checking": {
      return <Badge variant="info">检测中</Badge>;
    }
    case "passed": {
      return <Badge variant="success">正常</Badge>;
    }
    case "warning": {
      return <Badge variant="warning">需留意</Badge>;
    }
    case "failed": {
      return <Badge variant="destructive">异常</Badge>;
    }
    default: {
      return <Badge variant="outline">未检测</Badge>;
    }
  }
}

function DeviceCheckItem({
  detail,
  icon: Icon,
  status,
  title,
}: {
  detail: string;
  icon: TablerIcon;
  status: DeviceCheckStatus;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">{title}</span>
        </div>
        <DeviceCheckBadge status={status} />
      </div>
      <p className="mt-2 text-muted-foreground text-xs leading-normal">{detail}</p>
    </div>
  );
}

export function DevicePreflightCard({ recordingEnabled }: { recordingEnabled: boolean }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<DeviceCheckResult>({
    camera: "idle",
    message: null,
    microphone: "idle",
    network: "idle",
  });

  const runChecks = useCallback(async () => {
    setChecking(true);
    setResult({
      camera: recordingEnabled ? "checking" : "idle",
      message: "正在检测设备状态...",
      microphone: "checking",
      network: navigator.onLine ? "checking" : "failed",
    });

    if (!navigator.mediaDevices?.getUserMedia) {
      setResult({
        camera: "failed",
        message: "当前浏览器暂不支持设备检测，建议使用最新版 Chrome、Edge 或 Safari。",
        microphone: "failed",
        network: navigator.onLine ? "passed" : "failed",
      });
      setChecking(false);
      return;
    }

    const [microphone, camera] = await Promise.all([
      checkMediaDevice({
        audio: { autoGainControl: true, echoCancellation: true, noiseSuppression: true },
      }),
      recordingEnabled
        ? checkMediaDevice({ video: true })
        : Promise.resolve({ ok: true, reason: null }),
    ]);

    const networkStatus = navigator.onLine ? "passed" : "failed";
    const message = (() => {
      if (!microphone.ok) {
        return `麦克风暂不可用：${microphone.reason}。您可以检查浏览器权限，或选择「静音开始」进行文字交流。`;
      }
      if (recordingEnabled && !camera.ok) {
        return `摄像头暂不可用：${camera.reason}。您可以检查设备与浏览器权限后再次检测。`;
      }
      if (networkStatus === "failed") {
        return "当前网络似乎尚未连接。网络恢复后，您可以再次检测。";
      }
      return "设备状态正常，您可以开始面试。";
    })();

    let cameraStatus: DeviceCheckStatus = "idle";
    if (recordingEnabled) {
      cameraStatus = camera.ok ? "passed" : "warning";
    }

    setResult({
      camera: cameraStatus,
      message,
      microphone: microphone.ok ? "passed" : "failed",
      network: networkStatus,
    });
    setChecking(false);
  }, [recordingEnabled]);

  return (
    <section className="mt-6 rounded-2xl border border-border bg-background/70 p-4 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-sm">设备检测</h2>
          <p className="mt-1 text-muted-foreground text-xs leading-normal">
            {recordingEnabled
              ? "开始前可快速确认麦克风、摄像头和网络状态。"
              : "开始前可快速确认麦克风和网络状态。"}
          </p>
        </div>
        <Button disabled={checking} onClick={runChecks} size="sm" type="button" variant="outline">
          {checking ? (
            <IconRefresh className="size-4 animate-spin" />
          ) : (
            <IconCircleCheck className="size-4" />
          )}
          检测设备
        </Button>
      </div>
      <div
        className={
          recordingEnabled ? "mt-4 grid gap-2 sm:grid-cols-3" : "mt-4 grid gap-2 sm:grid-cols-2"
        }
      >
        <DeviceCheckItem
          detail="确认浏览器能够正常采集您的声音。"
          icon={IconMicrophone}
          status={result.microphone}
          title="麦克风"
        />
        {recordingEnabled ? (
          <DeviceCheckItem
            detail="确认摄像头能够正常用于面试录像。"
            icon={IconVideo}
            status={result.camera}
            title="摄像头"
          />
        ) : null}
        <DeviceCheckItem
          detail="确认当前网络连接状态。"
          icon={IconWifi}
          status={result.network}
          title="网络"
        />
      </div>
      <p className="mt-3 min-h-8 text-muted-foreground text-xs leading-normal">
        {result.message ?? "\u00A0"}
      </p>
    </section>
  );
}
