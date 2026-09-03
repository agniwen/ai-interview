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

const DEFAULT_SPEED = 5;
const DEFAULT_AMPLITUDE = 0.025;
const DEFAULT_FREQUENCY = 10;
const DEFAULT_TRANSITION: ValueAnimationTransition = { duration: 0.2, ease: "easeOut" };

interface UseAgentAudioVisualizerWaveAnimatorArgs {
  state?: AgentState;
  audioTrack?: LocalAudioTrack | RemoteAudioTrack | TrackReferenceOrPlaceholder;
}

/**
 * Wave 视觉效果的动画驱动 hook：把 Agent 状态映射到波形 shader 所需的参数。
 * Wave visualizer driver: maps Agent states to the parameters used by the wave shader.
 *
 * `speaking` 状态下用 `volume` 实时驱动振幅与频率，让波形随声音变化。
 * Volume drives amplitude / frequency in real time during `speaking` so the wave reacts to audio.
 */
export function useAgentAudioVisualizerWave({
  state,
  audioTrack,
}: UseAgentAudioVisualizerWaveAnimatorArgs) {
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const { value: amplitude, animate: animateAmplitude } = useAnimatedValue(DEFAULT_AMPLITUDE);
  const { value: frequency, animate: animateFrequency } = useAnimatedValue(DEFAULT_FREQUENCY);
  const { value: opacity, animate: animateOpacity } = useAnimatedValue(1);

  const volume = useTrackVolume(audioTrack as TrackReference, {
    fftSize: 512,
    smoothingTimeConstant: 0.55,
  });

  useEffect(() => {
    switch (state) {
      case "disconnected": {
        setSpeed(DEFAULT_SPEED);
        animateAmplitude(0, DEFAULT_TRANSITION);
        animateFrequency(0, DEFAULT_TRANSITION);
        animateOpacity(1, DEFAULT_TRANSITION);
        return;
      }
      case "listening": {
        setSpeed(DEFAULT_SPEED);
        animateAmplitude(DEFAULT_AMPLITUDE, DEFAULT_TRANSITION);
        animateFrequency(DEFAULT_FREQUENCY, DEFAULT_TRANSITION);
        animateOpacity([1, 0.3], {
          duration: 0.75,
          repeat: Number.POSITIVE_INFINITY,
          repeatType: "mirror",
        });
        return;
      }
      case "thinking":
      case "connecting":
      case "initializing": {
        setSpeed(DEFAULT_SPEED * 4);
        animateAmplitude(DEFAULT_AMPLITUDE / 4, DEFAULT_TRANSITION);
        animateFrequency(DEFAULT_FREQUENCY * 4, DEFAULT_TRANSITION);
        animateOpacity([1, 0.3], {
          duration: 0.4,
          repeat: Number.POSITIVE_INFINITY,
          repeatType: "mirror",
        });
        return;
      }
      case "speaking":
      default: {
        setSpeed(DEFAULT_SPEED * 2);
        animateAmplitude(DEFAULT_AMPLITUDE, DEFAULT_TRANSITION);
        animateFrequency(DEFAULT_FREQUENCY, DEFAULT_TRANSITION);
        animateOpacity(1, DEFAULT_TRANSITION);
      }
    }
  }, [state, animateAmplitude, animateFrequency, animateOpacity]);

  useEffect(() => {
    // Volume-driven micro-modulation during speaking.
    // speaking 时用实时音量做微调，让波形随声音"呼吸"。
    if (state === "speaking") {
      animateAmplitude(0.015 + 0.4 * volume, { duration: 0 });
      animateFrequency(20 + 60 * volume, { duration: 0 });
    }
  }, [state, volume, animateAmplitude, animateFrequency]);

  return {
    amplitude,
    frequency,
    opacity,
    speed,
  };
}
