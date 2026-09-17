import { z } from "zod";

export const SIDEBAR_OPEN_COOKIE_NAME = "sidebar_state";
export const SIDEBAR_MENU_OPEN_COOKIE_NAME = "sidebar_menu_state";
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const SIDEBAR_OPEN_STORAGE_KEY = "arc:sidebar-open";
export const SIDEBAR_MENU_OPEN_STORAGE_KEY = "arc:sidebar-menu-open";

export interface SidebarInitialState {
  menuOpen: Record<string, boolean>;
  open: boolean;
}

const sidebarMenuOpenSchema = z.record(z.string(), z.unknown()).transform((value) =>
  Object.fromEntries(
    Object.entries(value).flatMap(([key, entryValue]) => {
      const parsed = z.boolean().safeParse(entryValue);
      return parsed.success ? [[key, parsed.data]] : [];
    }),
  ),
);

export function parseSidebarInitialState(
  sidebarOpenCookie?: string,
  sidebarMenuOpenCookie?: string,
): SidebarInitialState {
  let menuOpen: Record<string, boolean> = {};

  if (sidebarMenuOpenCookie) {
    try {
      const parsed = sidebarMenuOpenSchema.safeParse(
        JSON.parse(decodeURIComponent(sidebarMenuOpenCookie)),
      );
      if (parsed.success) {
        menuOpen = parsed.data;
      }
    } catch {
      // Ignore malformed preference cookies and use the default state.
    }
  }

  return {
    menuOpen,
    open: sidebarOpenCookie !== "false",
  };
}
