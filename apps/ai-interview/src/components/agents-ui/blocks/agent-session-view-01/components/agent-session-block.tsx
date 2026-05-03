"use client";

import type { MotionProps } from "motion/react";
import type { AgentControlBarControls } from "@/components/agents-ui/agent-control-bar";
import { useAgent, useSessionContext, useSessionMessages } from "@livekit/components-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { AgentChatTranscript } from "@/components/agents-ui/agent-chat-transcript";
import { AgentControlBar } from "@/components/agents-ui/agent-control-bar";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";
import { AgentStateIndicator } from "./agent-state-indicator";
import { TileLayout } from "./tile-view";

const MotionMessage = motion.create(Shimmer);

const BOTTOM_VIEW_MOTION_PROPS: MotionProps = {
  animate: "visible",
  exit: "hidden",
  initial: "hidden",
  transition: {
    delay: 0.5,
    duration: 0.3,
    ease: "easeOut",
  },
  variants: {
    hidden: {
      opacity: 0,
      translateY: "100%",
    },
    visible: {
      opacity: 1,
      translateY: "0%",
    },
  },
};

const CHAT_MOTION_PROPS: MotionProps = {
  animate: "visible",
  exit: "hidden",
  initial: "hidden",
  variants: {
    hidden: {
      opacity: 0,
      transition: {
        duration: 0.3,
        ease: "easeOut",
      },
    },
    visible: {
      opacity: 1,
      transition: {
        delay: 0.2,
        duration: 0.3,
        ease: "easeOut",
      },
    },
  },
};

const SHIMMER_MOTION_PROPS: MotionProps = {
  animate: "visible",
  exit: "hidden",
  initial: "hidden",
  variants: {
    hidden: {
      opacity: 0,
      transition: {
        delay: 0,
        duration: 0.5,
        ease: "easeIn",
      },
    },
    visible: {
      opacity: 1,
      transition: {
        delay: 0.8,
        duration: 0.5,
        ease: "easeIn",
      },
    },
  },
};

interface FadeProps {
  top?: boolean;
  bottom?: boolean;
  className?: string;
}

export function Fade({ top = false, bottom = false, className }: FadeProps) {
  return (
    <div
      className={cn(
        "from-background pointer-events-none h-4 bg-linear-to-b to-transparent",
        top && "bg-linear-to-b",
        bottom && "bg-linear-to-t",
        className,
      )}
    />
  );
}

export interface AgentSessionView_01Props {
  /**
   * Message shown above the controls before the first chat message is sent.
   *
   * @default 'Agent is listening, ask it a question'
   */
  preConnectMessage?: string;
  /**
   * Enables or disables the chat toggle and transcript input controls.
   *
   * @default true
   */
  supportsChatInput?: boolean;
  /**
   * Enables or disables camera controls in the bottom control bar.
   *
   * @default true
   */
  supportsVideoInput?: boolean;
  /**
   * Enables or disables screen sharing controls in the bottom control bar.
   *
   * @default true
   */
  supportsScreenShare?: boolean;
  /**
   * Shows a pre-connect buffer state with a shimmer message before messages appear.
   *
   * @default true
   */
  isPreConnectBufferEnabled?: boolean;

  /** Selects the visualizer style rendered in the main tile area. */
  audioVisualizerType?: "bar" | "wave" | "grid" | "radial" | "aura";
  /** Primary hex color used by supported audio visualizer variants. */
  audioVisualizerColor?: `#${string}`;
  /** Hue shift intensity used by certain visualizers. */
  audioVisualizerColorShift?: number;
  /** Number of bars to render when `audioVisualizerType` is `bar`. */
  audioVisualizerBarCount?: number;
  /** Number of rows in the visualizer when `audioVisualizerType` is `grid`. */
  audioVisualizerGridRowCount?: number;
  /** Number of columns in the visualizer when `audioVisualizerType` is `grid`. */
  audioVisualizerGridColumnCount?: number;
  /** Number of radial bars when `audioVisualizerType` is `radial`. */
  audioVisualizerRadialBarCount?: number;
  /** Base radius of the radial visualizer when `audioVisualizerType` is `radial`. */
  audioVisualizerRadialRadius?: number;
  /** Stroke width of the wave path when `audioVisualizerType` is `wave`. */
  audioVisualizerWaveLineWidth?: number;
  /** Optional class name merged onto the outer `<section>` container. */
  className?: string;
  /** When true, the chat/message panel opens immediately on mount. */
  defaultChatOpen?: boolean;
  /**
   * Whether the candidate may type text replies. When false the textarea is
   * rendered disabled (the chat panel toggle is still visible so users can
   * read the transcript). Defaults to true.
   * 是否允许候选人通过文本回复；为 false 时文本输入框处于禁用状态。
   */
  chatInputEnabled?: boolean;
  /**
   * Invoked when the candidate attempts to turn the camera OFF. When provided
   * the camera toggle blocks the off transition and runs this callback
   * instead. Turning the camera on remains unaffected.
   * 候选人尝试关闭摄像头时的回调；提供时关闭动作被拦截，仅触发回调（用于提示）。
   */
  onCameraDisableAttempt?: () => void;
}

