import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

const NAV_MAX_INDEX_KEY = "arc-desktop-nav-max-index";

function readPersistedMaxIndex(): number {
  try {
    const stored = Number(localStorage.getItem(NAV_MAX_INDEX_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  } catch {
    return 0;
  }
}

function writePersistedMaxIndex(value: number): void {
  try {
    localStorage.setItem(NAV_MAX_INDEX_KEY, String(value));
  } catch {
    // Ignore; tracking still works for the current session.
  }
}

interface HistoryNavState {
  canBack: boolean;
  canForward: boolean;
}

/**
 * Cursor-style back/forward buttons for the title bar.
 *
 * TanStack's history exposes `canGoBack` but not `canGoForward`, so we track
 * the session's `__TSR_index` ourselves: each push assigns current+1 and
 * truncates the browser's forward stack, so after a push the new index IS the
 * top of the stack; BACK/FORWARD/GO move within `[0, maxIndex]`. The max is
 * persisted so it survives reloads / HMR.
 *
 * Visual style mirrors the title-bar settings button: plain icon, no padding
 * box, no hover background — just an opacity shift on hover. Double-clicks
 * must not bubble to the title bar's double-click maximize.
 */
function NavButton({
  ariaLabel,
  children,
  disabled,
  onClick,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-label={ariaLabel}
      className="flex items-center justify-center p-0.5 text-muted-foreground opacity-80 transition-opacity enabled:hover:opacity-100 disabled:opacity-25"
      disabled={disabled}
      onClick={onClick}
      onDoubleClick={(event) => event.stopPropagation()}
      type="button"
    >
      {children}
    </button>
  );
}

export function HistoryNav(): React.JSX.Element {
  const router = useRouter();
  const maxIndexRef = useRef(0);
  const [nav, setNav] = useState<HistoryNavState>(() => {
    const index = router.history.location.state.__TSR_index;
    maxIndexRef.current = index === 0 ? 0 : Math.max(index, readPersistedMaxIndex());
    return { canBack: index > 0, canForward: index < maxIndexRef.current };
  });

  useEffect(() => {
    const update = (action: "PUSH" | "REPLACE" | "BACK" | "FORWARD" | "GO"): void => {
      const index = router.history.location.state.__TSR_index;
      maxIndexRef.current = action === "PUSH" ? index : Math.max(maxIndexRef.current, index);
      writePersistedMaxIndex(maxIndexRef.current);
      setNav({ canBack: index > 0, canForward: index < maxIndexRef.current });
    };

    // subscribe does not fire immediately — sync once on mount.
    update("REPLACE");

    return router.history.subscribe(({ action }) => {
      update(action.type);
    });
  }, [router]);

  return (
    <div className="app-no-drag flex h-full items-center gap-1">
      <NavButton ariaLabel="后退" disabled={!nav.canBack} onClick={() => router.history.back()}>
        <IconArrowLeft className="size-4" stroke={1.75} />
      </NavButton>
      <NavButton
        ariaLabel="前进"
        disabled={!nav.canForward}
        onClick={() => router.history.forward()}
      >
        <IconArrowRight className="size-4" stroke={1.75} />
      </NavButton>
    </div>
  );
}
