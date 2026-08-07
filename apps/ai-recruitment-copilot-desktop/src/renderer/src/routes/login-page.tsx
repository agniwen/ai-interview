import { FeishuSignInButton } from "@/components/features/auth/feishu-sign-in-button";
import { LoginChromeBar } from "@/components/layout/login-chrome-bar";
import { TITLE_BAR_HEIGHT_PX } from "@/components/layout/chrome";

/**
 * Minimal centered Feishu login — no sidebar / studio chrome.
 */
export function LoginPage(): React.JSX.Element {
  return (
    <main className="flex h-full min-h-0 flex-col bg-background">
      <LoginChromeBar />
      <div className="shrink-0" style={{ height: TITLE_BAR_HEIGHT_PX }} />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-16">
        <div className="flex w-full max-w-sm flex-col items-center gap-8">
          <div className="space-y-2 text-center">
            <h1 className="font-medium text-2xl text-foreground tracking-tight">登录</h1>
            <p className="text-muted-foreground text-sm leading-6">
              使用飞书账号登录后继续使用桌面端。
            </p>
          </div>

          <div className="flex w-full flex-col items-center gap-3">
            <FeishuSignInButton />
            <FeishuSignInButton
              label="极光 HR 飞书登录"
              providerId="feishu-jiguang-hr"
              variant="default"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
