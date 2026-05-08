"use client";

import type { ComponentProps } from "react";
import {
  Avatar as HeroAvatar,
  AvatarFallback,
  AvatarImage,
  type AvatarProps as HeroAvatarProps,
} from "@heroui/react";
import { cn } from "@/lib/utils";

type LegacySize = "default";

export type AvatarProps = Omit<HeroAvatarProps, "size"> & {
  size?: HeroAvatarProps["size"] | LegacySize;
};

export function Avatar({ size, ...props }: AvatarProps) {
  const heroSize: HeroAvatarProps["size"] =
    size === "default" || size === undefined ? "md" : (size as HeroAvatarProps["size"]);
  return <HeroAvatar size={heroSize} {...props} />;
}

export { AvatarFallback, AvatarImage };

/**
 * AvatarBadge — small status dot anchored to the avatar's bottom-right corner.
 * Project-custom (Hero UI doesn't ship an equivalent).
 */
export function AvatarBadge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-accent text-accent-foreground ring-2 ring-background select-none",
        "size-2.5 [&>svg]:size-2",
        className,
      )}
      {...props}
    />
  );
}

export function AvatarGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className,
      )}
      {...props}
    />
  );
}

export function AvatarGroupCount({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-default text-sm text-muted ring-2 ring-background [&>svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}
