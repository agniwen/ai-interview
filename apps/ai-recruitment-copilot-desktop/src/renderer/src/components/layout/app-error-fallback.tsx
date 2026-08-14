import { Button } from "@/components/ui/button";
import { WindowControls } from "@/components/window-controls";
import { handleTitleBarDoubleClick } from "@/components/layout/chrome";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return "发生了未知错误";
}

/**
 * Full-window error surface: the page is a drag region, the message sits
 * in the center, and reload is the only interactive control.
 */
export function AppErrorFallback({ error, onReload }: { error: unknown; onReload: () => void }) {
  return (
    <main className="relative h-full min-h-0 bg-background text-foreground">
      <div className="app-drag absolute inset-0" onDoubleClick={handleTitleBarDoubleClick} />
      {typeof window !== "undefined" && window.api ? (
        <div className="app-no-drag absolute inset-y-0 right-0 z-10">
          <WindowControls />
        </div>
      ) : null}
      <div className="pointer-events-none relative z-10 flex h-full flex-col items-center justify-center px-6">
        <div className="app-no-drag pointer-events-auto flex w-full max-w-sm flex-col items-center gap-5 text-center">
          <div className="space-y-2">
            <h1 className="font-medium text-2xl tracking-tight">出了点问题</h1>
            <p className="text-muted-foreground text-sm leading-6">{errorMessage(error)}</p>
          </div>
          <Button aria-label="重新加载并回到首页" onClick={onReload} type="button">
            重新加载
          </Button>
        </div>
      </div>
    </main>
  );
}
