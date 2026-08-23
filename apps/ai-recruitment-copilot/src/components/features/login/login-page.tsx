import { IconArrowLeft } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { SignInTabs } from "@/components/features/auth/sign-in-tabs";
import { BackgroundLayers } from "@/components/features/home/background-layers";
import { LoginErrorToast } from "@/components/features/login/login-error-toast";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { Button } from "@/components/ui/button";
import * as m from "@/paraglide/messages";

interface LoginPageProps {
  callbackURL: string;
  error?: string;
  errorDescription?: string;
}

export function LoginPage({ callbackURL, error, errorDescription }: LoginPageProps) {
  return (
    <main className="relative min-h-dvh overflow-hidden" id="main-content">
      <BackgroundLayers />

      <div className="fixed top-4 right-4 flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <section className="relative flex min-h-dvh w-full border-border/70 border-r bg-background/90 backdrop-blur-md backdrop-saturate-100 md:w-[34rem] lg:w-[38rem]">
        <div className="mx-auto flex w-full max-w-md flex-col px-6 py-4 sm:px-10 lg:px-12">
          <Button
            aria-label={m.login_back_home()}
            className="-ml-2"
            nativeButton={false}
            render={<Link to="/" />}
            size="icon-sm"
            variant="ghost"
          >
            <IconArrowLeft />
          </Button>

          <div className="my-auto flex flex-col py-12">
            <div className="flex flex-col gap-2">
              <h1 className="font-medium text-2xl text-foreground tracking-tight sm:text-3xl">
                {m.login_heading()}
              </h1>
              <p className="text-muted-foreground text-sm leading-6">{m.login_description()}</p>
            </div>

            <div className="mt-8">
              <SignInTabs callbackURL={callbackURL} />
            </div>
          </div>
        </div>
      </section>

      {error ? <LoginErrorToast errorCode={error} errorDescription={errorDescription} /> : null}
    </main>
  );
}