export function AgentSessionView_01({
  preConnectMessage = "Agent is listening, ask it a question",
  supportsChatInput = true,
  supportsVideoInput = true,
  supportsScreenShare = true,
  isPreConnectBufferEnabled = true,

  audioVisualizerType,
  audioVisualizerColor,
  audioVisualizerColorShift,
  audioVisualizerBarCount,
  audioVisualizerGridRowCount,
  audioVisualizerGridColumnCount,
  audioVisualizerRadialBarCount,
  audioVisualizerRadialRadius,
  audioVisualizerWaveLineWidth,
  defaultChatOpen = false,
  chatInputEnabled = true,
  onCameraDisableAttempt,
  ref,
  className,
  ...props
}: React.ComponentProps<"section"> & AgentSessionView_01Props) {
  const session = useSessionContext();
  const { messages } = useSessionMessages(session);
  const [chatOpen, setChatOpen] = useState(defaultChatOpen);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { state: agentState } = useAgent();

  const controls: AgentControlBarControls = {
    camera: supportsVideoInput,
    chat: supportsChatInput,
    leave: true,
    microphone: true,
    screenShare: supportsScreenShare,
  };

  useEffect(() => {
    const lastMessage = messages.at(-1);
    const lastMessageIsLocal = lastMessage?.from?.isLocal === true;

    if (scrollAreaRef.current && lastMessageIsLocal) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <section
      ref={ref}
      className={cn("bg-background relative z-10 h-full w-full overflow-hidden", className)}
      {...props}
    >
      <Fade top className={cn("absolute inset-x-4 top-0 z-10", chatOpen ? "h-0" : "h-40")} />
      {/* transcript */}

      <div
        className={cn(
          "absolute inset-x-0 bottom-[135px] z-20 flex flex-col md:bottom-[170px]",
          chatOpen ? "top-[88px]" : "top-0",
        )}
      >
        <AnimatePresence>
          {chatOpen && (
            <motion.div {...CHAT_MOTION_PROPS} className="relative h-full w-full">
              <AgentChatTranscript
                agentState={agentState}
                messages={messages}
                className="absolute inset-0 mx-auto w-full max-w-2xl [&_.is-user>div]:rounded-[22px] [&>div>div]:px-4 [&>div>div]:pt-4 md:[&>div>div]:px-6"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Tile layout */}
      <TileLayout chatOpen={chatOpen} />
      {/* State indicator */}
      <div
        className={cn(
          "absolute inset-x-0 z-30",
          chatOpen ? "top-[62px]   flex justify-center" : "bottom-[170px] md:bottom-[210px]",
        )}
      >
        <AgentStateIndicator
          state={agentState}
          className={cn([
            chatOpen ? "rounded-full px-2 bg-secondary border border-primary/20" : "",
          ])}
        />
      </div>
      {/* Bottom */}
      <motion.div
        {...BOTTOM_VIEW_MOTION_PROPS}
        className="absolute inset-x-3 bottom-0 z-50 md:inset-x-12"
      >
        {/* Pre-connect message */}
        {isPreConnectBufferEnabled && (
          <AnimatePresence>
            {messages.length === 0 && (
              <MotionMessage
                key="pre-connect-message"
                duration={2}
                aria-hidden={messages.length > 0}
                {...SHIMMER_MOTION_PROPS}
                className="pointer-events-none mx-auto block w-full max-w-2xl pb-4 text-center text-sm font-semibold"
              >
                {preConnectMessage}
              </MotionMessage>
            )}
          </AnimatePresence>
        )}
        <div className="bg-background relative mx-auto max-w-2xl pb-3 md:pb-12">
          <Fade bottom className="absolute inset-x-0 top-0 h-4 -translate-y-full" />
          <AgentControlBar
            variant="livekit"
            controls={controls}
            isChatOpen={chatOpen}
            chatInputEnabled={chatInputEnabled}
            isConnected={session.isConnected}
            onDisconnect={session.end}
            onIsChatOpenChange={setChatOpen}
            onCameraDisableAttempt={onCameraDisableAttempt}
          />
        </div>
      </motion.div>
    </section>
  );
}
