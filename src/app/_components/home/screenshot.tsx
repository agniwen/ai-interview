// 用途：根据当前主题反向选择截图（暗色页面用亮色截图，反之亦然）
// Purpose: pick a theme-inverse screenshot asset for stronger visual contrast.
"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ScreenshotProps {
  alt: string;
  className?: string;
  // 显示在亮色 UI 中的暗色截图 / shown on light UI
  darkSrc: string;
  height: number;
  // 显示在暗色 UI 中的亮色截图 / shown on dark UI
  lightSrc: string;
  priority?: boolean;
  width: number;
}

export function Screenshot({
  alt,
  className,
  darkSrc,
  height,
  lightSrc,
  priority,
  width,
}: ScreenshotProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 未挂载时统一用 darkSrc 占位，避免 hydration mismatch
  // Pre-mount: use darkSrc as placeholder to avoid hydration mismatch.
  let src = darkSrc;
  if (mounted) {
    src = resolvedTheme === "dark" ? lightSrc : darkSrc;
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-primary/15 bg-primary/5 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.45)] ring-1 ring-primary/10 backdrop-blur",
        className,
      )}
    >
      <Image
        alt={alt}
        className="h-auto w-full"
        height={height}
        priority={priority}
        src={src}
        width={width}
      />
    </div>
  );
}
