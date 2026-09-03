import { createShader, playSweep } from "glimm";
import type { ShaderController, SweepHandle } from "glimm";

const glimmCore = { createShader, playSweep };

/** A short, block-local sweep; never keep a WebGL context per saved sentence. */
export function playTranscriptCorrectionSweep(
  block: HTMLElement,
  dependencies = glimmCore,
): (() => void) | undefined {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.className = "pointer-events-none absolute inset-0 size-full";
  canvas.setAttribute("aria-hidden", "true");
  block.append(canvas);

  let shader: ShaderController | null = null;
  let sweep: SweepHandle | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    sweep?.cancel();
    shader?.destroy();
    // destroy() deletes shader resources but does not release the WebGL context.
    canvas.getContext("webgl")?.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.remove();
    shader = null;
    sweep = undefined;
  };

  try {
    shader = dependencies.createShader({ canvas });
    if (!shader) {
      dispose();
      return;
    }
    sweep = dependencies.playSweep(shader, {
      bandTight: 24,
      brightness: 0.9,
      direction: "ltr",
      easing: "easeInOutCubic",
      onComplete: dispose,
      outroMs: 180,
      palette: "prism",
      peakAlpha: 0.4,
      sweepMs: 650,
    });
  } catch {
    // A decorative GPU failure must not interrupt subtitles or recording.
    dispose();
  }
  return dispose;
}
