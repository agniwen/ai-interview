import type { TrackReference } from "@livekit/components-react";
import type { MotionProps } from "motion/react";
import {
  useAgent,
  useLocalParticipant,
  useTracks,
  useVoiceAssistant,
  VideoTrack,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import * as React from "react";
import { useMemo } from "react";
import { AgentAudioVisualizerAura } from "@/components/agents-ui/agent-audio-visualizer-aura";
import { cn } from "@/lib/utils";

const ANIMATION_TRANSITION: MotionProps["transition"] = {
  damping: 75,
  mass: 1,
  stiffness: 675,
  type: "spring",
};

const tileViewClassNames = {
  agentChatClosed: ["col-start-1 row-start-1", "col-span-2 row-span-3", "place-content-center"],
  agentChatOpenWithSecondTile: ["col-start-1 row-start-1", "self-center justify-self-end"],
  agentChatOpenWithoutSecondTile: ["col-start-1 row-start-1", "col-span-2", "place-content-center"],
  grid: [
    "h-full w-full",
    "grid gap-x-2 place-content-center",
    "grid-cols-[1fr_1fr] grid-rows-[90px_1fr_90px]",
  ],
  secondTileChatClosed: ["col-start-2 row-start-3", "place-content-end"],
  secondTileChatOpen: ["col-start-2 row-start-1", "self-center justify-self-start"],
};

export function useLocalTrackRef(source: Track.Source) {
  const { localParticipant } = useLocalParticipant();
  const publication = localParticipant.getTrackPublication(source);
  const trackRef = useMemo<TrackReference | undefined>(
    () => (publication ? { participant: localParticipant, publication, source } : undefined),
    [source, publication, localParticipant],
  );
  return trackRef;
}

interface TileLayoutProps {
  chatOpen: boolean;
}

export function TileLayout({ chatOpen }: TileLayoutProps) {
  const { videoTrack: agentVideoTrack, audioTrack } = useVoiceAssistant();
  const { state: agentState } = useAgent();
  const { resolvedTheme } = useTheme();
  const [screenShareTrack] = useTracks([Track.Source.ScreenShare]);
  const cameraTrack: TrackReference | undefined = useLocalTrackRef(Track.Source.Camera);

  const isCameraEnabled = cameraTrack && !cameraTrack.publication.isMuted;
  const isScreenShareEnabled = screenShareTrack && !screenShareTrack.publication.isMuted;
  const hasSecondTile = isCameraEnabled || isScreenShareEnabled;

  const animationDelay = chatOpen ? 0 : 0.15;
  const isAvatar = agentVideoTrack !== undefined;
  const videoWidth = agentVideoTrack?.publication.dimensions?.width ?? 0;
  const videoHeight = agentVideoTrack?.publication.dimensions?.height ?? 0;

  return (
    <div
      className={cn(
        "absolute inset-x-0",
        chatOpen
          ? "top-0 h-18 z-30 pointer-events-none flex items-center justify-center"
          : "top-8 bottom-32 z-50 md:top-12 md:bottom-40",
      )}
    >
      <div
        className={cn(
          chatOpen
            ? "flex items-center justify-center h-full"
            : "relative mx-auto h-full max-w-2xl px-4 md:px-0",
        )}
      >
        <div className={cn(!chatOpen && tileViewClassNames.grid)}>
          {/* Agent */}
          <div
            className={cn([
              !chatOpen && "grid",
              !chatOpen && tileViewClassNames.agentChatClosed,
              chatOpen && "flex items-center justify-center",
            ])}
          >
            <AnimatePresence mode="popLayout">
              {!isAvatar && (
                <motion.div
                  key="agent"
                  layoutId="agent"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    ...ANIMATION_TRANSITION,
                    delay: animationDelay,
                  }}
                >
                  <AgentAudioVisualizerAura
                    size={chatOpen ? "sm" : "lg"}
                    state={agentState}
                    color={resolvedTheme === "dark" ? "#7C8CFF" : "#4680ae"}
                    colorShift={0.06}
                    themeMode={resolvedTheme as "light" | "dark"}
                    audioTrack={audioTrack}
                  />
                </motion.div>
              )}

              {isAvatar && (
                <motion.div
                  key="avatar"
                  layoutId="avatar"
                  initial={{
                    filter: "blur(20px)",
                    maskImage:
                      "radial-gradient(circle, rgba(0, 0, 0, 1) 0, rgba(0, 0, 0, 1) 20px, transparent 20px)",
                    opacity: 1,
                    scale: 1,
                  }}
                  animate={{
                    borderRadius: chatOpen ? 6 : 12,
                    filter: "blur(0px)",
                    maskImage:
                      "radial-gradient(circle, rgba(0, 0, 0, 1) 0, rgba(0, 0, 0, 1) 500px, transparent 500px)",
                  }}
                  transition={{
                    ...ANIMATION_TRANSITION,
                    delay: animationDelay,
                    filter: { duration: 1 },
                    maskImage: { duration: 1 },
                  }}
                  className={cn(
                    "overflow-hidden bg-black drop-shadow-xl/80",
                    chatOpen ? "h-[90px]" : "h-auto w-full",
                  )}
                >
                  <VideoTrack
                    width={videoWidth}
                    height={videoHeight}
                    trackRef={agentVideoTrack}
                    className={cn(chatOpen && "size-[90px] object-cover")}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 聊天面板展开时, 顶部槽位高度 (h-18=72px) 装不下 90px 的摄像头窗口,
              会和 agent 可视化挤压变形, 所以直接隐藏摄像头自览;
              录像由 LiveKit Egress 在云端继续录制, 不受影响. */}
          {/* When chat is open, the 72px top slot can't fit the 90px self-view
              tile, which collides with the agent visualizer — hide the tile.
              Server-side egress recording continues unaffected. */}
          <div
            className={cn([
              "grid",
              chatOpen && tileViewClassNames.secondTileChatOpen,
              !chatOpen && tileViewClassNames.secondTileChatClosed,
              chatOpen && "hidden",
            ])}
          >
            <AnimatePresence>
              {((cameraTrack && isCameraEnabled) || (screenShareTrack && isScreenShareEnabled)) && (
                <motion.div
                  key="camera"
                  layout="position"
                  layoutId="camera"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{
                    ...ANIMATION_TRANSITION,
                    delay: animationDelay,
                  }}
                  className="aspect-square size-[90px] drop-shadow-lg/20"
                >
                  <VideoTrack
                    trackRef={cameraTrack || screenShareTrack}
                    width={(cameraTrack || screenShareTrack)?.publication.dimensions?.width ?? 0}
                    height={(cameraTrack || screenShareTrack)?.publication.dimensions?.height ?? 0}
                    className="bg-muted aspect-square size-[90px] rounded-md object-cover"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
