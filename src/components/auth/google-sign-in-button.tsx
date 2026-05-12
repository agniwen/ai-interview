"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/shared/auth-client";
import { cn } from "@/lib/shared/utils";
import { GoogleIcon } from "./google-icon";

interface GoogleSignInButtonProps {
  callbackURL: string;
  className?: string;
}

export function GoogleSignInButton({ callbackURL, className }: GoogleSignInButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = async () => {
    setIsSubmitting(true);
    const result = await authClient.signIn.social({
      callbackURL,
      errorCallbackURL: "/login?error=google",
      provider: "google",
    });
    if (result.error) {
      setIsSubmitting(false);
    }
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
      {isSubmitting ? "跳转中..." : "使用 Google 账号登录"}
    </Button>
  );
}
