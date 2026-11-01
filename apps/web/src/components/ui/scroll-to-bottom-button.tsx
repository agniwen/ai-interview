import { IconArrowDown } from "@tabler/icons-react";
import type { ComponentProps } from "react";
import { cn } from "@app/shared/utils";
import { Button } from "@/components/ui/button";

/**
 * 对话类滚动区统一的「回到底部」按钮：白色 outline 圆形图标按钮；显隐与定位由调用方负责。
 * Shared scroll-to-bottom button for conversation scroll areas; callers own visibility and placement.
 */
export function ScrollToBottomButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      aria-label="回到底部"
      className={cn("size-8 rounded-full", className)}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      <IconArrowDown className="size-4" />
    </Button>
  );
}
