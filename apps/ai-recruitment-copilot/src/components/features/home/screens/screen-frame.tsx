// 用途：landing page 的简化版 UI 画板。固定 1400×900 内部画布，通过 container query
// scale 到容器实际宽度，保持像素级布局的精确性同时随容器自适应。
// Purpose: fixed 1400x900 inner canvas scaled to fit container width via cqi units,
// keeping pixel-perfect mock layout while flexing to outer width.
import type { ReactNode } from "react";
import { cn } from "@arc/shared/utils";

interface ScreenFrameProps {
  children: ReactNode;
  className?: string;
  // 是否显示窗口顶部的 macOS 三色点（与原 Screenshot 等价的外观）
  // Show the macOS-style traffic-light dots on top of the window
  chrome?: boolean;
}

export function ScreenFrame({ children, className }: ScreenFrameProps) {
  return (
    <div
      className={cn(
        "relative pointer-events-none select-none overflow-hidden rounded-lg shadow-xl ring-1 ring-foreground/5 backdrop-blur",
        // " bg-background/60",
        className,
      )}
    >
      {/* {chrome ? (
        <div className="flex h-6 flex-row items-center">
          <div className="flex gap-2 px-2">
            <i className="size-3 rounded-full bg-[#F0A7A9]" />
            <i className="size-3 rounded-full bg-[#E8D481]" />
            <i className="size-3 rounded-full bg-[#9FD8AE]" />
          </div>
        </div>
      ) : null} */}
      <div
        className="relative aspect-[1600/900] w-full overflow-hidden rounded-md border border-border bg-background/20"
        style={{ containerType: "inline-size" }}
      >
        <div
          className="absolute top-0 left-0"
          style={{
            height: 900,
            transform: "scale(calc(100cqi / 1600px))",
            transformOrigin: "top left",
            width: 1600,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
