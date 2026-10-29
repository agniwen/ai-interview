"use client";

import { IconLoader2, IconMessage2, IconMicrophone, IconSend } from "@tabler/icons-react";
import type { MotionProps } from "motion/react";
import type { ComponentProps } from "react";
import type { UseInputControlsProps } from "@/hooks/agents-ui/use-agent-control-bar";
import { useAgent, useChat, useMediaDeviceSelect } from "@livekit/components-react";
import { Track } from "livekit-client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AgentAudioVisualizerBar } from "@/components/agents-ui/agent-audio-visualizer-bar";
import { AgentDisconnectButton } from "@/components/agents-ui/agent-disconnect-button";
import { AgentTrackControl } from "@/components/agents-ui/agent-track-control";
import {
  AgentTrackToggle,
  agentTrackToggleVariants,
} from "@/components/agents-ui/agent-track-toggle";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { useInputControls, usePublishPermissions } from "@/hooks/agents-ui/use-agent-control-bar";
import {
  resolveActiveMicrophoneLabel,
  resolvePreferredMicrophoneDeviceId,
} from "@/lib/client/microphone-device";
import { cn } from "@app/shared/utils";

// The wrapper owns the shared surface so the toggle and device selector read as one control.
const LK_MIC_GROUP_VARIANT = [
  "rounded-lg bg-component text-foreground transition-colors",
  "has-[[data-track-state=off]]:bg-danger-subtle has-[[data-track-state=off]]:text-danger-foreground has-[[data-track-state=off]]:inset-ring has-[[data-track-state=off]]:inset-ring-danger-subtle-ring",
  "[&_button]:h-8 [&_button]:bg-transparent! [&_button]:text-inherit! [&_button]:shadow-none [&_button]:hover:bg-component-hover!",
  "has-[[data-track-state=off]]:[&_button]:hover:bg-danger-subtle-hover!",
  "[&_button:first-child]:rounded-l-lg [&_button:last-child]:rounded-r-lg",
  "[&_button:last-child]:relative [&_button:last-child]:before:absolute [&_button:last-child]:before:inset-y-2 [&_button:last-child]:before:left-0 [&_button:last-child]:before:w-px [&_button:last-child]:before:bg-border",
];

const LK_ACTION_TOGGLE_VARIANT = [
  "size-8 rounded-lg bg-transparent text-foreground hover:bg-component hover:text-foreground",
  "data-pressed:bg-component data-pressed:text-foreground data-pressed:hover:bg-component-hover",
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
}

