import type { AnimationPlaybackControlsWithThen, ValueAnimationTransition } from "motion/react";
import { animate, useMotionValue, useMotionValueEvent } from "motion/react";
import { useCallback, useRef, useState } from "react";

/**
 * 把 motion `useMotionValue` 包装成"既能用作动画目标，又能在 React state 中读取"的工具。
 * Wraps motion's `useMotionValue` so it can be both animated and read as React state.
 *
 * 之所以抽出来，是因为多个语音可视化 hook（aura / wave）使用了完全相同的实现，
 * 抽离后只需维护一处。返回值：
 *  - `value`：跟随动画自动同步的最新值；
 *  - `motionValue`：底层 MotionValue，可继续传给其他 motion API；
 *  - `animate(target, transition)`：触发一次动画并保留 controls；
 *  - `controls`：当前动画 controls 引用，可手动暂停 / 取消。
 *
 * Extracted because the same implementation existed verbatim in multiple visualizer
 * hooks (aura / wave). Returns:
 *  - `value` — the latest value synced from the animation;
 *  - `motionValue` — the underlying MotionValue, forwardable to other motion APIs;
 *  - `animate(target, transition)` — kicks off an animation and stores its controls;
 *  - `controls` — ref to the currently active controls (for manual pause / cancel).
 */
export function useAnimatedValue<T>(initialValue: T) {
  const [value, setValue] = useState(initialValue);
  const motionValue = useMotionValue(initialValue);
  const controlsRef = useRef<AnimationPlaybackControlsWithThen | null>(null);

  useMotionValueEvent(motionValue, "change", (next) => setValue(next as T));

  const animateFn = useCallback(
    (targetValue: T | T[], transition: ValueAnimationTransition) => {
      controlsRef.current = animate(motionValue, targetValue, transition);
    },
    [motionValue],
  );

  return { animate: animateFn, controls: controlsRef, motionValue, value };
}
