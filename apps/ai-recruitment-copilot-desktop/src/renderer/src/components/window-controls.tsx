import type { IpcRendererEvent } from "electron";
import { useEffect, useState } from "react";

function ControlButton({
  ariaLabel,
  children,
  className,
  onClick,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-label={ariaLabel}
      className={`app-no-drag flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent/80 ${className ?? ""}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function MinimizeIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="h-2.5 w-2.5" fill="none" viewBox="0 0 10 1">
      <path d="M0 0.5h10" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function MaximizeIcon({ maximized }: { maximized: boolean }): React.JSX.Element {
  if (maximized) {
    return (
      <svg aria-hidden="true" className="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10">
        <path
          d="M2.5 3.5h5v5h-5zM3.5 2.5h4.5a1 1 0 0 1 1 1V8"
          stroke="currentColor"
          strokeWidth="1.1"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10">
      <rect
        height="7.5"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1.1"
        width="7.5"
        x="1.25"
        y="1.25"
      />
    </svg>
  );
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10">
      <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
    </svg>
  );
}

export function WindowControls(): React.JSX.Element | null {
  const [maximized, setMaximized] = useState(false);
  const { platform } = window.api.window;

  useEffect(() => {
    if (platform === "darwin") {
      return;
    }

    let disposed = false;

    const syncMaximized = async (): Promise<void> => {
      const value = await window.api.window.isMaximized();
      if (!disposed) {
        setMaximized(value);
      }
    };

    void syncMaximized();

    const handleMaximizedChanged = (_event: IpcRendererEvent, nextMaximized: boolean): void => {
      setMaximized(nextMaximized);
    };

    window.electron.ipcRenderer.on("window:maximized-changed", handleMaximizedChanged);

    return () => {
      disposed = true;
      window.electron.ipcRenderer.removeListener(
        "window:maximized-changed",
        handleMaximizedChanged,
      );
    };
  }, [platform]);

  if (platform === "darwin") {
    return null;
  }

  return (
    <div className="app-no-drag flex h-full items-stretch">
      <ControlButton
        ariaLabel="最小化"
        onClick={() => {
          void window.api.window.minimize();
        }}
      >
        <MinimizeIcon />
      </ControlButton>
      <ControlButton
        ariaLabel={maximized ? "还原" : "最大化"}
        onClick={() => {
          void (async () => {
            const next = await window.api.window.maximize();
            setMaximized(next);
          })();
        }}
      >
        <MaximizeIcon maximized={maximized} />
      </ControlButton>
      <ControlButton
        ariaLabel="关闭"
        className="hover:bg-destructive hover:text-white active:bg-destructive/90"
        onClick={() => {
          void window.api.window.close();
        }}
      >
        <CloseIcon />
      </ControlButton>
    </div>
  );
}
