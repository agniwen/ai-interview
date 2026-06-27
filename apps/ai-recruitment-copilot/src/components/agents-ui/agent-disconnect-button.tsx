"use client";

import { IconPhoneOff } from "@tabler/icons-react";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import type { buttonVariants } from "@/components/ui/button";
import { useSessionContext } from "@livekit/components-react";

import { Button } from "@/components/ui/button";
import { cn } from "@arc/shared/utils";

/**
 * Props for the AgentDisconnectButton component.
 */
export interface AgentDisconnectButtonProps
  extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  /**
   * Custom icon to display. Defaults to IconPhoneOff.
   */
  icon?: React.ReactNode;
  /**
   * The size of the button.
   * @default 'default'
   */
  size?: "default" | "sm" | "lg" | "icon";
  /**
   * The variant of the button.
   * @default 'destructive'
   */
  variant?: "default" | "outline" | "destructive" | "ghost" | "link";
  /**
   * The children to render.
   */
  children?: React.ReactNode;
  /**
   * The callback for when the button is clicked.
   */
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * A button to disconnect from the current agent session.
 * Calls the session's end() method when clicked.
 *
 * @extends ComponentProps<'button'>
 *
 * @example
 * ```tsx
 * <AgentDisconnectButton onClick={() => console.log('Disconnecting...')} />
 * ```
 */
export function AgentDisconnectButton({
  icon,
  size = "default",
  variant = "destructive",
  children,
  onClick,
  ...props
}: AgentDisconnectButtonProps) {
  const { end } = useSessionContext();
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick(event);
      return;
    }
    if (typeof end === "function") {
      end();
    }
  };

  return (
    <Button size={size} variant={variant} onClick={handleClick} type="button" {...props}>
      {icon ?? <IconPhoneOff />}
      {children ?? <span className={cn(size?.includes("icon") && "sr-only")}>结束面试</span>}
    </Button>
  );
}
