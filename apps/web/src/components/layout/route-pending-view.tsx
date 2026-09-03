import { useRouterState } from "@tanstack/react-router";
import { BackgroundLayersView } from "@/components/features/home/background-layers";

export function RoutePendingContent({ pathname }: { pathname: string }) {
  if (pathname === "/") {
    return (
      <output
        aria-label="首页正在准备"
        className="relative isolate block h-screen w-full overflow-hidden bg-background"
        data-slot="home-route-pending"
      >
        <BackgroundLayersView />
      </output>
    );
  }

  return (
    <output
      aria-live="polite"
      className="relative flex min-h-[48dvh] items-center justify-center w-full px-6 py-16 text-foreground"
    >
      <div className="absolute inset-x-0 top-0 h-px overflow-hidden bg-border">
        <div className="h-full w-1/3 animate-[route-pending_1.1s_ease-in-out_infinite] bg-primary" />
      </div>
      <p className="text-muted-foreground text-sm">正在加载</p>
    </output>
  );
}

export function RoutePendingView() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return <RoutePendingContent pathname={pathname} />;
}
