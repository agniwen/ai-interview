import { BeamBackdrop } from "@/components/features/beam/beam-backdrop";
import { SignInOptions } from "@/components/features/auth/sign-in-options";
import { FeishuAccountMigration } from "@/components/features/auth/feishu-account-migration";
import { isFeishuMigrationEnabled } from "@/components/features/auth/feishu-sign-in-buttons";
import { LoginErrorToast } from "@/components/features/login/login-error-toast";
import { LoginPageActions } from "@/components/features/login/login-page-actions";
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
  backBehavior = "home",
  error,
  errorDescription,
  feishuMigration,
}: LoginPageProps) {
  const providerIds = useFeishuLoginProviderIds();
  const showMigration = Boolean(feishuMigration && isFeishuMigrationEnabled(providerIds));
  return (
    <main className="min-h-dvh bg-background p-6" id="main-content">
      <div className="grid min-h-[calc(100dvh-3rem)] w-full gap-12 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col items-center">
          <div className="flex w-full max-w-84 flex-1 flex-col justify-center py-10">
            <div className="flex flex-col gap-2 text-center">
              <h1 className="font-medium text-2xl text-foreground tracking-tight">
                {m.login_heading()}
              </h1>
              <p className="text-muted-foreground text-sm leading-6">{m.login_description()}</p>
            </div>

            <div className="mt-8">
              {showMigration ? (
                <FeishuAccountMigration callbackURL={callbackURL} error={error} />
              ) : (
                <SignInOptions callbackURL={callbackURL} />
              )}
            </div>

            <div className="mt-10">
              <LoginPageActions backBehavior={backBehavior} />
            </div>
          </div>
        </section>

        <BeamBackdrop className="relative hidden min-h-96 rounded-3xl lg:block" />
      </div>
      {error && !showMigration ? (
        <LoginErrorToast errorCode={error} errorDescription={errorDescription} />
      ) : null}
    </main>
  );
}
