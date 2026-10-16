"use client";

import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import * as React from "react";

import { PersonSilhouette } from "@/components/ui/person-silhouette";
import { cn } from "@app/shared/utils";

function Avatar({
  className,
  children,
  label,
  seed,
  size = "default",
  style,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  label?: string;
  seed?: number | string;
  size?: "default" | "sm" | "lg";
}) {
  const isDecorative = props["aria-hidden"] === true;
  const visibleChildren =
    seed === undefined
      ? children
      : React.Children.map(children, (child) =>
          React.isValidElement(child) && child.type === AvatarFallback ? null : child,
        );

  return (
    <AvatarPrimitive.Root
      aria-label={seed !== undefined && !isDecorative ? (label ?? "用户头像") : undefined}
      data-slot="avatar"
      data-size={size}
      data-generated-avatar={seed === undefined ? undefined : ""}
      className={cn(
        "group/avatar relative flex size-8 shrink-0 overflow-hidden rounded-full select-none data-[size=lg]:size-10 data-[size=sm]:size-6",
        className,
      )}
      role={seed !== undefined && !isDecorative ? "img" : undefined}
      style={style}
      {...props}
    >
      {seed === undefined ? null : (
        // 有种子时显示按种子选发型的灰度人像，只在没有图片或图片加载失败时渲染；图片加载中显示与 Skeleton
        // 一致的灰色占位，加载成功后整个占位卸载。
        // The seed picks a greyscale portrait, rendered only when there is no image or the image
        // failed. While the image loads, show the same grey pulse as Skeleton; once it loads the
        // placeholder unmounts.
        <AvatarPrimitive.Fallback
          aria-hidden="true"
          className="absolute inset-0 size-full"
          data-slot="avatar-generated"
          render={(fallbackProps, state) =>
            state.imageLoadingStatus === "loading" ? (
              <span
                {...fallbackProps}
                className={cn(fallbackProps.className, "animate-pulse bg-accent")}
                data-avatar-loading=""
              />
            ) : (
              <span {...fallbackProps}>
                <PersonSilhouette seed={seed} />
              </span>
            )
          }
        />
      )}
      {visibleChildren}
    </AvatarPrimitive.Root>
  );
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("relative z-[1] aspect-square size-full object-cover", className)}
      {...props}
    />
  );
}

function AvatarFallback({ className, ...props }: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs",
        className,
      )}
      {...props}
    />
  );
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
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

function AvatarGroupCount({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage };
