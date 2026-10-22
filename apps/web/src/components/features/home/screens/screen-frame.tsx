// 用途：landing page 的简化版 UI 画板。固定 1440×856 内部画布，通过 container query
// scale 到容器实际宽度，保持像素级布局的精确性同时随容器自适应。
// 横向比例接近桌面浏览器，列表与详情可以铺开展示。
// Purpose: fixed 1440x856 inner canvas scaled to fit container width via cqi units,
// keeping pixel-perfect mock layout while flexing to outer width.
import type { ReactNode } from "react";
import { cn } from "@app/shared/utils";

export const DEMO_CANVAS_WIDTH = 1440;
export const DEMO_CANVAS_HEIGHT = 856;

interface ScreenFrameProps {
  children: ReactNode;
  className?: string;
}

// 不再模仿 macOS 窗口：去掉标题栏与内边距，把高度留给演示内容。
// No faux macOS chrome: the title bar and padding go, leaving the height to the demo.
export function ScreenFrame({ children, className }: ScreenFrameProps) {
  return (
    <div
      data-slot="screen-frame"
      className={cn(
        "relative overflow-hidden rounded-[12px] bg-background shadow-extra-large select-none",
        className,
      )}
    >
      <div
        data-slot="screen-frame-content"
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: `${DEMO_CANVAS_WIDTH} / ${DEMO_CANVAS_HEIGHT}`,
          containerType: "inline-size",
        }}
      >
        <div
          className="absolute top-0 left-0"
          style={{
            height: DEMO_CANVAS_HEIGHT,
            transform: `scale(calc(100cqi / ${DEMO_CANVAS_WIDTH}px))`,
            transformOrigin: "top left",
            width: DEMO_CANVAS_WIDTH,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
