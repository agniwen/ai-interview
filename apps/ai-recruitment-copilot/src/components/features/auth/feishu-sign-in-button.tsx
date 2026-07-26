"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/client/auth-client";
import { cn } from "@arc/shared/utils";
import { FeishuIcon } from "./feishu-icon";

interface FeishuSignInButtonProps {
  callbackURL: string;
  className?: string;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  providerId?: string;
}

export function FeishuSignInButton({
  callbackURL,
  className,
  label = "极光员工飞书登录",
  variant = "outline",
  providerId = "feishu",
}: FeishuSignInButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = async () => {
    setIsSubmitting(true);
    let shouldResetSubmitting = true;
    try {
      const result = await authClient.signIn.oauth2({
        callbackURL,
        errorCallbackURL: `/login?error=${encodeURIComponent(providerId)}`,
        providerId,
      });
      shouldResetSubmitting = Boolean(result.error);
    } finally {
      if (shouldResetSubmitting) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Button
      className={cn("w-full gap-2", className)}
      disabled={isSubmitting}
      onClick={handleClick}
      size="lg"
      type="button"
      variant={variant}
    >
      <FeishuIcon className="size-4" />
      {isSubmitting ? "跳转中..." : label}
    </Button>
  );
}
