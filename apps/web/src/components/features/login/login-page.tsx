import { AuthPageLayout } from "@/components/features/auth/auth-page-layout";
import { SignInTabs } from "@/components/features/auth/sign-in-tabs";
import { FeishuAccountMigration } from "@/components/features/auth/feishu-account-migration";
import { isFeishuMigrationEnabled } from "@/components/features/auth/feishu-sign-in-buttons";
import { LoginErrorToast } from "@/components/features/login/login-error-toast";
import { useFeishuLoginProviderIds } from "@/lib/client/feishu-auth-config";
import * as m from "@/paraglide/messages";

interface LoginPageProps {
  callbackURL: string;
  backBehavior?: "home" | "history";
  error?: string;
  errorDescription?: string;
  feishuMigration?: boolean;
}

export function LoginPage({
  callbackURL,
  backBehavior,
  error,
  errorDescription,
  feishuMigration,
}: LoginPageProps) {
  const providerIds = useFeishuLoginProviderIds();
  const showMigration = Boolean(feishuMigration && isFeishuMigrationEnabled(providerIds));
  return (
    <AuthPageLayout backBehavior={backBehavior}>
      <div className="flex flex-col gap-2">
        <h1 className="font-medium text-2xl text-foreground tracking-tight sm:text-3xl">
          {m.login_heading()}
        </h1>
        <p className="text-muted-foreground text-sm leading-6">{m.login_description()}</p>
      </div>

      <div className="mt-8">
        {showMigration ? (
          <FeishuAccountMigration callbackURL={callbackURL} error={error} />
        ) : (
          <SignInTabs callbackURL={callbackURL} />
        )}
      </div>
      {error && !showMigration ? (
        <LoginErrorToast errorCode={error} errorDescription={errorDescription} />
      ) : null}
    </AuthPageLayout>
  );
}
