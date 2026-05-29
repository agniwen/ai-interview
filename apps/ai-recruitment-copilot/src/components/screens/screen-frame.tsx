// 用途：landing page 的简化版 UI 画板。固定 1440×900 内部画布，通过 container query
// scale 到容器实际宽度，保持像素级布局的精确性同时随容器自适应。
// Purpose: fixed 1440x900 inner canvas scaled to fit container width via cqi units,
// keeping pixel-perfect mock layout while flexing to outer width.
import type { ReactNode } from "react";
import { cn } from "@/lib/shared/utils";

interface ScreenFrameProps {
  children: ReactNode;
  className?: string;
  // 是否显示窗口顶部的 macOS 三色点（与原 Screenshot 等价的外观）
  // Show the macOS-style traffic-light dots on top of the window
  chrome?: boolean;
}

export function ScreenFrame({ children, className, chrome = true }: ScreenFrameProps) {
  return (
    <div
      className={cn(
        "relative pointer-events-none select-none overflow-hidden rounded-lg bg-background/60 px-1 pt-1 pb-1 shadow-xl ring-1 ring-foreground/5 backdrop-blur",
        className,
      )}
    >
      {chrome ? (
        <div className="flex h-6 flex-row items-center">
          <div className="flex gap-2 px-2">
            <i className="size-3 rounded-full bg-[#FF5C5F]" />
            <i className="size-3 rounded-full bg-[#FAC800]" />
            <i className="size-3 rounded-full bg-[#34C759]" />
          </div>
        </div>
      ) : null}
      <div
        className="relative aspect-[1440/900] w-full overflow-hidden rounded-md border border-border bg-background"
        style={{ containerType: "inline-size" }}
      >
        <div
          className="absolute top-0 left-0"
          style={{
            height: 900,
            transform: "scale(calc(100cqi / 1440px))",
            transformOrigin: "top left",
            width: 1440,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
