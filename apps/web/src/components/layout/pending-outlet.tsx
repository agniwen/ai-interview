import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { cn } from "@app/shared/utils";

export function PendingOutlet({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const isRouteLoading = useRouterState({
    select: (state) => {
      const isPathTransition = state.resolvedLocation
        ? state.location.pathname !== state.resolvedLocation.pathname
        : state.isLoading;
      return state.isLoading && isPathTransition;
    },
  });

  return (
    <div
      aria-busy={isRouteLoading}
      className={cn(
        "transition-opacity duration-200 ease-out",
        isRouteLoading && "opacity-70",
        className,
      )}
    >
      {children}
    </div>
  );
}
