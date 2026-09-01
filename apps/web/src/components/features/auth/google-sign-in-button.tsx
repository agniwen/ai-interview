"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { env } from "@/env/client";
import { authClient } from "@/lib/client/auth-client";
import { toWebAbsoluteUrl } from "@/lib/client/auth-redirect-url";
import { withCleanup } from "@/lib/client/async-control";
import * as m from "@/paraglide/messages";
import { cn } from "@arc/shared/utils";
import { GoogleIcon } from "./google-icon";

interface GoogleSignInButtonProps {
  callbackURL: string;
  className?: string;
}

export function GoogleSignInButton({ callbackURL, className }: GoogleSignInButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = async () => {
    setIsSubmitting(true);
    let shouldResetSubmitting = true;
    await withCleanup(
      async () => {
        const result = await authClient.signIn.social({
          callbackURL: toWebAbsoluteUrl(callbackURL, env.NEXT_PUBLIC_BASE_URL),
          errorCallbackURL: toWebAbsoluteUrl("/login?error=google", env.NEXT_PUBLIC_BASE_URL),
          provider: "google",
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
      variant="outline"
    >
      <GoogleIcon className="size-4" />
      {isSubmitting ? m.login_redirecting() : m.login_google_button()}
    </Button>
  );
}
