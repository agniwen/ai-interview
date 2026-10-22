// 首屏 CSS 入场动画（tw-animate-css 的 animate-in）期间推迟重活，避免和入场抢主线程与 GPU。
// Defers heavy work until first-screen CSS entrance animations (tw-animate-css `animate-in`) finish,
// so it does not compete with them for the main thread and GPU.

/** tw-animate-css 的 animate-in 关键帧名。 Keyframes name behind tw-animate-css `animate-in`. */
const ENTRANCE_KEYFRAMES = "enter";
/** 没有 requestIdleCallback 时的退路延迟。 Fallback delay where requestIdleCallback is missing. */
const IDLE_FALLBACK_MS = 120;

export function runningEntranceAnimations(): Animation[] {
  // jsdom 等环境没有 getAnimations。 Some environments (e.g. jsdom) lack getAnimations.
  if (!("getAnimations" in document)) {
    return [];
  }
  return document
    .getAnimations()
    .filter(
      (animation) =>
        animation instanceof CSSAnimation &&
        animation.animationName === ENTRANCE_KEYFRAMES &&
        animation.playState !== "finished",
    );
}

/** 等页面上正在播放的入场动画全部结束（被取消也算结束）。 Resolves once running entrances end or cancel. */
export async function waitForEntranceAnimations(): Promise<void> {
  await Promise.allSettled(runningEntranceAnimations().map((animation) => animation.finished));
}

/** 下一个空闲时段；Safari 等没有 requestIdleCallback 时退回短延迟。 Next idle period, or a short delay. */
export async function waitForIdle(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<null>();
  if ("requestIdleCallback" in globalThis) {
    globalThis.requestIdleCallback(() => resolve(null));
  } else {
    globalThis.setTimeout(() => resolve(null), IDLE_FALLBACK_MS);
  }
  await promise;
}
