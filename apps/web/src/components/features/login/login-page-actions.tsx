import { Link, useRouter } from "@tanstack/react-router";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import * as m from "@/paraglide/messages";

function LoginBackButton({ backBehavior }: { backBehavior: "home" | "history" }) {
  const router = useRouter();
  if (backBehavior === "history") {
    return (
      <Button onClick={() => router.history.back()} size="sm" type="button" variant="ghost">
        返回上一页
      </Button>
    );
  }
  return (
    <Button nativeButton={false} render={<Link to="/" />} size="sm" variant="ghost">
      {m.login_back_home()}
    </Button>
  );
}

/**
 * 登录表单下方的次要操作：返回、切换语言、切换主题，统一用 ghost 按钮。
 * Secondary actions under the sign-in form (back, language, theme), all ghost buttons.
 */
export function LoginPageActions({ backBehavior }: { backBehavior: "home" | "history" }) {
  return (
    <div className="flex items-center justify-center gap-1 text-muted-foreground">
      <LoginBackButton backBehavior={backBehavior} />
      <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
      <LanguageToggle />
      <ThemeToggle />
    </div>
  );
}
