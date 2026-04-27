import type { AgentState } from "@livekit/components-react";
import { useEffect, useState } from "react";
import { useSequenceStepper } from "./_internals/use-sequence-stepper";

/**
 * 找到 `<= max` 范围内、能整除 `columns` 的最大正整数（最大公约数变体）。
 * Find the largest divisor of `columns` not exceeding `max` (a GCD variant).
 */
function findGcdLessThan(columns: number, max: number = columns): number {
  function gcd(a: number, b: number): number {
    while (b !== 0) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a;
  }
  for (let i = max; i >= 1; i -= 1) {
    if (gcd(columns, i) === i) {
      return i;
    }
  }
  return 1;
}

/**
 * 生成"连接中"的 radial 序列：每帧高亮一对相对的柱子。
 * Build the radial "connecting" sequence — each frame lights up a pair of opposed bars.
 */
function generateConnectingSequenceBar(columns: number): number[][] {
  const sequence: number[][] = [];
  const center = Math.floor(columns / 2);
  for (let x = 0; x < columns; x += 1) {
    sequence.push([x, (x + center) % columns]);
  }
  return sequence;
}

/**
 * 生成"聆听 / 思考"的 radial 序列：分组依据列数自适应。
 * Build the radial "listening / thinking" sequence; grouping adapts to the column count.
 */
function generateListeningSequenceBar(columns: number): number[][] {
  const divisor = columns > 8 ? columns / findGcdLessThan(columns, 4) : findGcdLessThan(columns, 2);
  return Array.from({ length: divisor }, (_, idx) =>
    new Array(Math.floor(columns / divisor)).fill(1).map((_, idx2) => idx2 * divisor + idx),
  );
}

/**
 * Radial 风格的语音可视化动画器：返回当前帧应高亮的柱下标数组。
 * Radial visualizer animator: returns the indices of bars to highlight on the current frame.
 *
 * 与 bar 版共用底层步进器 `useSequenceStepper`。
 * Shares its rAF-based stepper with the bar variant.
 */
export function useAgentAudioVisualizerRadialAnimator(
  state: AgentState | undefined,
  barCount: number,
  interval: number,
): number[] {
  const [sequence, setSequence] = useState<number[][]>([[]]);

  useEffect(() => {
    if (state === "thinking" || state === "listening") {
      setSequence(generateListeningSequenceBar(barCount));
    } else if (state === "connecting" || state === "initializing") {
      setSequence(generateConnectingSequenceBar(barCount));
    } else if (state === undefined || state === "speaking") {
      setSequence([Array.from({ length: barCount }, (_, idx) => idx)]);
    } else {
      setSequence([[]]);
    }
  }, [state, barCount]);

  return useSequenceStepper(sequence, interval, []);
}
