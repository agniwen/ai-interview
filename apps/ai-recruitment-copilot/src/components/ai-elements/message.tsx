"use client";
import type { UIMessage } from "ai";
import type { ComponentProps, HTMLAttributes } from "react";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";

import { memo } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@arc/shared/utils";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        "group flex w-full max-w-full flex-col gap-2",
        from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
        className,
      )}
      {...props}
    />
  );
}

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export function MessageContent({ children, className, ...props }: MessageContentProps) {
  return (
    <div
      className={cn(
        "is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm leading-7",
        "group-[.is-user]:ml-auto group-[.is-user]:bg-white dark:group-[.is-user]:bg-secondary group-[.is-user]:max-w-[88%] group-[.is-user]:rounded-2xl group-[.is-user]:border group-[.is-user]:border-border/70  group-[.is-user]:px-3 group-[.is-user]:py-2 group-[.is-user]:text-foreground",
        "group-[.is-assistant]:max-w-[100%] group-[.is-assistant]:w-full group-[.is-assistant]:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type MessageResponseProps = ComponentProps<typeof Streamdown> & {
  isStreaming?: boolean;
};

const streamdownPlugins = { cjk, code, math, mermaid };

const STREAM_ANIMATION = {
  animation: "fadeIn",
  duration: 200,
  easing: "ease-out",
  sep: "word",
} as const;

export const MessageResponse = memo(
  ({ className, isStreaming, animated, ...props }: MessageResponseProps) => (
    <Streamdown
      animated={animated ?? STREAM_ANIMATION}
      className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
      isAnimating={isStreaming}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children && prevProps.isStreaming === nextProps.isStreaming,
);

MessageResponse.displayName = "MessageResponse";
