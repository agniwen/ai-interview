export function RoutePendingView() {
  return (
    <output
      aria-live="polite"
      className="relative flex min-h-[48dvh] items-center justify-center px-6 py-16 text-foreground"
    >
      <div className="absolute inset-x-0 top-0 h-px overflow-hidden bg-border">
        <div className="h-full w-1/3 animate-[route-pending_1.1s_ease-in-out_infinite] bg-foreground/55" />
      </div>
      <p className="text-muted-foreground text-sm">正在加载</p>
    </output>
  );
}
