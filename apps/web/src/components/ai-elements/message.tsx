"use client";
import type { ComponentProps } from "react";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";

import { memo } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@arc/shared/utils";
export { Message, MessageContent } from "./message-primitives";
export type { MessageContentProps, MessageProps } from "./message-primitives";

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
