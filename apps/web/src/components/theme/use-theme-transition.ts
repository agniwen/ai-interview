"use client";

import { useTheme } from "next-themes";
import { flushSync } from "react-dom";

// Shared by all theme controls in this document; a later selection wins.
let activeTransition: ViewTransition | undefined;
let selectionId = 0;

async function finishTransition(transition: ViewTransition, id: number) {
  // Skipped snapshots can reject ready; failed updates can reject finished.
  await Promise.allSettled([transition.ready, transition.finished]);
  if (selectionId === id) {
    activeTransition = undefined;
    delete document.documentElement.dataset.themeTransition;
  }
}

export function runThemeTransition(update: () => void, animate = true) {
  selectionId += 1;
  const id = selectionId;
  activeTransition?.skipTransition();
  activeTransition = undefined;
  const root = document.documentElement;
  delete root.dataset.themeTransition;

  if (
    !animate ||
    !document.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }

  root.dataset.themeTransition = "triangle-blur";
  const transition = document.startViewTransition(() => {
    if (selectionId === id) {
      // Commit next-themes' DOM update before the browser captures the new theme.
      flushSync(update);
    }
  });
  activeTransition = transition;
  void finishTransition(transition, id);
}

export function useThemeTransition() {
  const { theme, resolvedTheme, systemTheme, forcedTheme, setTheme } = useTheme();

  function selectTheme(value: string, details?: { event: Event }) {
    const nextResolvedTheme = value === "system" ? systemTheme : value;
    runThemeTransition(
      () => setTheme(value),
      !forcedTheme && nextResolvedTheme !== resolvedTheme && !details?.event.type.startsWith("key"),
    );
  }

  return { setTheme: selectTheme, theme };
}
