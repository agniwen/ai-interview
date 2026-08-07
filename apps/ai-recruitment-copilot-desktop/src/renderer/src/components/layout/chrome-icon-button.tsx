import type { CSSProperties } from "react";
import { cn } from "@arc/shared/utils";

/** Electron frameless windows need an explicit no-drag on every chrome control. */
const noDragStyle = {
  WebkitAppRegion: "no-drag",
  appRegion: "no-drag",
} as CSSProperties;

/**
 * Shared chrome control style (sidebar history nav, sidebar toggle, content
 * settings): plain icon, no fill box — opacity shift on hover only.
 * Fixed hit target keeps spacing even across icons.
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
        "app-no-drag flex size-7 shrink-0 items-center justify-center text-muted-foreground opacity-80 transition-opacity enabled:hover:opacity-100 disabled:opacity-25",
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
