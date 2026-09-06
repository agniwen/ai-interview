import { createContext, useContext } from "react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@app/shared/utils";

export const RecruitingActionBusyContext = createContext<string | null>(null);

/** 保留直接 button DOM，禁用时仍可聚焦与悬停，避免破坏浮动栏按钮组边角。 */
export function RecruitingActionButton({
  disabledReason,
  disabled,
  isLoading = false,
  className,
  ...props
}: ComponentProps<typeof Button> & {
  disabledReason?: string | null;
  /** 按钮已有加载图标或文案时，保留禁用但不重复显示提示。 */
  isLoading?: boolean;
}) {
  const busyReason = useContext(RecruitingActionBusyContext);
  const reason = busyReason ?? disabledReason ?? (disabled ? "正在提交，请稍候" : null);
  const button = (
    <Button
      {...props}
      aria-busy={isLoading || undefined}
      className={cn(
        "aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:shadow-none aria-disabled:active:scale-100",
        className,
      )}
      disabled={isLoading || Boolean(reason)}
      focusableWhenDisabled
    />
  );
  return reason && !isLoading ? (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  ) : (
    button
  );
}
