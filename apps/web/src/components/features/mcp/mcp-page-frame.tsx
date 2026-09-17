import type { ReactNode } from "react";
export function McpPageFrame({ children }: { children: ReactNode }) {
  return (
    <main
      id="main-content"
      className="flex min-h-dvh items-center justify-center bg-background px-6 py-12"
    >
      <section className="w-full max-w-lg space-y-6 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        {children}
      </section>
    </main>
  );
}