function AgentChatInput({ chatOpen, onSend = async () => {}, className }: AgentChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string>("");
  const { state: agentState } = useAgent();
  // Only allow sending when the agent is actually ready for user input.
  // Covers connecting, initializing, pre-connect-buffering, thinking, speaking,
  // disconnected, and failed — all should block the send button.
  const isAgentReady = agentState === "listening" || agentState === "idle";
  const isDisabled = isSending || !isAgentReady || message.trim().length === 0;
  const placeholderHint =
    agentState === "speaking"
      ? "面试官讲话中，请稍候..."
      : agentState === "thinking"
        ? "面试官思考中，请稍候..."
        : isAgentReady
          ? "输入你的回答…"
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
    if (!chatOpen || isSending || !isAgentReady) {
      return;
    }
    inputRef.current?.focus();
  }, [chatOpen, isSending, isAgentReady]);

  return (
    <div className={cn("mb-3 flex grow items-end gap-2 rounded-md pl-1 text-sm", className)}>
      <textarea
        autoFocus
        ref={inputRef}
        value={message}
        disabled={!chatOpen || isSending}
        aria-label="面试回答"
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
        aria-label="发送回答"
        title={isSending ? "正在发送…" : isAgentReady ? "发送回答" : placeholderHint}
        onClick={handleButtonClick}
        className="self-end disabled:cursor-not-allowed"
      >
        {isSending ? <IconLoader2 className="animate-spin" /> : <IconSend />}
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
  /** Voice-only controls with the waveform above and device name below. */
  compact?: boolean;
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
   * composer is not rendered; the chat toggle still opens the transcript.
   * 是否允许候选人通过文本回复；为 false 时不渲染输入框，聊天按钮仍可查看对话记录。
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
  /**
   * Invoked when the candidate attempts to turn the camera OFF. When provided,
   * the camera toggle blocks the off transition and runs this callback instead
   * (typically to surface a reminder). Turning the camera on is unaffected.
   * 候选人尝试关闭摄像头时的回调；提供时关闭动作被拦截，仅触发回调（用于提示）。打开方向不受影响。
   */
  onCameraDisableAttempt?: () => void;
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
  compact = false,
  variant = "default",
  controls,
  isChatOpen = false,
  isConnected = false,
  chatInputEnabled = true,
  saveUserChoices = true,
  onDisconnect,
  onDeviceError,
  onIsChatOpenChange,
  onCameraDisableAttempt,
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
    activeMicrophoneDeviceId: preferredMicrophoneDeviceId,
    microphoneTrack,
    cameraToggle,
    microphoneToggle,
    screenShareToggle,
    handleAudioDeviceChange,
    handleVideoDeviceChange,
    handleMicrophoneDeviceSelectError,
    handleCameraDeviceSelectError,
  } = useInputControls({ onDeviceError, saveUserChoices });
  const { activeDeviceId: activeMicrophoneDeviceId, devices: microphoneDevices } =
    useMediaDeviceSelect({
      kind: "audioinput",
      onError: handleMicrophoneDeviceSelectError,
      requestPermissions: false,
    });
  useEffect(() => {
    if (activeMicrophoneDeviceId === "default" && preferredMicrophoneDeviceId !== "default") {
      handleAudioDeviceChange("default");
    }
  }, [activeMicrophoneDeviceId, handleAudioDeviceChange, preferredMicrophoneDeviceId]);
  const displayedMicrophoneDeviceId = resolvePreferredMicrophoneDeviceId(
    preferredMicrophoneDeviceId,
    activeMicrophoneDeviceId,
  );
  const activeMicrophoneLabel = resolveActiveMicrophoneLabel(
    microphoneDevices,
    displayedMicrophoneDeviceId,
  );

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

  const Container = compact ? "div" : Card;

  return (
    <Container
      aria-label="面试控制"
      className={cn(
        compact ? "mx-auto flex w-full max-w-72 flex-col gap-3" : "overflow-hidden",
        !compact && !visibleControls.microphone && "p-3",
        className,
      )}
      {...props}
    >
      {compact && visibleControls.microphone && (
        <AgentAudioVisualizerBar
          aria-label="麦克风实时音量"
          audioTrack={microphoneToggle.enabled ? microphoneTrack : undefined}
          barCount={40}
          className="h-5 w-full gap-1 text-muted-foreground/70 [&>div]:w-auto [&>div]:min-w-0 [&>div]:flex-1"
          size="icon"
          state={microphoneToggle.enabled ? "speaking" : "disconnected"}
        />
      )}
      <div className={cn(visibleControls.microphone && (compact ? "relative" : "relative p-3"))}>
        {/* 轮次未开启文本作答时不渲染输入框；聊天按钮仍可打开对话记录。
            / No composer when text answers are off; the chat toggle still opens the transcript. */}
        {chatInputEnabled && !compact ? (
          <motion.div
            {...MOTION_PROPS}
            inert={!isChatOpenEffective}
            animate={isChatOpenEffective ? "visible" : "hidden"}
            className="flex w-full items-start overflow-hidden border-b border-border"
          >
            <AgentChatInput chatOpen={isChatOpenEffective} onSend={handleSendMessage} />
          </motion.div>
        ) : null}

        <div
          className={cn(
            compact ? "grid grid-cols-2 items-center gap-3" : "flex items-center gap-2",
          )}
        >
          <div className={cn("flex gap-1", compact ? "min-w-0" : "grow")}>
            {/* Toggle Microphone */}
            {visibleControls.microphone && (
              <AgentTrackControl
                variant={variant === "outline" ? "outline" : "default"}
                kind="audioinput"
                aria-label="Toggle microphone"
                source={Track.Source.Microphone}
                pressed={microphoneToggle.enabled}
                disabled={microphoneToggle.pending}
                audioTrack={compact ? undefined : microphoneTrack}
                activeDeviceId={displayedMicrophoneDeviceId}
                onPressedChange={microphoneToggle.toggle}
                onActiveDeviceChange={handleAudioDeviceChange}
                onMediaDeviceError={handleMicrophoneDeviceSelectError}
                className={cn(
                  variant === "livekit" && LK_MIC_GROUP_VARIANT,
                  compact &&
                    "w-full [&_button]:h-10! [&_[role=combobox]]:h-10! [&_button]:min-w-0 [&_button]:flex-1 [&_[role=combobox]]:min-w-0 [&_[role=combobox]]:flex-1 [&_[role=combobox]]:justify-center [&_[role=combobox]]:px-0 max-md:[&_button]:h-11! max-md:[&_[role=combobox]]:h-11! max-md:[&_svg]:size-5!",
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
                onPressedChange={(next) => {
                  // Camera is recording-mandatory: block off transitions when an
                  // interceptor is provided, but always allow turning on.
                  // 摄像头为强制录制场景：有拦截器时不允许从开变关，但允许从关变开。
                  if (!next && cameraToggle.enabled && onCameraDisableAttempt) {
                    onCameraDisableAttempt();
                    return;
                  }
                  cameraToggle.toggle();
                }}
                onMediaDeviceError={handleCameraDeviceSelectError}
                onActiveDeviceChange={handleVideoDeviceChange}
                className={cn(variant === "livekit" && LK_MIC_GROUP_VARIANT)}
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
                className={cn(variant === "livekit" && LK_ACTION_TOGGLE_VARIANT)}
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
                  className: cn(variant === "livekit" && LK_ACTION_TOGGLE_VARIANT),
                  variant: variant === "outline" ? "outline" : "default",
                })}
              >
                <IconMessage2 />
              </Toggle>
            )}
          </div>

          {/* Disconnect */}
          {visibleControls.leave && (
            <Dialog>
              <DialogTrigger
                render={
                  <AgentDisconnectButton
                    disabled={!isConnected}
                    className={cn(
                      compact &&
                        "h-10 w-full min-w-0 max-md:h-11 max-md:px-4! max-md:text-sm max-md:[&_svg]:size-5!",
                    )}
                    variant={compact ? "destructive" : "destructive-subtle"}
                  >
                    <span className="hidden md:inline">结束面试</span>
                    <span className="inline md:hidden">结束</span>
                  </AgentDisconnectButton>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>确认结束面试</DialogTitle>
                  <DialogDescription>
                    面试结束后将无法继续对话，确定要结束本次面试吗？
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline">继续面试</Button>} />
                  <DialogClose
                    render={
                      <Button onClick={onDisconnect} variant="destructive">
                        确认结束
                      </Button>
                    }
                  />
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
      {compact && visibleControls.microphone && (
        <div className="flex w-full min-w-0 items-center justify-center px-1 text-xs leading-4 text-muted-foreground">
          <span
            className="min-w-0 truncate"
            title={activeMicrophoneLabel}
            aria-label={`当前麦克风：${activeMicrophoneLabel}`}
          >
            {activeMicrophoneLabel}
          </span>
        </div>
      )}

      {visibleControls.microphone && !compact ? (
        <div
          className="relative flex min-w-0 items-center gap-1.5 border-t border-border bg-sunken px-4 py-2 text-xs text-muted-foreground"
          title={activeMicrophoneLabel}
        >
          <IconMicrophone className="size-3 shrink-0 opacity-70" />
          <span className="shrink-0">当前麦克风</span>
          <span className="min-w-0 flex-1 truncate text-foreground/65">
            {activeMicrophoneLabel}
          </span>
          <AgentAudioVisualizerBar
            aria-label="麦克风实时音量"
            audioTrack={microphoneToggle.enabled ? microphoneTrack : undefined}
            barCount={7}
            className="h-5 w-16 shrink-0 gap-1 text-foreground/45 sm:w-20"
            size="icon"
            state={microphoneToggle.enabled ? "speaking" : "disconnected"}
          />
        </div>
      ) : null}
    </Container>
  );
}
