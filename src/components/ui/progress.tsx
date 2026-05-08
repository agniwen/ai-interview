"use client";

import {
  ProgressBar as HeroProgressBar,
  ProgressBarTrack,
  ProgressBarFill,
  type ProgressBarProps,
} from "@heroui/react";

export type ProgressProps = ProgressBarProps;

/**
 * Renders a horizontal progress bar. Hero UI v3 ProgressBar is compositional
 * (Track + Fill); we provide the standard composition so callers can use a
 * single `<Progress value={n} />` like the shadcn-era API.
 */
export function Progress(props: ProgressProps) {
  return (
    <HeroProgressBar {...props}>
      <ProgressBarTrack>
        <ProgressBarFill />
      </ProgressBarTrack>
    </HeroProgressBar>
  );
}
