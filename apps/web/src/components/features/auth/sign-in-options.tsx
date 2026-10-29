import { env } from "@/env/client";
import * as messages from "@/paraglide/messages";
import { EmailPasswordSignInForm } from "./email-password-sign-in-form";
import { FeishuSignInButtons } from "./feishu-sign-in-buttons";
import { GoogleSignInButton } from "./google-sign-in-button";

const SHOW_GOOGLE_LOGIN = env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN;

interface SignInOptionsProps {
  /** 登录成功后跳转目标 / Where to navigate once signed in. */
  callbackURL: string;
}

/**
 * 第三方登录与账号密码登录同屏展示，中间用分隔线隔开。Google 与飞书互斥：开启 Google 时隐藏飞书。
 * Third-party and password sign-in share one screen, split by a divider. Google and Feishu are
 * mutually exclusive: enabling Google hides Feishu.
 */
export function SignInOptions({ callbackURL }: SignInOptionsProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {SHOW_GOOGLE_LOGIN ? (
          <GoogleSignInButton callbackURL={callbackURL} />
        ) : (
          <FeishuSignInButtons callbackURL={callbackURL} />
        )}
      </div>
      <div className="flex items-center gap-3 text-muted-foreground text-xs">
        <span className="h-px flex-1 bg-border" />
        {messages.login_or_divider()}
        <span className="h-px flex-1 bg-border" />
      </div>
      <EmailPasswordSignInForm callbackURL={callbackURL} />
    </div>
  );
}
