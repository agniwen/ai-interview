// body 上 OverlayScrollbars 初始化完成的信号。初始化会重排整页（约 100ms 主线程），
// 其他重活（如首屏 shader）等它结束再开始，避免两者叠在同一段动画里。
// Signals that body OverlayScrollbars finished initializing. Initialization re-lays out the whole
// page (~100ms of main thread), so other heavy work (e.g. the hero shader) starts after it.

/** 初始化被取消或迟迟不发生时的兜底等待。 Fallback when initialization is cancelled or never happens. */
const BODY_SCROLLBARS_TIMEOUT_MS = 3000;

const bodyScrollbars = Promise.withResolvers<null>();

export function markBodyScrollbarsReady() {
  bodyScrollbars.resolve(null);
}

export async function waitForBodyScrollbars(): Promise<void> {
  const timeout = Promise.withResolvers<null>();
  const timer = globalThis.setTimeout(() => timeout.resolve(null), BODY_SCROLLBARS_TIMEOUT_MS);
  await Promise.race([bodyScrollbars.promise, timeout.promise]);
  globalThis.clearTimeout(timer);
}
