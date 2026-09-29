import type { ReactNode } from "react";
import { cn } from "@app/shared/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { InterviewEntryBackground } from "@/components/features/interview/interview-background";

export function InterviewEntryShell({
  children,
  mobileAction,
  hideMobileTheme = false,
}: {
  children: ReactNode;
  mobileAction?: ReactNode;
  hideMobileTheme?: boolean;
}) {
  return (
    <main className="relative isolate h-dvh w-full bg-background text-foreground">
      <InterviewEntryBackground />
      <div className={cn("fixed top-3 right-4 z-10", hideMobileTheme && "hidden md:block")}>
        <ThemeToggle />
      </div>
      <ScrollArea className="h-full w-full" scrollFade scrollbars="leave">
        <div
          className={cn(
            "flex min-h-full w-full items-start justify-center px-4 pt-12 sm:px-10 sm:pt-[clamp(3rem,10dvh,6rem)]",
            mobileAction ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-8" : "pb-4 sm:pb-8",
          )}
        >
          {children}
        </div>
      </ScrollArea>
      {mobileAction ? (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md md:hidden">
          <div className="mx-auto w-full max-w-xl">{mobileAction}</div>
        </div>
      ) : null}
    </main>
  );
}
