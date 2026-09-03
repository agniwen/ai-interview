import {
  IconCheck,
  IconChevronDown,
  IconLoader2,
  IconMicrophone,
  IconWand,
  IconWaveSine,
} from "@tabler/icons-react";
import { useMediaDeviceSelect, useRoomContext } from "@livekit/components-react";
import { LocalAudioTrack, Track } from "livekit-client";
import type { Room } from "livekit-client";
import { useState } from "react";
import { toast } from "sonner";
import { runAsyncAction } from "@/lib/client/async-control";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createVoiceEffectProcessor } from "./human-voice-effects";
import type { VoiceEffectId } from "./human-voice-effects";

const voiceEffectOptions = [
  { id: "none", label: "原声" },
  { id: "warmLight", label: "轻微低沉" },
  { id: "warmDeep", label: "稳重低沉" },
  { id: "phoneClear", label: "清晰电话音" },
  { id: "robotLight", label: "轻机器人" },
  { id: "cartoonHigh", label: "卡通高音" },
] satisfies { id: VoiceEffectId; label: string }[];

const deviceButtonClass =
  "inline-flex h-9 max-w-48 items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 text-sm text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60";

function getDeviceLabel(device: MediaDeviceInfo, index: number): string {
  if (device.label) {
    return device.label;
  }
  if (device.deviceId === "default") {
    return "系统默认麦克风";
  }
  return `麦克风 ${index + 1}`;
}

export function MicrophoneDeviceMenu() {
  const { activeDeviceId, devices, setActiveMediaDevice } = useMediaDeviceSelect({
    kind: "audioinput",
    requestPermissions: false,
  });
  const selectedDevice = devices.find((device) => device.deviceId === activeDeviceId);
  const selectedLabel = selectedDevice
    ? getDeviceLabel(selectedDevice, devices.indexOf(selectedDevice))
    : "系统默认麦克风";

  async function handleSelect(deviceId: string) {
    try {
      await setActiveMediaDevice(deviceId);
      toast.success("已切换麦克风");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换麦克风失败");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className={deviceButtonClass} type="button">
            <IconMicrophone className="size-4" />
            <span className="max-w-36 truncate">{selectedLabel}</span>
            <IconChevronDown className="size-3.5 opacity-70" />
          </button>
        }
      />
      <DropdownMenuContent align="center" className="w-72" side="top">
        <DropdownMenuGroup>
          {devices.length === 0 ? (
            <DropdownMenuItem disabled>未检测到麦克风</DropdownMenuItem>
          ) : (
            devices.map((device, index) => (
              <DropdownMenuItem
                className="flex items-center justify-between gap-2"
                key={device.deviceId}
                onClick={() => handleSelect(device.deviceId)}
              >
                <span className="truncate">{getDeviceLabel(device, index)}</span>
                {device.deviceId === activeDeviceId ? (
                  <IconCheck className="size-4 shrink-0" />
                ) : null}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getVoiceEffectLabel(effect: VoiceEffectId): string {
  return voiceEffectOptions.find((option) => option.id === effect)?.label ?? "原声";
}

function getLocalMicrophoneTrack(room: Room): LocalAudioTrack | null {
  const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone);
  return publication?.track instanceof LocalAudioTrack ? publication.track : null;
}

async function getOrCreateLocalMicrophoneTrack(room: Room): Promise<LocalAudioTrack> {
  const existingTrack = getLocalMicrophoneTrack(room);
  if (existingTrack) {
    return existingTrack;
  }
  const publication = await room.localParticipant.setMicrophoneEnabled(true, {
    deviceId: "default",
  });
  if (publication?.track instanceof LocalAudioTrack) {
    return publication.track;
  }
  const nextTrack = getLocalMicrophoneTrack(room);
  if (nextTrack) {
    return nextTrack;
  }
  throw new Error("未找到本地麦克风");
}

export function VoiceEffectMenu() {
  const room = useRoomContext();
  const [selectedEffect, setSelectedEffect] = useState<VoiceEffectId>("none");
  const [isApplying, setIsApplying] = useState(false);
  const selectedLabel = getVoiceEffectLabel(selectedEffect);

  async function handleSelect(effect: VoiceEffectId) {
    if (isApplying || effect === selectedEffect) {
      return;
    }
    setIsApplying(true);
    await runAsyncAction({
      cleanup: () => setIsApplying(false),
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "开启声音效果失败");
      },
      operation: async () => {
        if (effect === "none") {
          await getLocalMicrophoneTrack(room)?.stopProcessor();
          setSelectedEffect("none");
          toast.success("已恢复原声");
          return;
        }

        const track = await getOrCreateLocalMicrophoneTrack(room);
        await track.setProcessor(createVoiceEffectProcessor(effect));
        setSelectedEffect(effect);
        toast.success(`已启用${getVoiceEffectLabel(effect)}`);
      },
    });
  }

  let triggerIcon = <IconWaveSine className="size-4" />;
  if (isApplying) {
    triggerIcon = <IconLoader2 className="size-4 animate-spin" />;
  } else if (selectedEffect !== "none") {
    triggerIcon = <IconWand className="size-4" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className={deviceButtonClass} disabled={isApplying} type="button">
            {triggerIcon}
            <span>{selectedLabel}</span>
            <IconChevronDown className="size-3.5 opacity-70" />
          </button>
        }
      />
      <DropdownMenuContent align="center" className="w-44" side="top">
        <DropdownMenuGroup>
          {voiceEffectOptions.map((option) => (
            <DropdownMenuItem
              className="flex items-center justify-between gap-2"
              key={option.id}
              onClick={() => handleSelect(option.id)}
            >
              <span>{option.label}</span>
              {option.id === selectedEffect ? <IconCheck className="size-4 shrink-0" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
