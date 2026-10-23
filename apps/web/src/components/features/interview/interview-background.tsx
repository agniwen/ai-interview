"use client";

import { useEffect, useRef } from "react";

// Sparkling square grain behind the candidate entry pages. Squares sit on a fixed lattice; each one
// picks an opacity and re-rolls it on its own staggered beat, a slowly drifting low-frequency field
// makes some regions darker and others lighter, and the grain reveals outward from the centre.
const CELL_SIZE = 7;
const DOT_SIZE = 2;
const DOT_OPACITIES = [0.08, 0.08, 0.08, 0.08, 0.16, 0.16, 0.16, 0.24, 0.24, 0.36] as const;
// Size of the light/dark patches in cells, their drift speed, and the weight range they apply.
const FIELD_SCALE = 18;
const FIELD_DRIFT_CELLS_PER_SECOND = 0.35;
const FIELD_MIN_WEIGHT = 0.05;
const FIELD_MAX_WEIGHT = 1.6;
const OPACITY_STEPS = 50;
const FLICKER_PERIOD_SECONDS = 5;
const REVEAL_SPEED = 0.6;
// Distance from the centre (in cells) and per-cell jitter that delay each square's reveal.
const REVEAL_DISTANCE_DELAY = 0.01;
const REVEAL_JITTER = 0.15;
const REVEAL_FLASH_SECONDS = 0.1;
const REVEAL_FLASH_GAIN = 1.25;
const FRAME_INTERVAL_MS = 100;

/** Deterministic per-cell noise in [0, 1). */
function hashCell(x: number, y: number, salt: number) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43_758.5453;
  return value - Math.floor(value);
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

/** Smooth value noise in [0, 1) sampled in cell units. */
function valueNoise(x: number, y: number, salt: number) {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const blendX = smoothstep(x - left);
  const blendY = smoothstep(y - top);
  const upper =
    hashCell(left, top, salt) +
    (hashCell(left + 1, top, salt) - hashCell(left, top, salt)) * blendX;
  const lower =
    hashCell(left, top + 1, salt) +
    (hashCell(left + 1, top + 1, salt) - hashCell(left, top + 1, salt)) * blendX;
  return upper + (lower - upper) * blendY;
}

/** Light/dark patch weight for a cell; two octaves keep the patches organic. */
function patchWeight(x: number, y: number, seconds: number) {
  const drift = seconds * FIELD_DRIFT_CELLS_PER_SECOND;
  const coarse = valueNoise((x + drift) / FIELD_SCALE, (y - drift * 0.6) / FIELD_SCALE, 11);
  const fine = valueNoise((x - drift) / (FIELD_SCALE / 2.5), (y + drift) / (FIELD_SCALE / 2.5), 23);
  const field = smoothstep(Math.min(1, Math.max(0, (coarse * 0.7 + fine * 0.3 - 0.2) / 0.6)));
  return FIELD_MIN_WEIGHT + (FIELD_MAX_WEIGHT - FIELD_MIN_WEIGHT) * field;
}

function cellOpacity(x: number, y: number, centerX: number, centerY: number, seconds: number) {
  const phase = hashCell(x, y, 0);
  const epoch = Math.floor(seconds / FLICKER_PERIOD_SECONDS + phase);
  const opacity =
    (DOT_OPACITIES[Math.floor(hashCell(x, y, epoch + 1) * DOT_OPACITIES.length)] ?? 0) *
    patchWeight(x, y, seconds);
  const revealAt =
    Math.hypot(x - centerX, y - centerY) * REVEAL_DISTANCE_DELAY +
    hashCell(x, y, -1) * REVEAL_JITTER;
  const progress = seconds * REVEAL_SPEED;
  if (progress < revealAt) {
    return 0;
  }
  return progress < revealAt + REVEAL_FLASH_SECONDS ? opacity * REVEAL_FLASH_GAIN : opacity;
}

function drawGrid(canvas: HTMLCanvasElement, seconds: number) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const ratio = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = getComputedStyle(canvas).color;

  const columns = Math.ceil(width / CELL_SIZE);
  const rows = Math.ceil(height / CELL_SIZE);
  const offsetX = (width - columns * CELL_SIZE + CELL_SIZE - DOT_SIZE) / 2;
  const offsetY = (height - rows * CELL_SIZE + CELL_SIZE - DOT_SIZE) / 2;
  // Batch squares by opacity so each frame issues a handful of fills instead of one per cell.
  const paths = new Map<number, Path2D>();
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const opacity =
        Math.round(Math.min(1, cellOpacity(x, y, columns / 2, rows / 2, seconds)) * OPACITY_STEPS) /
        OPACITY_STEPS;
      if (opacity === 0) {
        continue;
      }
      let path = paths.get(opacity);
      if (!path) {
        path = new Path2D();
        paths.set(opacity, path);
      }
      path.rect(offsetX + x * CELL_SIZE, offsetY + y * CELL_SIZE, DOT_SIZE, DOT_SIZE);
    }
  }
  for (const [opacity, path] of paths) {
    context.globalAlpha = opacity;
    context.fill(path);
  }
  context.globalAlpha = 1;
}

/** Page surface with a sparkling square grain, faint around the content and denser toward the edges. */
export function InterviewEntryBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reducedMotion) {
      // Fully revealed, frozen grid.
      const staticSeconds = 60;
      const redraw = () => drawGrid(canvas, staticSeconds);
      redraw();
      window.addEventListener("resize", redraw);
      return () => window.removeEventListener("resize", redraw);
    }

    const startedAt = performance.now();
    let frame = 0;
    let lastDrawnAt = Number.NEGATIVE_INFINITY;
    const tick = (now: number) => {
      if (now - lastDrawnAt >= FRAME_INTERVAL_MS) {
        lastDrawnAt = now;
        drawGrid(canvas, (now - startedAt) / 1000);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-background">
      <canvas
        className="absolute inset-0 size-full text-[rgb(10_10_10)] opacity-50 [mask-image:radial-gradient(ellipse_at_center,rgb(0_0_0/0.12)_15%,black_80%)] dark:text-white"
        ref={canvasRef}
      />
    </div>
  );
}
