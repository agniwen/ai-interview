"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { env } from "@/env/client";
import { authClient } from "@/lib/client/auth-client";
import { toWebAbsoluteUrl } from "@/lib/client/auth-redirect-url";
import { withCleanup } from "@/lib/client/async-control";
import * as m from "@/paraglide/messages";
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
  label = m.login_jiguang_employee_feishu(),
  variant = "outline",
  providerId = "feishu",
}: FeishuSignInButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = async () => {
    setIsSubmitting(true);
    let shouldResetSubmitting = true;
    await withCleanup(
      async () => {
        const result = await authClient.signIn.social({
          callbackURL: toWebAbsoluteUrl(callbackURL, env.NEXT_PUBLIC_BASE_URL),
          errorCallbackURL: toWebAbsoluteUrl(
            `/login?error=${encodeURIComponent(providerId)}`,
            env.NEXT_PUBLIC_BASE_URL,
          ),
          provider: providerId,
        });
        shouldResetSubmitting = Boolean(result.error);
      },
      () => {
        if (shouldResetSubmitting) {
          setIsSubmitting(false);
        }
      },
    );
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
      {isSubmitting ? m.login_redirecting() : label}
    </Button>
  );
}
