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
        "relative overflow-hidden rounded-2xl border border-primary/15 bg-background/40 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.55)] ring-1 ring-primary/10 backdrop-blur",
        className,
      )}
    >
      {/* macOS 风格的窗口标题栏，让截图看起来像独立产品视图
          macOS-style window chrome to make screenshots feel like standalone product shots. */}
      <div className="flex items-center gap-1.5 border-primary/10 border-b bg-background/60 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
      </div>
      <Image
        alt={alt}
        className="h-auto w-full"
        height={height}
        priority={priority}
        src={src}
        unoptimized
        width={width}
      />
    </div>
  );
}
