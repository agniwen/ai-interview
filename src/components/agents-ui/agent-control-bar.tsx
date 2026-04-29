"use client";

import type { MotionProps } from "motion/react";
import type { ComponentProps } from "react";
import type { UseInputControlsProps } from "@/hooks/agents-ui/use-agent-control-bar";
import { useAgent, useChat } from "@livekit/components-react";
import { Track } from "livekit-client";
import { Loader, MessageSquareTextIcon, SendHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AgentDisconnectButton } from "@/components/agents-ui/agent-disconnect-button";
import { AgentTrackControl } from "@/components/agents-ui/agent-track-control";
import {
  AgentTrackToggle,
  agentTrackToggleVariants,
} from "@/components/agents-ui/agent-track-toggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { useInputControls, usePublishPermissions } from "@/hooks/agents-ui/use-agent-control-bar";
import { cn } from "@/lib/utils";

const LK_TOGGLE_VARIANT_1 = [
  "data-[state=off]:bg-accent data-[state=off]:hover:bg-foreground/10",
  "data-[state=off]:[&_~_button]:bg-accent data-[state=off]:[&_~_button]:hover:bg-foreground/10",
  "data-[state=off]:border-border data-[state=off]:hover:border-foreground/12",
  "data-[state=off]:[&_~_button]:border-border data-[state=off]:[&_~_button]:hover:border-foreground/12",
  "data-[state=off]:text-destructive data-[state=off]:hover:text-destructive data-[state=off]:focus:text-destructive",
  "data-[state=off]:focus-visible:ring-foreground/12 data-[state=off]:focus-visible:border-ring",
  "dark:data-[state=off]:[&_~_button]:bg-accent dark:data-[state=off]:[&_~_button]:hover:bg-foreground/10",
];

const LK_TOGGLE_VARIANT_2 = [
  "data-[state=off]:bg-accent data-[state=off]:hover:bg-foreground/10",
  "data-[state=off]:border-border data-[state=off]:hover:border-foreground/12",
  "data-[state=off]:focus-visible:border-ring data-[state=off]:focus-visible:ring-foreground/12",
  "data-[state=off]:text-foreground data-[state=off]:hover:text-foreground data-[state=off]:focus:text-foreground",
  "data-[state=on]:bg-blue-500/20 data-[state=on]:hover:bg-blue-500/30",
  "data-[state=on]:border-blue-700/10 data-[state=on]:text-blue-700 data-[state=on]:ring-blue-700/30",
  "data-[state=on]:focus-visible:border-blue-700/50",
  "dark:data-[state=on]:bg-blue-500/20 dark:data-[state=on]:text-blue-300",
];

const MOTION_PROPS: MotionProps = {
  initial: "hidden",
  transition: {
    duration: 0.3,
    ease: "easeOut",
  },
  variants: {
    hidden: {
      height: 0,
      marginBottom: 0,
      opacity: 0,
    },
    visible: {
      height: "auto",
      marginBottom: 12,
      opacity: 1,
    },
  },
};

interface AgentChatInputProps {
  chatOpen: boolean;
  onSend?: (message: string) => void;
  className?: string;
  /**
   * When false, disables the textarea and send button so candidates cannot
   * submit text replies. Defaults to true.
   * 当为 false 时，禁用输入框与发送按钮（用于轮次未开启文本作答的场景）。
   */
  inputEnabled?: boolean;
}

