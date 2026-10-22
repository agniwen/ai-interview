import type { ReactNode } from "react";
import { cn } from "@app/shared/utils";
import { IconArrowLeft } from "@tabler/icons-react";
import { Link, useRouter } from "@tanstack/react-router";
import { SkyBackdrop } from "@/components/features/sky/sky-backdrop";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import * as m from "@/paraglide/messages";

function AuthBackButton({
  backBehavior,
  className,
}: {
  backBehavior: "home" | "history";
  className?: string;
}) {
  const router = useRouter();
  return backBehavior === "history" ? (
    <Button
      aria-label="返回上一页"
      className={className}
      onClick={() => router.history.back()}
      size="icon-sm"
      variant="ghost"
    >
      <IconArrowLeft />
    </Button>
  ) : (
    <Button
      aria-label={m.login_back_home()}
      className={className}
      nativeButton={false}
      render={<Link to="/" />}
      size="icon-sm"
      variant="ghost"
    >
      <IconArrowLeft />
    </Button>
  );
}

export function AuthPageLayout({
  children,
  contentClassName,
  panelClassName,
  backBehavior = "home",
}: {
  children: ReactNode;
  contentClassName?: string;
  panelClassName?: string;
  backBehavior?: "home" | "history";
}) {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden" id="main-content">
      {/* 与首页首屏同一套天空背景。 Same sky backdrop as the homepage hero. */}
      <SkyBackdrop />

      <section
        className={cn(
          "relative flex min-h-dvh w-full border-border/70 border-r bg-background/90 backdrop-blur-md backdrop-saturate-100 md:w-[34rem] lg:w-[38rem]",
          panelClassName,
        )}
      >
        <div className="mx-auto flex w-full max-w-md flex-col px-6 py-4 sm:px-10 lg:px-12">
          <div className="h-7 shrink-0">
            <AuthBackButton backBehavior={backBehavior} className="-ml-2 hidden md:inline-flex" />
          </div>

          <div className={cn("my-auto flex flex-col py-12", contentClassName)}>{children}</div>
        </div>
      </section>

      <div className="fixed top-4 left-4 md:hidden">
        <AuthBackButton backBehavior={backBehavior} />
      </div>
      <div className="fixed top-4 right-4 flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </main>
  );
}
