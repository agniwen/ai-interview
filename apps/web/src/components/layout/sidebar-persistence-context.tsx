"use client";

import { createContext, use, useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_MENU_OPEN_COOKIE_NAME,
  SIDEBAR_MENU_OPEN_STORAGE_KEY,
  SIDEBAR_OPEN_COOKIE_NAME,
  SIDEBAR_OPEN_STORAGE_KEY,
} from "@/lib/sidebar-persistence";
import type { SidebarInitialState } from "@/lib/sidebar-persistence";

interface SidebarPersistenceState extends SidebarInitialState {
  setMenuOpen: Dispatch<SetStateAction<Record<string, boolean>>>;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

const SidebarPersistenceContext = createContext<SidebarPersistenceState | null>(null);

export function SidebarPersistenceProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: SidebarInitialState;
}) {
  const [open, setOpen] = useState(value.open);
  const [menuOpen, setMenuOpen] = useState(value.menuOpen);

  useEffect(() => {
    const browserWindow = globalThis.window;
    if (!browserWindow) {
      return;
    }
    browserWindow.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, JSON.stringify(open));
    browserWindow.document.cookie = `${SIDEBAR_OPEN_COOKIE_NAME}=${open}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
  }, [open]);

  useEffect(() => {
    const serialized = JSON.stringify(menuOpen);
    const browserWindow = globalThis.window;
    if (!browserWindow) {
      return;
    }
    browserWindow.localStorage.setItem(SIDEBAR_MENU_OPEN_STORAGE_KEY, serialized);
    browserWindow.document.cookie = `${SIDEBAR_MENU_OPEN_COOKIE_NAME}=${encodeURIComponent(serialized)}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
  }, [menuOpen]);

  const contextValue = useMemo(
    () => ({ menuOpen, open, setMenuOpen, setOpen }),
    [menuOpen, open, setMenuOpen, setOpen],
  );

  return <SidebarPersistenceContext value={contextValue}>{children}</SidebarPersistenceContext>;
}

export function useSidebarPersistence(): SidebarPersistenceState {
  const context = use(SidebarPersistenceContext);
  if (!context) {
    throw new Error("useSidebarPersistence must be used within SidebarPersistenceProvider");
  }
  return context;
}
