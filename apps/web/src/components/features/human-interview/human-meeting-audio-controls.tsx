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
import { cn } from "@app/shared/utils";
import { useId, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  "inline-flex h-9 max-w-48 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60";

function getDeviceLabel(device: MediaDeviceInfo, index: number): string {
  if (device.label) {
    return device.label;
  }
  if (device.deviceId === "default") {
    return "系统默认麦克风";
  }
  return `麦克风 ${index + 1}`;
}

export function MicrophoneDeviceMenu({
  className,
  compactMobile = false,
}: {
  className?: string;
  compactMobile?: boolean;
}) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const fieldId = useId();
  const { activeDeviceId, devices, setActiveMediaDevice } = useMediaDeviceSelect({
    kind: "audioinput",
    requestPermissions: false,
  });
  const selectedDevice = devices.find((device) => device.deviceId === activeDeviceId);
  const selectedLabel = selectedDevice
    ? getDeviceLabel(selectedDevice, devices.indexOf(selectedDevice))
    : "系统默认麦克风";

  async function handleSelect(deviceId: string) {
    if (isSelecting || deviceId === activeDeviceId) {
      return;
    }
    setIsSelecting(true);
    try {
      await setActiveMediaDevice(deviceId);
      setDrawerOpen(false);
      toast.success("已切换麦克风");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换麦克风失败");
    } finally {
      setIsSelecting(false);
    }
  }

  const trigger = (
    <button
      className={cn(deviceButtonClass, className)}
      type="button"
      disabled={isSelecting}
      aria-label={`当前麦克风：${selectedLabel}`}
    >
      <IconMicrophone className="size-4" />
      {compactMobile ? <span className="md:hidden">当前麦克风</span> : null}
      <span className={cn("max-w-36 truncate", compactMobile && "hidden md:inline")}>
        {selectedLabel}
      </span>
      <IconChevronDown className={cn("size-3.5 opacity-70", compactMobile && "hidden md:block")} />
    </button>
  );

  if (isMobile) {
    return (
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>选择麦克风</DrawerTitle>
            <DrawerDescription>选择会议使用的音频输入设备。</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 overflow-y-auto px-4">
            {devices.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">未检测到麦克风</p>
            ) : (
              <FieldSet disabled={isSelecting}>
                <FieldLegend className="sr-only">麦克风设备</FieldLegend>
                <RadioGroup
                  aria-label="麦克风设备"
                  value={activeDeviceId ?? ""}
                  disabled={isSelecting}
                  onValueChange={(value) => {
                    const device = devices.find((option) => option.deviceId === value);
                    if (device) {
                      void handleSelect(device.deviceId);
                    }
                  }}
                >
                  {devices.map((device, index) => (
                    <FieldLabel
                      key={device.deviceId}
                      htmlFor={`${fieldId}-${index}`}
                      className="min-h-12 w-full rounded-lg border p-3"
                    >
                      <RadioGroupItem id={`${fieldId}-${index}`} value={device.deviceId} />
                      <span className="min-w-0 break-words">{getDeviceLabel(device, index)}</span>
                    </FieldLabel>
                  ))}
                </RadioGroup>
              </FieldSet>
            )}
          </div>
          <DrawerFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
            <DrawerClose asChild>
              <Button className="h-11 w-full" size="lg" variant="outline">
                关闭
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
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