function AgentChatInput({
  chatOpen,
  onSend = async () => {},
  className,
  inputEnabled = true,
}: AgentChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string>("");
  const { state: agentState } = useAgent();
  // Only allow sending when the agent is actually ready for user input.
  // Covers connecting, initializing, pre-connect-buffering, thinking, speaking,
  // disconnected, and failed — all should block the send button.
  const isAgentReady = agentState === "listening" || agentState === "idle";
  const isDisabled = !inputEnabled || isSending || !isAgentReady || message.trim().length === 0;
  const placeholderHint = !inputEnabled
    ? "本轮未开启文本作答"
    : agentState === "speaking"
      ? "面试官讲话中，请稍候..."
      : agentState === "thinking"
        ? "面试官思考中，请稍候..."
        : isAgentReady
          ? "Type something..."
          : "连接中...";

  const handleSend = async () => {
    if (isDisabled) {
      return;
    }

    try {
      setIsSending(true);
      await onSend(message.trim());
      setMessage("");
    } catch (error) {
      console.error(error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Skip Enter while an IME (e.g. Chinese pinyin) is composing — pressing
    // Enter then is used to confirm/exit composition, not to submit. Browsers
    // report keyCode 229 during composition; isComposing covers modern paths.
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleButtonClick = async () => {
    if (isDisabled) {
      return;
    }
    await handleSend();
  };

  // Refocus the input whenever sending finishes or the agent is no longer busy,
  // so the user can keep typing without clicking back into the field. Ran as
  // an effect (not inside handleSend's finally) because the textarea is still
  // disabled in the DOM until React flushes the isSending/agentState change —
  // focus() on a disabled element is a no-op.
  useEffect(() => {
    if (!chatOpen || isSending || !isAgentReady || !inputEnabled) {
      return;
    }
    inputRef.current?.focus();
  }, [chatOpen, isSending, isAgentReady, inputEnabled]);

  return (
    <div className={cn("mb-3 flex grow items-end gap-2 rounded-md pl-1 text-sm", className)}>
      <textarea
        autoFocus
        ref={inputRef}
        value={message}
        disabled={!chatOpen || isSending || !inputEnabled}
        placeholder={placeholderHint}
        onKeyDown={handleKeyDown}
        onChange={(e) => setMessage(e.target.value)}
        className="field-sizing-content max-h-16 min-h-8 flex-1 resize-none py-2 [scrollbar-width:thin] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <Button
        size="icon"
        type="button"
        disabled={isDisabled}
        variant={isDisabled ? "secondary" : "default"}
        title={isSending ? "Sending..." : isAgentReady ? "Send" : placeholderHint}
        onClick={handleButtonClick}
        className="self-end disabled:cursor-not-allowed"
      >
        {isSending ? <Loader className="animate-spin" /> : <SendHorizontal />}
      </Button>
    </div>
  );
}

/** Configuration for which controls to display in the AgentControlBar. */
export interface AgentControlBarControls {
  /**
   * Whether to show the leave/disconnect button.
   *
   * @defaultValue true
   */
  leave?: boolean;
  /**
   * Whether to show the camera toggle control.
   *
   * @defaultValue true (if camera publish permission is granted)
   */
  camera?: boolean;
  /**
   * Whether to show the microphone toggle control.
   *
   * @defaultValue true (if microphone publish permission is granted)
   */
  microphone?: boolean;
  /**
   * Whether to show the screen share toggle control.
   *
   * @defaultValue true (if screen share publish permission is granted)
   */
  screenShare?: boolean;
  /**
   * Whether to show the chat toggle control.
   *
   * @defaultValue true (if data publish permission is granted)
   */
  chat?: boolean;
}

export interface AgentControlBarProps extends UseInputControlsProps {
  /**
   * The visual style of the control bar.
   *
   * @default 'default'
   */
  variant?: "default" | "outline" | "livekit";
  /**
   * This takes an object with the following keys: `leave`, `microphone`, `screenShare`, `camera`,
   * `chat`. Each key maps to a boolean value that determines whether the control is displayed.
   *
   * @default
   * {
   *   leave: true,
   *   microphone: true,
   *   screenShare: true,
   *   camera: true,
   *   chat: true,
   * }
   */
  controls?: AgentControlBarControls;
  /**
   * Whether to save user choices.
   *
   * @default true
   */
  saveUserChoices?: boolean;
  /**
   * Whether the agent is connected to a session.
   *
   * @default false
   */
  isConnected?: boolean;
  /**
   * Whether the chat input interface is open.
   *
   * @default false
   */
  isChatOpen?: boolean;
  /**
   * Whether the candidate is allowed to submit text replies. When false the
   * textarea + send button are rendered disabled. Defaults to true.
   * 是否允许候选人通过文本回复；为 false 时文本输入框处于禁用状态。
   *
   * @default true
   */
  chatInputEnabled?: boolean;
  /** The callback for when the user disconnects. */
  onDisconnect?: () => void;
  /** The callback for when the chat is opened or closed. */
  onIsChatOpenChange?: (open: boolean) => void;
  /** The callback for when a device error occurs. */
  onDeviceError?: (error: { source: Track.Source; error: Error }) => void;
}

/**
 * A control bar specifically designed for voice assistant interfaces. Provides controls for
 * microphone, camera, screen share, chat, and disconnect. Includes an expandable chat input for
 * text-based interaction with the agent.
 *
 * @example
 *
 * ```tsx
 * <AgentControlBar
 *   variant="livekit"
 *   isConnected={true}
 *   onDisconnect={() => handleDisconnect()}
 *   controls={{
 *     microphone: true,
 *     camera: true,
 *     screenShare: false,
 *     chat: true,
 *     leave: true,
 *   }}
 * />;
 * ```
 *
 * @extends ComponentProps<'div'>
 */
export function AgentControlBar({
  variant = "default",
  controls,
  isChatOpen = false,
  isConnected = false,
  chatInputEnabled = true,
  saveUserChoices = true,
  onDisconnect,
  onDeviceError,
  onIsChatOpenChange,
  className,
  ...props
}: AgentControlBarProps & ComponentProps<"div">) {
  const { send } = useChat();
  const publishPermissions = usePublishPermissions();
  const [isChatOpenUncontrolled, setIsChatOpenUncontrolled] = useState(isChatOpen);
  // Upstream blended the controlled and uncontrolled states with `||`, which
  // left the panel stuck open after the parent flipped isChatOpen back to
  // false. Prefer the controlled value when a change handler is provided.
  const isChatOpenEffective = onIsChatOpenChange ? isChatOpen : isChatOpenUncontrolled;
  const {
    microphoneTrack,
    cameraToggle,
    microphoneToggle,
    screenShareToggle,
    handleAudioDeviceChange,
    handleVideoDeviceChange,
    handleMicrophoneDeviceSelectError,
    handleCameraDeviceSelectError,
  } = useInputControls({ onDeviceError, saveUserChoices });

  const handleSendMessage = async (message: string) => {
    await send(message);
  };

  const visibleControls = {
    camera: controls?.camera ?? publishPermissions.camera,
    chat: controls?.chat ?? publishPermissions.data,
    leave: controls?.leave ?? true,
    microphone: controls?.microphone ?? publishPermissions.microphone,
    screenShare: controls?.screenShare ?? publishPermissions.screenShare,
  };

  const isEmpty = Object.values(visibleControls).every((value) => !value);

  if (isEmpty) {
    console.warn("AgentControlBar: `visibleControls` contains only false values.");
    return null;
  }

  return (
    <div
      aria-label="Voice assistant controls"
      className={cn(
        "bg-background border-input/50 dark:border-muted flex flex-col border p-3 drop-shadow-md/3",
        variant === "livekit" ? "rounded-[31px]" : "rounded-lg",
        className,
      )}
      {...props}
    >
      <motion.div
        {...MOTION_PROPS}
        inert={!isChatOpenEffective}
        animate={isChatOpenEffective ? "visible" : "hidden"}
        className="border-input/50 flex w-full items-start overflow-hidden border-b"
      >
        <AgentChatInput
          chatOpen={isChatOpenEffective}
          inputEnabled={chatInputEnabled}
          onSend={handleSendMessage}
          className={cn(variant === "livekit" && "[&_button]:rounded-full")}
        />
      </motion.div>

      <div className="flex gap-1">
        <div className="flex grow gap-1">
          {/* Toggle Microphone */}
          {visibleControls.microphone && (
            <AgentTrackControl
              variant={variant === "outline" ? "outline" : "default"}
              kind="audioinput"
              aria-label="Toggle microphone"
              source={Track.Source.Microphone}
              pressed={microphoneToggle.enabled}
              disabled={microphoneToggle.pending}
              audioTrack={microphoneTrack}
              onPressedChange={microphoneToggle.toggle}
              onActiveDeviceChange={handleAudioDeviceChange}
              onMediaDeviceError={handleMicrophoneDeviceSelectError}
              className={cn(
                variant === "livekit" && [
                  LK_TOGGLE_VARIANT_1,
                  "rounded-full [&_button:first-child]:rounded-l-full [&_button:last-child]:rounded-r-full",
                ],
              )}
            />
          )}

          {/* Toggle Camera */}
          {visibleControls.camera && (
            <AgentTrackControl
              variant={variant === "outline" ? "outline" : "default"}
              kind="videoinput"
              aria-label="Toggle camera"
              source={Track.Source.Camera}
              pressed={cameraToggle.enabled}
              pending={cameraToggle.pending}
              disabled={cameraToggle.pending}
              onPressedChange={cameraToggle.toggle}
              onMediaDeviceError={handleCameraDeviceSelectError}
              onActiveDeviceChange={handleVideoDeviceChange}
              className={cn(
                variant === "livekit" && [
                  LK_TOGGLE_VARIANT_1,
                  "rounded-full [&_button:first-child]:rounded-l-full [&_button:last-child]:rounded-r-full",
                ],
              )}
            />
          )}

          {/* Toggle Screen Share */}
          {visibleControls.screenShare && (
            <AgentTrackToggle
              variant={variant === "outline" ? "outline" : "default"}
              aria-label="Toggle screen share"
              source={Track.Source.ScreenShare}
              pressed={screenShareToggle.enabled}
              disabled={screenShareToggle.pending}
              onPressedChange={screenShareToggle.toggle}
              className={cn(variant === "livekit" && [LK_TOGGLE_VARIANT_2, "rounded-full"])}
            />
          )}

          {/* Toggle Transcript */}
          {visibleControls.chat && (
            <Toggle
              variant={variant === "outline" ? "outline" : "default"}
              pressed={isChatOpenEffective}
              aria-label="Toggle transcript"
              onPressedChange={(state) => {
                if (!onIsChatOpenChange) {
                  setIsChatOpenUncontrolled(state);
                } else {
                  onIsChatOpenChange(state);
                }
              }}
              className={agentTrackToggleVariants({
                className: cn(variant === "livekit" && [LK_TOGGLE_VARIANT_2, "rounded-full"]),
                variant: variant === "outline" ? "outline" : "default",
              })}
            >
              <MessageSquareTextIcon />
            </Toggle>
          )}
        </div>

        {/* Disconnect */}
        {visibleControls.leave && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <AgentDisconnectButton
                disabled={!isConnected}
                className={cn(
                  variant === "livekit" &&
                    "bg-destructive/10 dark:bg-destructive/10 text-destructive hover:bg-destructive/20 dark:hover:bg-destructive/20 focus:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/4 rounded-full font-mono text-xs font-bold tracking-wider",
                )}
              >
                <span className="hidden md:inline">结束面试</span>
                <span className="inline md:hidden">结束</span>
              </AgentDisconnectButton>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认结束面试</AlertDialogTitle>
                <AlertDialogDescription>
                  面试结束后将无法继续对话，确定要结束本次面试吗？
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>继续面试</AlertDialogCancel>
                <AlertDialogAction onClick={onDisconnect}>确认结束</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
