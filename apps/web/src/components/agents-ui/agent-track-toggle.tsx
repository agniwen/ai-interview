import {
  IconDeviceDesktopOff,
  IconDeviceDesktopUp,
  IconLoader2,
  IconMicrophone,
  IconMicrophoneOff,
  IconVideo,
  IconVideoOff,
} from "@tabler/icons-react";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cva } from "class-variance-authority";
import { Track } from "livekit-client";

import { Fragment, useMemo, useState } from "react";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@app/shared/utils";

export const agentTrackToggleVariants = cva(["size-9"], {
  defaultVariants: {
    variant: "default",
  },
  variants: {
    size: {
      default: "h-9 px-2 min-w-9",
      lg: "h-10 px-2.5 min-w-10",
      sm: "h-8 px-1.5 min-w-8",
    },
    variant: {
      default: [
        "bg-destructive/10 text-destructive",
        "hover:bg-destructive/15",
        "focus-visible:ring-destructive/30",
        "data-pressed:bg-accent data-pressed:text-accent-foreground",
        "data-pressed:hover:bg-foreground/10",
      ],
      outline: [
        "border-destructive/20 bg-destructive/10 text-destructive",
        "hover:bg-destructive/15 hover:text-destructive",
        "focus:text-destructive",
        "focus-visible:border-destructive focus-visible:ring-destructive/30",
        "data-pressed:hover:border-foreground/12 data-pressed:hover:bg-foreground/10",
        "dark:data-pressed:hover:bg-foreground/10",
      ],
    },
  },
});

function getSourceIcon(source: Track.Source, enabled: boolean, pending = false) {
  if (pending) {
    return IconLoader2;
  }

  switch (source) {
    case Track.Source.Microphone: {
      return enabled ? IconMicrophone : IconMicrophoneOff;
    }
    case Track.Source.Camera: {
      return enabled ? IconVideo : IconVideoOff;
    }
    case Track.Source.ScreenShare: {
      return enabled ? IconDeviceDesktopUp : IconDeviceDesktopOff;
    }
    default: {
      return Fragment;
    }
  }
}

/**
 * Props for the AgentTrackToggle component.
 */
export type AgentTrackToggleProps = VariantProps<typeof agentTrackToggleVariants> &
  Omit<ComponentProps<"button">, "value"> & {
    /**
     * The size of the toggle.
     */
    size?: "sm" | "default" | "lg";
    /**
     * The variant of the toggle.
     * @defaultValue 'default'
     */
    variant?: "default" | "outline";
    /**
     * The track source to toggle (Microphone, Camera, or ScreenShare).
     */
    source: "camera" | "microphone" | "screen_share";
    /**
     * Whether the toggle is in a pending/loading state.
     * When true, displays a loading spinner icon.
     * @defaultValue false
     */
    pending?: boolean;
    /**
     * Whether the toggle is currently pressed/enabled.
     * @defaultValue false
     */
    pressed?: boolean;
    /**
     * The default pressed state when uncontrolled.
     * @defaultValue false
     */
    defaultPressed?: boolean;
    /**
     * Callback fired when the pressed state changes.
     */
    onPressedChange?: (pressed: boolean) => void;
  };

/**
 * A toggle button for controlling track publishing state.
 * Displays appropriate icons based on the track source and state.
 *
 * @extends ComponentProps<'button'>
 *
 * @example
 * ```tsx
 * <AgentTrackToggle
 *   source={Track.Source.Microphone}
 *   pressed={isMicEnabled}
 *   onPressedChange={(pressed) => setMicEnabled(pressed)}
 * />
 * ```
 */
export function AgentTrackToggle({
  size = "default",
  variant = "default",
  source,
  pending = false,
  pressed,
  defaultPressed = false,
  className,
  onPressedChange,
  ...props
}: AgentTrackToggleProps) {
  const [uncontrolledPressed, setUncontrolledPressed] = useState(defaultPressed ?? false);
  const isControlled = pressed !== undefined;
  const resolvedPressed = useMemo(
    () => (isControlled ? pressed : uncontrolledPressed) ?? false,
    [isControlled, pressed, uncontrolledPressed],
  );
  const IconComponent = getSourceIcon(source as Track.Source, resolvedPressed, pending);
  const handlePressedChange = (nextPressed: boolean) => {
    if (!isControlled) {
      setUncontrolledPressed(nextPressed);
    }
    onPressedChange?.(nextPressed);
  };

  return (
    <Toggle
      size={size}
      variant={variant}
      pressed={isControlled ? pressed : undefined}
      defaultPressed={isControlled ? undefined : defaultPressed}
      aria-label={`Toggle ${source}`}
      onPressedChange={handlePressedChange}
      className={cn(
        agentTrackToggleVariants({
          className,
          size,
          variant: variant ?? "default",
        }),
      )}
      {...props}
    >
      <IconComponent className={cn(pending && "animate-spin")} />
      {props.children}
    </Toggle>
  );
}
