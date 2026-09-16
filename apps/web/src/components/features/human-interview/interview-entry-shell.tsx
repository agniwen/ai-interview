import type { ReactNode } from "react";
import { cn } from "@app/shared/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function InterviewEntryShell({
  children,
  mobileAction,
}: {
  children: ReactNode;
  mobileAction?: ReactNode;
}) {
  return (
    <main className="relative isolate h-dvh w-full bg-background text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-[url('/illustrations/interview/courtyard-light.png')] bg-cover bg-center opacity-20 dark:bg-[url('/illustrations/interview/courtyard-dark.png')]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(to_right,transparent,var(--background)_25%,var(--background)_75%,transparent)] opacity-80"
      />
      <div className="fixed top-3 right-4 z-10">
        <ThemeToggle />
      </div>
      <ScrollArea className="h-full w-full" orientation="vertical" scrollFade>
        <div
          className={cn(
            "flex min-h-full w-full items-start justify-center px-4 pt-12 sm:px-10 sm:pt-[clamp(3rem,10dvh,6rem)]",
            mobileAction ? "pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8" : "pb-4 sm:pb-8",
          )}
        >
          {children}
        </div>
      </ScrollArea>
      {mobileAction ? (
        <div className="fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-20 md:hidden">
          {mobileAction}
        </div>
      ) : null}
    </main>
  );
}
