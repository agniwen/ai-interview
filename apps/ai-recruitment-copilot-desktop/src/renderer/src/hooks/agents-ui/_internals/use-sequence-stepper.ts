import { useEffect, useRef, useState } from "react";

/**
 * 基于 requestAnimationFrame 的"按时间间隔向前步进序列"工具。
 * A `requestAnimationFrame`-driven sequence stepper.
 *
 * 用于多个语音可视化 hook（bar / radial）：每隔 `interval` ms 把内部 index +1，
 * 然后从 `sequence` 中按 `index % sequence.length` 取出当前帧。
 *
 * 当 `sequence` 变化时 index 会自动重置为 0，避免取到错位的帧。
 *
 * Used by visualizer hooks (bar / radial): every `interval` ms the internal index
 * advances by one and the current frame is `sequence[index % sequence.length]`.
 *
 * The index resets to 0 whenever `sequence` changes to keep frames aligned.
 */
export function useSequenceStepper<T>(sequence: T[], interval: number, fallback: T): T {
  const [index, setIndex] = useState(0);
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    setIndex(0);
  }, [sequence]);

  useEffect(() => {
    let startTime = performance.now();

    const animate = (time: DOMHighResTimeStamp) => {
      if (time - startTime >= interval) {
        setIndex((prev) => prev + 1);
        startTime = time;
      }
      animationFrameId.current = requestAnimationFrame(animate);
    };

    animationFrameId.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [interval, sequence.length]);

  return sequence[index % Math.max(sequence.length, 1)] ?? fallback;
}
