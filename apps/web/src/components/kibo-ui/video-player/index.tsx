"use client";

import {
  MediaControlBar,
  MediaController,
  MediaMuteButton,
  MediaPlayButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react";
import type { ComponentProps, CSSProperties } from "react";
import { cn } from "@app/shared/utils";

export type VideoPlayerProps = ComponentProps<typeof MediaController>;

// SAFETY: Media Chrome consumes these CSS custom properties as string values.
const variables = {
  "--media-background-color": "var(--media-secondary-color)",
  "--media-control-hover-background":
    "light-dark(var(--color-neutral-100), var(--color-neutral-800))",
  "--media-font-family": "var(--font-sans)",
  "--media-live-button-icon-color": "var(--media-primary-color)",
  "--media-live-button-indicator-color": "var(--media-primary-color)",
  "--media-primary-color": "light-dark(var(--color-neutral-800), var(--color-neutral-200))",
  "--media-range-track-background":
    "light-dark(var(--color-neutral-200), var(--color-neutral-700))",
  "--media-secondary-color": "light-dark(var(--color-white), var(--color-neutral-950))",
  "--media-text-color": "var(--media-primary-color)",
} as CSSProperties;

export const VideoPlayer = ({ className, style, ...props }: VideoPlayerProps) => (
  <MediaController
    className={cn("scheme-light dark:scheme-dark", className)}
    style={{
      ...variables,
      ...style,
    }}
    {...props}
  />
);

export type VideoPlayerControlBarProps = ComponentProps<typeof MediaControlBar>;

export const VideoPlayerControlBar = ({ className, ...props }: VideoPlayerControlBarProps) => (
  <MediaControlBar className={cn("bg-(--media-secondary-color)", className)} {...props} />
);

export type VideoPlayerTimeRangeProps = ComponentProps<typeof MediaTimeRange>;

export const VideoPlayerTimeRange = ({ className, ...props }: VideoPlayerTimeRangeProps) => (
  <MediaTimeRange className={cn("p-2.5", className)} {...props} />
);

export type VideoPlayerTimeDisplayProps = ComponentProps<typeof MediaTimeDisplay>;

export const VideoPlayerTimeDisplay = ({ className, ...props }: VideoPlayerTimeDisplayProps) => (
  <MediaTimeDisplay className={cn("p-2.5", className)} {...props} />
);

export type VideoPlayerVolumeRangeProps = ComponentProps<typeof MediaVolumeRange>;

export const VideoPlayerVolumeRange = ({ className, ...props }: VideoPlayerVolumeRangeProps) => (
  <MediaVolumeRange className={cn("p-2.5", className)} {...props} />
);

export type VideoPlayerPlayButtonProps = ComponentProps<typeof MediaPlayButton>;

export const VideoPlayerPlayButton = ({ className, ...props }: VideoPlayerPlayButtonProps) => (
  <MediaPlayButton className={cn("p-2.5", className)} {...props} />
);

export type VideoPlayerSeekBackwardButtonProps = ComponentProps<typeof MediaSeekBackwardButton>;

export const VideoPlayerSeekBackwardButton = ({
  className,
  ...props
}: VideoPlayerSeekBackwardButtonProps) => (
  <MediaSeekBackwardButton className={cn("p-2.5", className)} {...props} />
);

export type VideoPlayerSeekForwardButtonProps = ComponentProps<typeof MediaSeekForwardButton>;

export const VideoPlayerSeekForwardButton = ({
  className,
  ...props
}: VideoPlayerSeekForwardButtonProps) => (
  <MediaSeekForwardButton className={cn("p-2.5", className)} {...props} />
);

export type VideoPlayerMuteButtonProps = ComponentProps<typeof MediaMuteButton>;

export const VideoPlayerMuteButton = ({ className, ...props }: VideoPlayerMuteButtonProps) => (
  <MediaMuteButton className={cn("p-2.5", className)} {...props} />
);

export type VideoPlayerContentProps = ComponentProps<"video">;

export const VideoPlayerContent = ({ className, ...props }: VideoPlayerContentProps) => (
  // oxlint-disable-next-line jsx-a11y/media-has-caption -- User-uploaded attachments have no caption track; callers can supply one through children.
  <video className={cn("mt-0 mb-0", className)} {...props} />
);
