import { IconCheck, IconChevronDown, IconHeadphones } from "@tabler/icons-react";
import { useMediaDeviceSelect } from "@livekit/components-react";
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

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
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
      setMenuOpen(false);
      toast.success("已切换麦克风");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换麦克风失败");
    } finally {
      setIsSelecting(false);
    }
  }

  const trigger = (
    <Button
      className="group/microphone-menu shrink-0 aria-expanded:bg-accent aria-expanded:text-accent-foreground max-md:order-3 max-md:h-11 max-md:min-w-0 max-md:flex-1 max-md:flex-col max-md:gap-1 max-md:border-0 max-md:bg-transparent max-md:px-1 max-md:text-[10px] max-md:shadow-none max-md:hover:bg-transparent max-md:aria-expanded:bg-transparent max-md:aria-expanded:text-primary max-md:[&_svg]:size-5"
      size="icon"
      variant="outline"
      type="button"
      disabled={isSelecting}
      aria-expanded={menuOpen}
      aria-label={`选择麦克风，当前麦克风：${selectedLabel}`}
      title={`选择麦克风：${selectedLabel}`}
    >
      {isMobile ? (
        <>
          <IconHeadphones className="size-4" />
          <span className="max-w-full truncate">麦克风设备</span>
        </>
      ) : (
        <IconChevronDown className="transition-transform duration-[var(--duration-fast)] group-aria-expanded/microphone-menu:rotate-180 motion-reduce:transition-none" />
      )}
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
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
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
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
