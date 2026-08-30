// 用途：landing page 的简化版 UI 画板。固定 1600×900 内部画布，通过 container query
// scale 到容器实际宽度，保持像素级布局的精确性同时随容器自适应。
// Purpose: fixed 1600x900 inner canvas scaled to fit container width via cqi units,
// keeping pixel-perfect mock layout while flexing to outer width.
import type { ReactNode } from "react";
import { cn } from "@arc/shared/utils";

const WINDOW_CONTROL_BASE_CLASS =
  "relative size-3.5 overflow-hidden rounded-full shadow-[inset_0_1px_1px_rgb(255_255_255_/_0.18)]";

const WINDOW_CONTROLS = [
  {
    colorClass: "bg-[linear-gradient(145deg,#df3e47_0%,#ff5c5f_52%,#ff9196_100%)]",
    name: "close",
  },
  {
    colorClass: "bg-[linear-gradient(145deg,#d69400_0%,#ffc400_52%,#ffe184_100%)]",
    name: "minimize",
  },
  {
    colorClass: "bg-[linear-gradient(145deg,#218b3d_0%,#32bd56_52%,#99df7a_100%)]",
    name: "zoom",
  },
] as const;

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
      data-slot="screen-frame"
      className={cn(
        "relative pointer-events-none overflow-hidden rounded-xl bg-background/75 p-1 select-none backdrop-blur-sm",
        className,
      )}
    >
      {chrome ? (
        <div className="flex h-7 flex-row items-center">
          <div className="flex gap-2 px-2">
            {WINDOW_CONTROLS.map(({ colorClass, name }) => (
              <span
                aria-hidden="true"
                className={cn(WINDOW_CONTROL_BASE_CLASS, colorClass)}
                data-window-control={name}
                key={name}
              />
            ))}
          </div>
        </div>
      ) : null}
      <div
        data-slot="screen-frame-content"
        className="relative aspect-[1600/900] w-full overflow-hidden rounded-lg bg-background"
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
