"use client";

import {
  IconCheck,
  IconChevronDown,
  IconLoader2,
  IconMicrophone,
  IconMicrophoneOff,
  IconVideo,
  IconVideoOff,
} from "@tabler/icons-react";
import { Room } from "livekit-client";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@app/shared/utils";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface HumanMeetingPrejoinMediaSettings {
  microphoneEnabled: boolean;
  microphoneDeviceId: string;
  microphoneDeviceLabel: string;
  cameraEnabled: boolean;
}

export const defaultHumanMeetingPrejoinMediaSettings: HumanMeetingPrejoinMediaSettings = {
  cameraEnabled: false,
  microphoneDeviceId: "default",
  microphoneDeviceLabel: "系统默认麦克风",
  microphoneEnabled: true,
};

export function HumanMeetingPrejoinMediaControls({
  disabled = false,
  onChange,
  settings,
}: {
  disabled?: boolean;
  onChange: (settings: HumanMeetingPrejoinMediaSettings) => void;
  settings: HumanMeetingPrejoinMediaSettings;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function loadMicrophones() {
    setLoadingDevices(true);
    try {
      setDevices(await Room.getLocalDevices("audioinput", true));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取麦克风设备失败");
      try {
        setDevices(await Room.getLocalDevices("audioinput", false));
      } catch {
        setDevices([]);
      }
    } finally {
      setLoadingDevices(false);
    }
  }

  return (
    <div aria-label="入会设备设置" className="flex items-center gap-2">
      <ButtonGroup
        aria-label="麦克风设置"
        className={cn(
          "rounded-md border border-transparent transition-colors hover:border-border hover:bg-accent",
          menuOpen && "border-border bg-accent",
        )}
      >
        <Button
          aria-label={settings.microphoneEnabled ? "关闭麦克风" : "开启麦克风"}
          aria-pressed={settings.microphoneEnabled}
          className={cn(
            "border-0 hover:bg-transparent",
            !settings.microphoneEnabled && "text-destructive hover:text-destructive",
          )}
          disabled={disabled}
          onClick={() => onChange({ ...settings, microphoneEnabled: !settings.microphoneEnabled })}
          size="icon-sm"
          title={settings.microphoneEnabled ? "麦克风已开启" : "麦克风已关闭"}
          type="button"
          variant="ghost"
        >
          {settings.microphoneEnabled ? <IconMicrophone /> : <IconMicrophoneOff />}
        </Button>
        <ButtonGroupSeparator className="my-1.5 bg-border/80" />
        <DropdownMenu
          onOpenChange={(open) => {
            setMenuOpen(open);
            if (open) {
              void loadMicrophones();
            }
          }}
        >
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={`选择麦克风，当前麦克风：${settings.microphoneDeviceLabel}`}
                className="w-7 border-0 px-0 hover:bg-transparent"
                disabled={disabled}
                size="icon-sm"
                title={`当前麦克风：${settings.microphoneDeviceLabel}`}
                type="button"
                variant="ghost"
              >
                <IconChevronDown className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-2rem)]">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() =>
                  onChange({
                    ...settings,
                    microphoneDeviceId: "default",
                    microphoneDeviceLabel: "系统默认麦克风",
                  })
                }
              >
                <span className="min-w-0 flex-1 truncate">系统默认麦克风</span>
                {settings.microphoneDeviceId === "default" ? (
                  <IconCheck className="size-4" />
                ) : null}
              </DropdownMenuItem>
              {loadingDevices ? (
                <DropdownMenuItem disabled>
                  <IconLoader2 className="size-4 animate-spin" /> 正在检测设备…
                </DropdownMenuItem>
              ) : (
                devices
                  .filter((device) => device.deviceId && device.deviceId !== "default")
                  .map((device, index) => (
                    <DropdownMenuItem
                      key={device.deviceId}
                      onClick={() =>
                        onChange({
                          ...settings,
                          microphoneDeviceId: device.deviceId,
                          microphoneDeviceLabel: device.label || `麦克风 ${index + 1}`,
                        })
                      }
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {device.label || `麦克风 ${index + 1}`}
                      </span>
                      {settings.microphoneDeviceId === device.deviceId ? (
                        <IconCheck className="size-4" />
                      ) : null}
                    </DropdownMenuItem>
                  ))
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      <Button
        aria-label={settings.cameraEnabled ? "关闭摄像头" : "开启摄像头"}
        aria-pressed={settings.cameraEnabled}
        className={cn(!settings.cameraEnabled && "text-destructive hover:text-destructive")}
        disabled={disabled}
        onClick={() => onChange({ ...settings, cameraEnabled: !settings.cameraEnabled })}
        size="icon-sm"
        title={settings.cameraEnabled ? "摄像头已开启" : "摄像头已关闭"}
        type="button"
        variant="ghost"
      >
        {settings.cameraEnabled ? <IconVideo /> : <IconVideoOff />}
      </Button>
    </div>
  );
}
