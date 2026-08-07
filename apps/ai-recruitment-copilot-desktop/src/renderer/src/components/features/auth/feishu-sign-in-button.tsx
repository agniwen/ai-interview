import { useState } from "react";
import { FeishuIcon } from "@/components/features/auth/feishu-icon";
import { Button } from "@/components/ui/button";
import { withCleanup } from "@/lib/async-control";
import { authClient, desktopAuthErrorUrl, desktopAuthSuccessUrl } from "@/lib/auth-client";
import { cn } from "@arc/shared/utils";

interface FeishuSignInButtonProps {
  className?: string;
  label?: string;
  providerId?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
}

/**
 * Feishu OAuth via better-auth. Opens a child BrowserWindow (shared session)
 * instead of navigating the app shell away.
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
        const successUrl = desktopAuthSuccessUrl();
        const result = await authClient.signIn.oauth2({
          callbackURL: successUrl,
          errorCallbackURL: desktopAuthErrorUrl(providerId),
          providerId,
        });

        if (result.error) {
          setErrorMessage(result.error.message ?? "登录失败");
          return;
        }

        const oauthUrl = result.data?.url;
        if (!oauthUrl) {
          setErrorMessage("未能获取飞书授权地址");
          return;
        }

        const oauthResult = await window.api.auth.openOAuth(oauthUrl, successUrl);
        if (!oauthResult.ok) {
          setErrorMessage(oauthResult.message);
          return;
        }
        if (oauthResult.reason === "closed") {
          // User closed the OAuth window without finishing.
          return;
        }

        // Session cookie should now be in the shared Electron session.
        const session = await authClient.getSession();
        if (!session.data) {
          setErrorMessage("登录未完成，请重试");
          return;
        }

        shouldResetSubmitting = false;
        // Hash router: send the shell to home after a successful bounce.
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
