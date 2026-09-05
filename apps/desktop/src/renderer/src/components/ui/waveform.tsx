import { useCallback, useEffect, useRef, useState, type HTMLAttributes } from "react";
import { cn } from "@app/shared/utils";

export type WaveformProps = HTMLAttributes<HTMLDivElement> & {
  barColor?: string;
  barGap?: number;
  barHeight?: number;
  barRadius?: number;
  barWidth?: number;
  data?: number[];
  fadeEdges?: boolean;
  fadeWidth?: number;
  height?: number | string;
  onBarClick?: (index: number, value: number) => void;
};

export function Waveform({
  barColor,
  barGap = 2,
  barHeight: baseBarHeight = 4,
  barRadius = 2,
  barWidth = 4,
  className,
  data = [],
  fadeEdges = true,
  fadeWidth = 24,
  height = 128,
  onBarClick,
  ...props
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const heightStyle = typeof height === "number" ? `${height}px` : height;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!(canvas && container)) {
      return;
    }

    const renderWaveform = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      const computedStyle = getComputedStyle(canvas);
      const computedBarColor = barColor?.startsWith("--")
        ? computedStyle.getPropertyValue(barColor)
        : barColor || computedStyle.getPropertyValue("--foreground") || "#000";
      const barCount = Math.floor(rect.width / (barWidth + barGap));
      const centerY = rect.height / 2;
      for (let index = 0; index < barCount; index += 1) {
        const dataIndex = Math.floor((index / barCount) * data.length);
        const value = data[dataIndex] ?? 0;
        const nextBarHeight = Math.max(baseBarHeight, value * rect.height * 0.8);
        const x = index * (barWidth + barGap);
        const y = centerY - nextBarHeight / 2;
        ctx.fillStyle = computedBarColor;
        ctx.globalAlpha = 0.3 + value * 0.7;
        if (barRadius > 0) {
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, nextBarHeight, barRadius);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barWidth, nextBarHeight);
        }
      }
      if (fadeEdges && fadeWidth > 0 && rect.width > 0) {
        const gradient = ctx.createLinearGradient(0, 0, rect.width, 0);
        const fadePercent = Math.min(0.2, fadeWidth / rect.width);
        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(fadePercent, "rgba(255,255,255,0)");
        gradient.addColorStop(1 - fadePercent, "rgba(255,255,255,0)");
        gradient.addColorStop(1, "rgba(255,255,255,1)");
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = 1;
    };

    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        renderWaveform();
      }
    });
    resizeObserver.observe(container);
    renderWaveform();
    return () => resizeObserver.disconnect();
  }, [barColor, barGap, barRadius, barWidth, baseBarHeight, data, fadeEdges, fadeWidth]);

  return (
    <div
      className={cn("relative", className)}
      ref={containerRef}
      style={{ height: heightStyle }}
      {...props}
    >
      <canvas
        className="block size-full"
        onClick={(event) => {
          if (!onBarClick) {
            return;
          }
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) {
            return;
          }
          const barIndex = Math.floor((event.clientX - rect.left) / (barWidth + barGap));
          const dataIndex = Math.floor(
            (barIndex * data.length) / Math.floor(rect.width / (barWidth + barGap)),
          );
          const value = data[dataIndex];
          if (dataIndex >= 0 && value !== undefined) {
            onBarClick(dataIndex, value);
          }
        }}
        ref={canvasRef}
      />
    </div>
  );
}

export type AudioScrubberProps = WaveformProps & {
  currentTime?: number;
  duration?: number;
  onSeek?: (time: number) => void;
  progressBarColor?: string;
  showHandle?: boolean;
};

export function AudioScrubber({
  barColor,
  barGap = 1,
  barHeight,
  barRadius = 1,
  barWidth = 3,
  className,
  currentTime = 0,
  data = [],
  duration = 0,
  fadeEdges = false,
  fadeWidth,
  height = 48,
  onSeek,
  progressBarColor = "--primary",
  showHandle = true,
  ...props
}: AudioScrubberProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const waveformData = data;

  useEffect(() => {
    if (!isDragging && duration > 0) {
      setLocalProgress(currentTime / duration);
    }
  }, [currentTime, duration, isDragging]);

  const handleScrub = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container || duration <= 0) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setLocalProgress(progress);
      onSeek?.(progress * duration);
    },
    [duration, onSeek],
  );

  useEffect(() => {
    if (!isDragging) {
      return;
    }
    const handleMouseMove = (event: MouseEvent) => {
      handleScrub(event.clientX);
    };
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleScrub, isDragging]);

  const heightStyle = typeof height === "number" ? `${height}px` : height;

  return (
    <div
      aria-label="录音波形"
      aria-valuemax={duration}
      aria-valuemin={0}
      aria-valuenow={currentTime}
      className={cn("relative cursor-pointer select-none", className)}
      onMouseDown={(event) => {
        event.preventDefault();
        setIsDragging(true);
        handleScrub(event.clientX);
      }}
      ref={containerRef}
      role="slider"
      style={{ height: heightStyle }}
      tabIndex={0}
      {...props}
    >
      <Waveform
        barColor={barColor}
        barGap={barGap}
        barHeight={barHeight}
        barRadius={barRadius}
        barWidth={barWidth}
        className="opacity-60"
        data={waveformData}
        fadeEdges={fadeEdges}
        fadeWidth={fadeWidth}
        height="100%"
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ clipPath: `inset(0 ${(1 - localProgress) * 100}% 0 0)` }}
      >
        <Waveform
          barColor={progressBarColor}
          barGap={barGap}
          barHeight={barHeight}
          barRadius={barRadius}
          barWidth={barWidth}
          data={waveformData}
          fadeEdges={fadeEdges}
          fadeWidth={fadeWidth}
          height="100%"
        />
      </div>
      {showHandle ? (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary"
            style={{ left: `${localProgress * 100}%` }}
          />
          <div
            className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow-sm"
            style={{ left: `${localProgress * 100}%` }}
          />
        </>
      ) : null}
    </div>
  );
}
