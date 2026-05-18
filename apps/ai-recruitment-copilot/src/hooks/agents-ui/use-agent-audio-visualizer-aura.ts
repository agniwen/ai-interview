import type {
  AgentState,
  TrackReference,
  TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import type { LocalAudioTrack, RemoteAudioTrack } from "livekit-client";
import type { ValueAnimationTransition } from "motion/react";
import { useTrackVolume } from "@livekit/components-react";
import { useEffect, useState } from "react";
import { useAnimatedValue } from "./_internals/use-animated-value";

const DEFAULT_SPEED = 10;
const DEFAULT_AMPLITUDE = 2;
const DEFAULT_FREQUENCY = 0.5;
const DEFAULT_SCALE = 0.2;
const DEFAULT_BRIGHTNESS = 1.5;
const DEFAULT_TRANSITION: ValueAnimationTransition = { duration: 0.5, ease: "easeOut" };
const DEFAULT_PULSE_TRANSITION: ValueAnimationTransition = {
  duration: 0.35,
  ease: "easeOut",
  repeat: Number.POSITIVE_INFINITY,
  repeatType: "mirror",
};

/**
 * Aura 视觉效果的动画驱动 hook：根据 Agent 状态产出 shader uniform 所需的数值。
 * Aura visualizer driver: produces the numeric uniforms consumed by the aura shader.
 *
 * `speaking` 状态下会读取实时音量并把它喂给 `scale`，从而形成响动效果。
 * In the `speaking` state real-time volume drives `scale` so the orb pulses with audio.
 */
export function useAgentAudioVisualizerAura(
  state: AgentState | undefined,
  audioTrack?: LocalAudioTrack | RemoteAudioTrack | TrackReferenceOrPlaceholder,
) {
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const {
    value: scale,
    animate: animateScale,
    motionValue: scaleMotionValue,
  } = useAnimatedValue(DEFAULT_SCALE);
  const { value: amplitude, animate: animateAmplitude } = useAnimatedValue(DEFAULT_AMPLITUDE);
  const { value: frequency, animate: animateFrequency } = useAnimatedValue(DEFAULT_FREQUENCY);
  const { value: brightness, animate: animateBrightness } = useAnimatedValue(DEFAULT_BRIGHTNESS);

  const volume = useTrackVolume(audioTrack as TrackReference, {
    fftSize: 512,
    smoothingTimeConstant: 0.55,
  });

  useEffect(() => {
    switch (state) {
      case "idle":
      case "failed":
      case "disconnected": {
        setSpeed(10);
        animateScale(0.2, DEFAULT_TRANSITION);
        animateAmplitude(1.2, DEFAULT_TRANSITION);
        animateFrequency(0.4, DEFAULT_TRANSITION);
        animateBrightness(1, DEFAULT_TRANSITION);
        return;
      }
      case "listening":
      case "pre-connect-buffering": {
        setSpeed(20);
        animateScale(0.3, { bounce: 0.35, duration: 1, type: "spring" });
        animateAmplitude(1, DEFAULT_TRANSITION);
        animateFrequency(0.7, DEFAULT_TRANSITION);
        animateBrightness([1.5, 2], DEFAULT_PULSE_TRANSITION);
        return;
      }
      case "thinking":
      case "connecting":
      case "initializing": {
        setSpeed(30);
        animateScale(0.3, DEFAULT_TRANSITION);
        animateAmplitude(0.5, DEFAULT_TRANSITION);
        animateFrequency(1, DEFAULT_TRANSITION);
        animateBrightness([0.5, 2.5], DEFAULT_PULSE_TRANSITION);
        return;
      }
      case "speaking": {
        setSpeed(70);
        animateScale(0.3, DEFAULT_TRANSITION);
        animateAmplitude(0.75, DEFAULT_TRANSITION);
        animateFrequency(1.25, DEFAULT_TRANSITION);
        animateBrightness(1.5, DEFAULT_TRANSITION);
      }
    }
  }, [state, animateScale, animateAmplitude, animateFrequency, animateBrightness]);

  useEffect(() => {
    // Drive scale directly from real-time volume only while actually speaking.
    // 仅在 speaking 状态下用实时音量驱动 scale，其它状态保留过渡动画。
    if (state === "speaking" && volume > 0 && !scaleMotionValue.isAnimating()) {
      animateScale(0.2 + 0.2 * volume, { duration: 0 });
    }
  }, [state, volume, scaleMotionValue, animateScale]);

  return {
    amplitude,
    brightness,
    frequency,
    scale,
    speed,
  };
}
