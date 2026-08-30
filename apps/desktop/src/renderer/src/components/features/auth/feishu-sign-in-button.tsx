import { useState } from "react";
import { FeishuIcon } from "@/components/features/auth/feishu-icon";
import { Button } from "@/components/ui/button";
import { withCleanup } from "@/lib/async-control";
import {
  authApiOrigin,
  authClient,
  desktopAppOrigin,
  desktopAuthErrorUrl,
  desktopAuthSuccessUrl,
} from "@/lib/auth-client";
import { env } from "@/env";
import { cn } from "@arc/shared/utils";

interface FeishuSignInButtonProps {
  className?: string;
  label?: string;
  providerId?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
}

/**
 * Feishu OAuth via better-auth. Opens a child BrowserWindow (shared session)
 * that starts the OAuth request first-party on the auth host, so the
 * better-auth state cookie is not dropped as a third-party cookie.
 */
export function FeishuSignInButton({
  className,
  label = "极光员工飞书登录",
  providerId = "feishu",
  variant = "outline",
}: FeishuSignInButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClick = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    let shouldResetSubmitting = true;

    await withCleanup(
      async () => {
        const callbackURL = desktopAuthSuccessUrl();
        const errorCallbackURL = desktopAuthErrorUrl(providerId);

        const oauthResult = await window.api.auth.openOAuth({
          appOrigin: desktopAppOrigin(),
          authApiOrigin: authApiOrigin(),
          authBaseURL: env.VITE_BETTER_AUTH_URL,
          callbackURL,
          errorCallbackURL,
          providerId,
        });

        if (!oauthResult.ok) {
          setErrorMessage(oauthResult.message);
          return;
        }
        if (oauthResult.reason === "closed") {
          // User closed the OAuth window without finishing.
          return;
        }

        const session = await authClient.getSession();
        if (!session.data) {
          setErrorMessage("登录未完成：未拿到会话。请完全退出桌面应用后重试");
          return;
        }

        shouldResetSubmitting = false;
        window.location.hash = "#/";
      },
      () => {
        if (shouldResetSubmitting) {
          setIsSubmitting(false);
        }
      },
    );
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <Button
        className={cn("w-full max-w-sm gap-2", className)}
        disabled={isSubmitting}
        onClick={() => {
          void handleClick();
        }}
        size="lg"
        type="button"
        variant={variant}
      >
        <FeishuIcon className="size-4" />
        {isSubmitting ? "跳转中..." : label}
      </Button>
      {errorMessage ? <p className="text-center text-destructive text-xs">{errorMessage}</p> : null}
    </div>
  );
}
