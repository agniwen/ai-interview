import { useEffect, useRef } from "react";

const readPixels = (value: string) => Number.parseFloat(value) || 0;
const singleLinePaddingEnd = "3.5rem";

function measureMultilineInput(shell: HTMLElement, input: HTMLElement) {
  const measurement = input.cloneNode(true);
  if (!(measurement instanceof HTMLElement)) {
    return false;
  }
  measurement.removeAttribute("contenteditable");
  measurement.removeAttribute("role");
  measurement.setAttribute("aria-hidden", "true");
  measurement.style.position = "absolute";
  measurement.style.top = "0";
  measurement.style.insetInlineStart = "0";
  measurement.style.width = `${input.getBoundingClientRect().width}px`;
  measurement.style.height = "auto";
  measurement.style.maxHeight = "none";
  measurement.style.overflow = "visible";
  measurement.style.paddingInlineEnd = singleLinePaddingEnd;
  measurement.style.pointerEvents = "none";
  measurement.style.visibility = "hidden";
  shell.append(measurement);

  const style = getComputedStyle(measurement);
  const singleLineHeight =
    readPixels(style.lineHeight) + readPixels(style.paddingTop) + readPixels(style.paddingBottom);
  const isMultiline = measurement.scrollHeight > singleLineHeight + 1;
  measurement.remove();
  return isMultiline;
}

export function useRecruitingComposerShellLayout() {
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const shell = shellRef.current;
    const input = shell?.querySelector<HTMLElement>(".aui-lexical-input");
    if (!(shell && input)) {
      return;
    }

    let animationFrame: number | null = null;
    const syncLayout = () => {
      shell.toggleAttribute("data-multiline", measureMultilineInput(shell, input));
    };
    const scheduleLayoutSync = () => {
      if (animationFrame !== null) {
        return;
      }
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        syncLayout();
      });
    };

    const resizeObserver = new ResizeObserver(scheduleLayoutSync);
    const mutationObserver = new MutationObserver(scheduleLayoutSync);
    resizeObserver.observe(input);
    mutationObserver.observe(input, { characterData: true, childList: true, subtree: true });
    scheduleLayoutSync();

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      delete shell.dataset.multiline;
    };
  }, []);

  return shellRef;
}
