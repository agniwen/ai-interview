import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChromeIconButton } from "@/components/layout/chrome-icon-button";
import { Icon } from "@/components/ui/icon";

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
 * Cursor-style back/forward buttons for the sidebar top drag strip (right).
 *
 * TanStack's history exposes `canGoBack` but not `canGoForward`, so we track
 * the session's `__TSR_index` ourselves. Hosted by `SidebarDragRegion` and
 * hidden on `/settings`.
 */
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
    <div className="app-no-drag flex h-full items-center gap-0">
      <ChromeIconButton
        ariaLabel="后退"
        disabled={!nav.canBack}
        onClick={() => router.history.back()}
      >
        <Icon className="size-4" icon="ph:arrow-left" />
      </ChromeIconButton>
      <ChromeIconButton
        ariaLabel="前进"
        disabled={!nav.canForward}
        onClick={() => router.history.forward()}
      >
        <Icon className="size-4" icon="ph:arrow-right" />
      </ChromeIconButton>
    </div>
  );
}
