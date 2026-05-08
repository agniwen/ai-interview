"use client";

import { Spinner as HeroSpinner, type SpinnerProps as HeroSpinnerProps } from "@heroui/react";

type LegacySize = "default";
export type SpinnerProps = Omit<HeroSpinnerProps, "size"> & {
  size?: HeroSpinnerProps["size"] | LegacySize;
};

export function Spinner({ size, ...props }: SpinnerProps) {
  const heroSize: HeroSpinnerProps["size"] =
    size === "default" || size === undefined ? "md" : (size as HeroSpinnerProps["size"]);
  return <HeroSpinner size={heroSize} {...props} />;
}
