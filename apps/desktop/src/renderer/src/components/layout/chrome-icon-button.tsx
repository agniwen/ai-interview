import type { CSSProperties } from "react";
import { cn } from "@arc/shared/utils";

/** Electron frameless windows need an explicit no-drag on every chrome control. */
interface ElectronNoDragStyle extends CSSProperties {
  WebkitAppRegion: "no-drag";
  appRegion: "no-drag";
}

const noDragStyle: ElectronNoDragStyle = {
  WebkitAppRegion: "no-drag",
  appRegion: "no-drag",
};

/** Shared square chrome icon control (toggle / history / settings). */
export const chromeIconControlClassName =
  "app-no-drag flex size-6 shrink-0 items-center justify-center rounded-[8px] text-foreground transition-colors hover:bg-foreground/8 dark:hover:bg-foreground/12";

/**
 * Shared chrome control style (sidebar history nav, sidebar toggle, content
 * settings): square hit target, foreground icon, gray hover fill + light radius.
 */
export function ChromeIconButton({
  ariaLabel,
  children,
  className,
  disabled,
  onClick,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        chromeIconControlClassName,
        "disabled:pointer-events-none disabled:opacity-25",
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      onDoubleClick={(event) => event.stopPropagation()}
      style={noDragStyle}
      type="button"
    >
      {children}
    </button>
  );
}
