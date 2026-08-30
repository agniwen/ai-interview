export function syncScrollProgress(source: HTMLElement, target: HTMLElement): number {
  const sourceScrollRange = source.scrollHeight - source.clientHeight;
  const sourceProgress =
    sourceScrollRange > 0 ? Math.min(1, Math.max(0, source.scrollTop / sourceScrollRange)) : 0;
  const targetScrollTop = sourceProgress * Math.max(0, target.scrollHeight - target.clientHeight);
  if (Math.abs(target.scrollTop - targetScrollTop) >= 0.5) {
    target.scrollTop = targetScrollTop;
  }
  return targetScrollTop;
}
