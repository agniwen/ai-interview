import type { AgentState } from "@livekit/components-react";
import { useEffect, useState } from "react";
import { useSequenceStepper } from "./_internals/use-sequence-stepper";

/**
 * 生成"连接中"状态的 bar 序列：从两端向中间收敛。
 * Build the "connecting" sequence — bars converge from both ends toward the center.
 */
function generateConnectingSequenceBar(columns: number): number[][] {
  const sequence: number[][] = [];
  for (let x = 0; x < columns; x += 1) {
    sequence.push([x, columns - 1 - x]);
  }
  return sequence;
}

/**
 * 生成"聆听中"状态的 bar 序列：仅中间柱亮起，其余熄灭。
 * Build the "listening" sequence — only the center bar is highlighted.
 */
function generateListeningSequenceBar(columns: number): number[][] {
  const center = Math.floor(columns / 2);
  const noIndex = -1;
  return [[center], [noIndex]];
}

/**
 * Bar 风格的语音可视化动画器：根据 Agent 状态产出"当前应高亮的列下标数组"。
 * Bar-style visualizer animator: produces the array of column indices to highlight.
 *
 * 与 radial 版共用底层步进器 `useSequenceStepper`。
 * Shares its rAF-based stepper with the radial variant.
 */
export function useAgentAudioVisualizerBarAnimator(
  state: AgentState | undefined,
  columns: number,
  interval: number,
): number[] {
  const [sequence, setSequence] = useState<number[][]>([[]]);

  useEffect(() => {
    if (state === "thinking" || state === "listening") {
      setSequence(generateListeningSequenceBar(columns));
    } else if (state === "connecting" || state === "initializing") {
      setSequence(generateConnectingSequenceBar(columns));
    } else if (state === undefined || state === "speaking") {
      setSequence([Array.from({ length: columns }, (_, idx) => idx)]);
    } else {
      setSequence([[]]);
    }
  }, [state, columns]);

  return useSequenceStepper(sequence, interval, []);
}
