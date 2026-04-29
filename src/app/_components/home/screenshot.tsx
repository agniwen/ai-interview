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
  // 暗色主题展示的截图 / shown on dark UI
  darkSrc: string;
  height: number;
  // 亮色主题展示的截图 / shown on light UI
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

  // 未挂载时使用 darkSrc 占位避免 hydration mismatch；挂载后按当前主题选取
  // Pre-mount: darkSrc placeholder; post-mount: pick by current theme.
  let src = darkSrc;
  if (mounted) {
    src = resolvedTheme === "dark" ? darkSrc : lightSrc;
  }

  return (
    <div
      className={cn(
        // 浅淡半透明边框 + 柔和投影，避免 macOS 拟物边框的违和感
        // Subtle translucent border + soft shadow, no skeuomorphic chrome.
        "relative pointer-events-none select-none overflow-hidden rounded-2xl p-1 bg-foreground/5 shadow-xl ring-1 ring-foreground/5 backdrop-blur",
        className,
      )}
    >
      <Image
        alt={alt}
        className="h-auto w-full rounded-xl"
        height={height}
        priority={priority}
        src={src}
        unoptimized
        width={width}
      />
    </div>
  );
}
