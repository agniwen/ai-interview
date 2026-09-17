import type { ReactNode } from "react";
import { cn } from "@app/shared/utils";
import { IconArrowLeft } from "@tabler/icons-react";
import { Link, useRouter } from "@tanstack/react-router";
import { BackgroundLayers } from "@/components/features/home/background-layers";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import * as m from "@/paraglide/messages";

export function AuthPageLayout({
  children,
  contentClassName,
  backBehavior = "home",
}: {
  children: ReactNode;
  contentClassName?: string;
  backBehavior?: "home" | "history";
}) {
  const router = useRouter();
  return (
    <main className="relative min-h-dvh overflow-hidden" id="main-content">
      <BackgroundLayers />

      <section className="relative flex min-h-dvh w-full border-border/70 border-r bg-background/90 backdrop-blur-md backdrop-saturate-100 md:w-[34rem] lg:w-[38rem]">
        <div className="mx-auto flex w-full max-w-md flex-col px-6 py-4 sm:px-10 lg:px-12">
          {backBehavior === "history" ? (
            <Button
              aria-label="返回上一页"
              className="-ml-2"
              onClick={() => router.history.back()}
              size="icon-sm"
              variant="ghost"
            >
              <IconArrowLeft />
            </Button>
          ) : (
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
          )}

          <div className={cn("my-auto flex flex-col py-12", contentClassName)}>{children}</div>
        </div>
      </section>

      <div className="fixed top-4 right-4 flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </main>
  );
}
